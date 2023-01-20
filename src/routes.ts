import {
  CompleteMultipartUploadCommandOutput,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { AbortController } from "@aws-sdk/abort-controller";
import { RequestHandler } from "express";
import * as crypto from "crypto";
import config from "./config";
import { DB } from "./db";
import { bucketToS3Format } from "./lib";
import { Readable, PassThrough } from "node:stream";

interface Params {
  bucket: string;
  key: string;
}

export class Routes {
  constructor(s3: S3Client, db: DB) {
    this.s3 = s3;
    this.db = db;
  }

  readonly s3: S3Client;
  readonly db: DB;
  readonly S3_BAD_HASH_ERROR_CODE = "BadDigest";

  putFile: RequestHandler = async (req, res, next) => {
    const params: Params = req.params as any;
    const expectedChecksum = req.headers["content-md5"] as string | undefined;
    if (!expectedChecksum)
      return next({ status: 400, msg: "Content-MD5 header is missing" });

    const uploadAbort = new AbortController();
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

      const bucketName = this.getFullBucketName(
        bucketToS3Format(params.bucket),
        currentBucketId
      );

      const multipartUpload = new Upload({
        client: this.s3,
        params: {
          Bucket: bucketName,
          Key: params.key,
          Body: req,
          ContentType:
            req.headers["content-type"] || "application/octet-stream",
        },
        abortController: uploadAbort,
      });

      const [, uploadRes] = await Promise.all([
        this.checkHash(req, expectedChecksum),
        multipartUpload.done(),
      ]);
      const size = await this.getSizeOfS3Obj(params.key, bucketName);

      if (exists) {
        res.status(200);
      } else {
        await this.db.saveObject(params.bucket, currentBucketId, params.key);
        res.status(201);
      }

      return res.send({
        size,
        version: (uploadRes as CompleteMultipartUploadCommandOutput).VersionId,
      });
    } catch (err: any) {
      uploadAbort.abort();
      if (err.status && err.msg)
        return next({ status: err.status, msg: err.msg }); // Client error
      if (err.statusCode) return next({ status: 502, msg: err }); // S3 error
      return next(err); // Internal error
    }
  };

  getFile: RequestHandler = async (req, res, next) => {
    const params: Params = req.params as any;
    if (Array.isArray(req.query.version)) {
      return next({ status: 400, msg: "Multiple versions given" });
    }
    const version = (req.query.version as string) || undefined;
    try {
      const { bucketId } = await this.db.selectBucketId(
        params.bucket,
        params.key
      );
      if (bucketId === null)
        return next({ status: 404, msg: "File not found" });
      const bucket = this.getFullBucketName(params.bucket, bucketId);

      const downloadCmd = new GetObjectCommand({
        Bucket: bucketToS3Format(bucket),
        Key: params.key,
        VersionId: version,
      });

      const obj = await this.s3.send(downloadCmd);
      (obj.Body as Readable)
        .on("error", (err: any) => {
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
    const deleteCmd = new GetObjectCommand({
      Bucket: bucketToS3Format(req.params.bucket),
      Key: req.params.key,
    });
    try {
      await this.s3.send(deleteCmd);
      await this.db.deleteObject(params.bucket, params.key);
      res.sendStatus(200);
    } catch (err: any) {
      return next({ status: 502, msg: err });
    }
  };

  private checkHash(req: Readable, expectedChecksum: string): Promise<void> {
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

  private async getSizeOfS3Obj(key: string, bucket: string) {
    const headCmd = new HeadObjectCommand({ Key: key, Bucket: bucket });
    const headRes = await this.s3.send(headCmd);
    return headRes.ContentLength;
  }

  private getFullBucketName(bucket: string, bucketId: number) {
    if (bucketId == 0) return bucket;
    return `${bucket}-${bucketId}`;
  }
}
