import { RequestHandler } from "express";
import { DB } from "./db";

export class Middleware {
  constructor(db: DB) {
    this.db = db;
  }

  db: DB;

  validateDeleteBucket: RequestHandler = (req, _, next) => {
    const bucket = req.params.bucket;
    const allowedBuckets = [
      "cloudnet-product-volatile",
      "cloudnet-test-volatile",
    ];
    if (!allowedBuckets.includes(bucket))
      return next({ status: 405, msg: "DELETE not allowed for the bucket" });
    return next();
  };

  validateParams: RequestHandler = async (req, _, next) => {
    const bucket = req.params.bucket;
    if (!bucket.match(/^cloudnet-/))
      return next({ status: 404, msg: `Unknown bucket: ${bucket}` });
    const validBucket = await this.db.selectBucket(bucket);
    if (!validBucket)
      return next({ status: 404, msg: `Unknown bucket: ${bucket}` });
    req.params.bucket = validBucket;
    req.params.key = (req.params.key as unknown as string[]).join("/");
    return next();
  };
}
