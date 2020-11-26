import {RequestHandler} from 'express'
import config from './config'


export class Middleware {

  validateDeleteBucket: RequestHandler = (req, _, next) => {
    const bucket = req.params.bucket
    const allowedBuckets = ['cloudnet-product-volatile', 'test']
    if (!allowedBuckets.includes(bucket)) return next({status: 405, msg: 'DELETE not allowed for the bucket'})
    return next()
  }

  validateParams: RequestHandler = (req, _, next) => {
    const bucket = req.params.bucket
    if (!config.buckets.includes(bucket)) return next({status: 404, msg: 'Unknown bucket'})
    req.params.key = req.params[0]
    return next()
  }
}
