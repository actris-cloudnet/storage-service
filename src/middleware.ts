import {RequestHandler} from 'express'
import {Client} from 'pg'

export class Middleware {

  constructor(client: Client) {
    this.client = client
  }

  client: Client

  validateDeleteBucket: RequestHandler = (req, _, next) => {
    const bucket = req.params.bucket
    const allowedBuckets = ['cloudnet-product-volatile', 'test-volatile']
    if (!allowedBuckets.includes(bucket)) return next({status: 405, msg: 'DELETE not allowed for the bucket'})
    return next()
  }

  validateParams: RequestHandler = async (req, _, next) => {
    const bucket = req.params.bucket
    const {rows} = await this.client.query('SELECT to_regclass($1) as bucket', [bucket])
    const validBucket = rows[0].bucket
    if (!validBucket) return next({status: 404, msg: `Unknown bucket: ${bucket}`})
    req.params.bucket = validBucket
    req.params.key = req.params[0]
    return next()
  }
}
