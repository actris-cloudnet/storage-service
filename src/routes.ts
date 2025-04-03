import { S3 } from "aws-sdk";
import { Request, RequestHandler } from "express";
import {
  PutObjectRequest,
  GetObjectRequest,
  HeadObjectRequest,
} from "aws-sdk/clients/s3";
import * as crypto from "crypto";
import config from "./config";
import { DB } from "./db";
import { bucketToS3Format } from "./lib";
import { S3ReadStream } from "./s3readstream";

// Different S3 implementations seem to indicate unversioned objects
// differently. The behavior may also depend on whether PutObject or multipart
// upload was used.
function normalizeVersion(version: string) {
  return version !== "" && version !== "null" ? version : undefined;
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
    const expectedChecksum = req.headers["content-md5"] as string | undefined;
    if (!expectedChecksum)
      return next({ status: 400, msg: "Content-MD5 header is missing" });

    let managedUpload;
    try {
      const { bucketId } = await this.db.selectBucketId(
        req.params.bucket,
        req.params.key
      ); // File exists
      let currentBucketId = bucketId;
      const exists = currentBucketId !== null;
      if (!exists) {
        // New file
        // eslint-disable-next-line prefer-const
        let { bucketId, objectCount } =
          await this.db.selectObjectCountAndBucketId(req.params.bucket);
        if (
          objectCount >=
          config.maxObjectsPerBucket(req.params.bucket) * (bucketId + 1)
        ) {
          bucketId = await this.db.increaseBucketId(req.params.bucket);
        }
        currentBucketId = bucketId;
      }

      const uploadParams: PutObjectRequest = {
        Bucket: this.getFullBucketName(
          bucketToS3Format(req.params.bucket),
          currentBucketId
        ),
        Key: req.params.key,
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
        await this.db.saveObject(
          req.params.bucket,
          currentBucketId,
          req.params.key
        );
        res.status(201);
      }

      res.send({
        size,
        version: normalizeVersion((uploadRes as any).VersionId),
      });
    } catch (err: any) {
      if (managedUpload) managedUpload.abort();
      if (err.status && err.msg)
        return next({ status: err.status, msg: err.msg }); // Client error
      if (err.statusCode) return next({ status: 502, msg: err }); // S3 error
      return next(err); // Internal error
    }
  };

  headFile: RequestHandler = async (req, res, next) => {
    const { bucketId } = await this.db.selectBucketId(
      req.params.bucket,
      req.params.key
    );
    if (bucketId === null) return next({ status: 404, msg: "File not found" });
    const bucket = this.getFullBucketName(req.params.bucket, bucketId);

    const downloadParams: HeadObjectRequest = {
      Bucket: bucketToS3Format(bucket),
      Key: req.params.key,
    };

    if (req.query.version) {
      if (typeof req.query.version !== "string") {
        return next({ status: 400, msg: "Invalid version parameter" });
      }
      downloadParams.VersionId = normalizeVersion(req.query.version);
    }

    try {
      const obj = await this.s3.headObject(downloadParams).promise();
      res.set({ "Content-Length": obj.ContentLength }).status(200).end();
    } catch (e) {
      next(e);
    }
  };

  getFile: RequestHandler = async (req, res, next) => {
    const { bucketId } = await this.db.selectBucketId(
      req.params.bucket,
      req.params.key
    );
    if (bucketId === null) return next({ status: 404, msg: "File not found" });
    const bucket = this.getFullBucketName(req.params.bucket, bucketId);

    const downloadParams: GetObjectRequest = {
      Bucket: bucketToS3Format(bucket),
      Key: req.params.key,
    };

    if (req.query.version) {
      if (typeof req.query.version !== "string") {
        return next({ status: 400, msg: "Invalid version parameter" });
      }
      downloadParams.VersionId = normalizeVersion(req.query.version);
    }

    new S3ReadStream(this.s3, downloadParams).on("error", next).pipe(res);
  };

  deleteVolatileFile: RequestHandler = async (req, res, next) => {
    const deleteParams: GetObjectRequest = {
      Bucket: bucketToS3Format(req.params.bucket),
      Key: req.params.key,
    };
    try {
      await this.s3.deleteObject(deleteParams).promise();
    } catch (err: any) {
      return next({ status: 502, msg: err });
    }
    await this.db.deleteObject(req.params.bucket, req.params.key);
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
