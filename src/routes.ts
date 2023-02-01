import { S3 } from "aws-sdk";
import { Request, RequestHandler } from "express";
import { PutObjectRequest, GetObjectRequest } from "aws-sdk/clients/s3";
import * as crypto from "crypto";
import config from "./config";
import { DB } from "./db";
import { bucketToS3Format } from "./lib";
import { Writable } from "node:stream";

interface Params {
  bucket: string;
  key: string;
}

export class Routes {
  constructor(s3: S3, db: DB) {
    this.s3 = s3;
    this.db = db;
  }

  readonly s3: S3;
  readonly db: DB;
  readonly S3_BAD_HASH_ERROR_CODE = "BadDigest";

  putFile: RequestHandler = async (req, res, next) => {
    const params: Params = req.params as any;
    const expectedChecksum = req.headers["content-md5"] as string | undefined;
    if (!expectedChecksum)
      return next({ status: 400, msg: "Content-MD5 header is missing" });

    let managedUpload;
    try {
      const { bucketId } = await this.db.selectBucketId(
        params.bucket,
        params.key
      ); // File exists
      let currentBucketId = bucketId;
      const exists = currentBucketId !== null;
      if (!exists) {
        // New file
        // eslint-disable-next-line prefer-const
        let { bucketId, objectCount } =
          await this.db.selectObjectCountAndBucketId(params.bucket);
        if (
          objectCount >=
          config.maxObjectsPerBucket(params.bucket) * (bucketId + 1)
        ) {
          bucketId = await this.db.increaseBucketId(params.bucket);
        }
        currentBucketId = bucketId;
      }

      const uploadParams: PutObjectRequest = {
        Bucket: this.getFullBucketName(
          bucketToS3Format(params.bucket),
          currentBucketId
        ),
        Key: params.key,
        Body: req,
        ContentType: req.headers["content-type"] || "application/octet-stream",
      };

      managedUpload = this.s3.upload(uploadParams);
      const [, uploadRes] = await Promise.all([
        this.checkHash(req, expectedChecksum),
        managedUpload.promise(),
      ]);
      const size = await this.getSizeOfS3Obj(uploadParams);

      if (exists) {
        res.status(200);
      } else {
        await this.db.saveObject(params.bucket, currentBucketId, params.key);
        res.status(201);
      }

      return res.send({ size, version: (uploadRes as any).VersionId });
    } catch (err: any) {
      if (managedUpload) managedUpload.abort();
      if (err.status && err.msg)
        return next({ status: err.status, msg: err.msg }); // Client error
      if (err.statusCode) return next({ status: 502, msg: err }); // S3 error
      return next(err); // Internal error
    }
  };

  private async streamFile(
    params: GetObjectRequest,
    output: Writable
  ): Promise<void> {
    const meta = await this.s3.headObject(params).promise();
    const totalBytes = meta.ContentLength;
    if (!totalBytes) {
      return Promise.reject("invalid content length");
    }
    const chunkSize = 5 * 1024 * 1024;
    let bytesRead = 0;
    return new Promise((resolve, reject) => {
      const nextChunk = () => {
        this.s3
          .getObject({
            ...params,
            Range: `bytes=${bytesRead}-${
              Math.min(bytesRead + chunkSize, totalBytes) - 1
            }`,
            IfMatch: meta.ETag,
          })
          .createReadStream()
          .on("error", reject)
          .on("end", () => {
            bytesRead += chunkSize;
            if (bytesRead < totalBytes) {
              nextChunk();
            } else {
              output.end();
              resolve();
            }
          })
          .pipe(output, { end: false });
      };
      nextChunk();
    });
  }

  getFile: RequestHandler = async (req, res, next) => {
    const params: Params = req.params as any;
    try {
      const { bucketId } = await this.db.selectBucketId(
        params.bucket,
        params.key
      );
      if (bucketId === null)
        return next({ status: 404, msg: "File not found" });
      const bucket = this.getFullBucketName(params.bucket, bucketId);

      const downloadParams: GetObjectRequest = {
        Bucket: bucketToS3Format(bucket),
        Key: params.key,
        VersionId: req.query.version as string,
      };

      await this.streamFile(downloadParams, res);
    } catch (err: any) {
      next(err);
    }
  };

  deleteVolatileFile: RequestHandler = async (req, res, next) => {
    const params: Params = req.params as any;
    const deleteParams: GetObjectRequest = {
      Bucket: bucketToS3Format(req.params.bucket),
      Key: req.params.key,
    };
    try {
      await this.s3.deleteObject(deleteParams).promise();
    } catch (err: any) {
      next({ status: 502, msg: err });
    }
    await this.db.deleteObject(params.bucket, params.key);
    res.sendStatus(200);
  };

  private checkHash(req: Request, expectedChecksum: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash("md5");
      req.on("data", (data) => hash.update(data));
      req.on("end", () => {
        const checksum = hash.digest("base64");
        if (checksum === expectedChecksum) {
          resolve();
        } else {
          reject({ status: 400, msg: "Checksum does not match file contents" });
        }
      });
    });
  }

  private async getSizeOfS3Obj(params: PutObjectRequest) {
    return this.s3
      .headObject({ Key: params.Key, Bucket: params.Bucket })
      .promise()
      .then((res) => res.ContentLength);
  }

  private getFullBucketName(bucket: string, bucketId: number) {
    if (bucketId == 0) return bucket;
    return `${bucket}-${bucketId}`;
  }
}
