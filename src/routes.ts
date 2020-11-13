import {S3, AWSError} from 'aws-sdk'
import {Request, RequestHandler} from 'express'
import {PutObjectRequest, GetObjectRequest, ManagedUpload} from 'aws-sdk/clients/s3'
import * as crypto from 'crypto'


export class Routes {
  constructor(s3: S3) {
    this.s3 = s3
  }

  readonly s3: S3
  readonly S3_BAD_HASH_ERROR_CODE = 'BadDigest'

  putFile: RequestHandler = async (req, res, next) => {
    const expectedChecksum = req.headers['content-md5'] as string | undefined
    if (!expectedChecksum) return next({status: 400, msg: 'Content-MD5 header is missing'})

    const uploadParams: PutObjectRequest = {
      Bucket: req.params.bucket,
      Key: req.params.key,
      Body: req,
    }

    let size: number | undefined = 0
    let exists = false
    let managedUpload: ManagedUpload | undefined
    try {
      exists = await this.s3ObjExists(uploadParams)
      managedUpload = this.s3.upload(uploadParams)
      await Promise.all([
        this.checkHash(req, expectedChecksum),
        managedUpload.promise()
      ])
      size = await this.getSizeOfS3Obj(uploadParams)
    } catch (err) {
      if (managedUpload) managedUpload.abort()
      if (err.status && err.msg) return next({status: err.status, msg: err.msg})
      return next({status: 502, msg: err})
    }

    if (exists) {
      res.status(200)
    } else {
      res.status(201)
    }

    return res.send({size})
  }

  getFile: RequestHandler = async (req, res, next) => {
    const downloadParams: GetObjectRequest = {
      Bucket: req.params.bucket,
      Key: req.params.key
    }
    const objStream = this.s3.getObject(downloadParams).createReadStream()
    objStream.on('error', (err: AWSError) => {
      if (err.statusCode == 404) return next({status: 404, msg: 'Not found'})
      next({status: 502, msg: err})
    })
      .pipe(res)
  }

  private checkHash(req: Request, expectedChecksum: string) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5')
      req.on('data', data => hash.update(data))
      req.on('end', () => {
        const checksum = hash.digest('base64')
        if (checksum != expectedChecksum) {
          reject({status: 400, msg: 'Checksum does not match file contents'})
        }
        resolve()
      })
    })
  }

  private async s3ObjExists(params: PutObjectRequest) {
    try {
      await this.getSizeOfS3Obj(params)
    } catch (e) {
      if (e.statusCode == 404) return false
      throw e
    }
    return true
  }

  private async getSizeOfS3Obj(params: PutObjectRequest) {
    return this.s3.headObject({ Key: params.Key, Bucket: params.Bucket })
      .promise()
      .then(res => res.ContentLength)
  }
}
