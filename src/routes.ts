import { S3, AWSError } from "aws-sdk";
import { Request, RequestHandler } from "express";
import { PutObjectRequest, GetObjectRequest } from "aws-sdk/clients/s3";
import * as crypto from "crypto";
import config from "./config";
import { DB } from "./db";
import { bucketToS3Format } from "./lib";

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

      const objStream = this.s3.getObject(downloadParams).createReadStream();
      objStream
        .on("error", (err: AWSError) => {
          if (err.statusCode == 404)
            return next({ status: 404, msg: "Version not found" });
          return next({ status: 502, msg: err });
        })
        .pipe(res);
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
        if (checksum != expectedChecksum) {
          reject({ status: 400, msg: "Checksum does not match file contents" });
        }
        resolve();
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
