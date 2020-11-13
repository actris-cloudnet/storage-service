import {RequestHandler} from 'express'
import config from './config'


export class Middleware {

  validateParams: RequestHandler = (req, res, next) => {
    const bucket = req.params.bucket
    if (!config.buckets.includes(bucket)) return next({status: 404, msg: 'Unknown bucket'})
    req.params.key = req.params[0]
    return next()
  }
}
