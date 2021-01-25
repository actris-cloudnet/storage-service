import {S3, AWSError} from 'aws-sdk'
import {Request, RequestHandler} from 'express'
import {PutObjectRequest, GetObjectRequest} from 'aws-sdk/clients/s3'
import * as crypto from 'crypto'
import {Client} from 'pg'
import config from './config'

interface Params {
  bucket: string
  key: string
}

export class Routes {
  constructor(s3: S3, client: Client) {
    this.s3 = s3
    this.client = client
  }

  readonly s3: S3
  readonly client: Client
  readonly S3_BAD_HASH_ERROR_CODE = 'BadDigest'

  getCurrentPutBucket(bucket: string, bucketId: number) {
    if (bucketId == 0 || bucket.includes('volatile')) return bucket
    return `${bucket}-${bucketId}`
  }

  putFile: RequestHandler = async (req, res, next) => {
    const params: Params = req.params as any
    const expectedChecksum = req.headers['content-md5'] as string | undefined
    if (!expectedChecksum) return next({status: 400, msg: 'Content-MD5 header is missing'})

    let managedUpload
    let bucketId = 0
    try {
      const nobjres = await this.client.query(`SELECT n_objects, bucket_id
                                               FROM bucketstats
                                               WHERE bucket = $1`, [this.bucketToS3Format(params.bucket)])
      const nobjrow = nobjres.rows[0]
      bucketId = nobjrow.bucket_id
      if (nobjrow.n_objects >= config.maxObjectsPerBucket) {
        const bucketidres = await this.client.query(`UPDATE bucketstats
                                                     SET bucket_id = bucket_id + 1
                                                     WHERE bucket = $1
                                                     RETURNING bucket_id`, [this.bucketToS3Format(params.bucket)])
        bucketId = bucketidres.rows[0].bucket_id
      }

      const uploadParams: PutObjectRequest = {
        Bucket: this.getCurrentPutBucket(this.bucketToS3Format(params.bucket), bucketId),
        Key: params.key,
        Body: req,
        ContentType: req.headers['content-type'] || 'application/octet-stream'
      }

      const exists = await this.s3ObjExists(params.bucket, params.key)
      managedUpload = this.s3.upload(uploadParams)
      const [, uploadRes] = await Promise.all([
        this.checkHash(req, expectedChecksum),
        managedUpload.promise()
      ])
      const size = await this.getSizeOfS3Obj(uploadParams)

      if (exists) {
        res.status(200)
      } else {
          await Promise.all([
            this.client.query(`INSERT INTO ${params.bucket} (key, bucket_id) VALUES ($1, $2)`, [params.key, bucketId]),
            this.client.query(`UPDATE bucketstats
                               SET n_objects = n_objects + 1
                               WHERE bucket = $1`, [this.bucketToS3Format(params.bucket)])
          ])
        res.status(201)
      }

      return res.send({size, version: (uploadRes as any).VersionId})
    } catch (err) {
      if (managedUpload) managedUpload.abort()
      if (err.status && err.msg) return next({status: err.status, msg: err.msg}) // Client error
      if (err.statusCode) return next({status: 502, msg: err}) // S3 error
      return next(err) // Internal error
    }
  }

  getFile: RequestHandler = async (req, res, next) => {
    const downloadParams: GetObjectRequest = {
      Bucket: this.bucketToS3Format(req.params.bucket),
      Key: req.params.key,
      VersionId: (req.query.version as string)
    }
    const objStream = this.s3.getObject(downloadParams).createReadStream()
    objStream.on('error', (err: AWSError) => {
      if (err.statusCode == 404) return next({status: 404, msg: 'Not found'})
      next({status: 502, msg: err})
    })
      .pipe(res)
  }

  deleteVolatileFile: RequestHandler = async (req, res, next) => {
    const params: Params = req.params as any
    const deleteParams: GetObjectRequest = {
      Bucket: this.bucketToS3Format(req.params.bucket),
      Key: req.params.key,
    }
    try {
      await this.s3.deleteObject(deleteParams).promise()
    }
    catch (err) {
      next({status: 502, msg: err})
    }
    await Promise.all([
      this.client.query(`DELETE FROM ${params.bucket} WHERE key = $1`, [req.params.key]),
      this.client.query(`UPDATE bucketstats
                               SET n_objects = n_objects - 1
                               WHERE bucket = $1`, [this.bucketToS3Format(params.bucket)])
    ])
    res.sendStatus(200)
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

  private async s3ObjExists(bucket: string, key: string) {
    const {rows} = await this.client.query(`SELECT bucket_id FROM ${bucket} WHERE key = $1`, [key])
    if (rows.length == 0) return false
    return true
  }

  private async getSizeOfS3Obj(params: PutObjectRequest) {
    return this.s3.headObject({ Key: params.Key, Bucket: params.Bucket })
      .promise()
      .then(res => res.ContentLength)
  }

  private bucketToS3Format(bucket: string) {
    return bucket.replace(/"/g, '')
  }
}
