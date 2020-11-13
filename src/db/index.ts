import {Client} from 'pg'
import {bucketToS3Format} from '../lib'

export class DB {

  constructor() {
    this.client = new Client()
  }

  async init() {
    return this.client.connect()
  }

  readonly client: Client

  async selectObjectCountAndBucketId(bucket: string) {
    const {n_objects, bucket_id} = await this.queryOne(
      `SELECT n_objects, bucket_id
       FROM bucketstats
       WHERE bucket = $1`,
      [bucketToS3Format(bucket)])
    return {objectCount: n_objects, bucketId: bucket_id}
  }

  async increaseBucketId(bucket: string) {
    const {bucket_id} = await this.queryOne(
      `UPDATE bucketstats
       SET bucket_id = bucket_id + 1
       WHERE bucket = $1
       RETURNING bucket_id`,
      [bucketToS3Format(bucket)])
    return bucket_id
  }

  async saveObject(bucket: string, bucketId: number, key: string) {
    return Promise.all([
      this.queryOne(
        `INSERT INTO ${bucket} (key, bucket_id) VALUES ($1, $2)`,
        [key, bucketId]),
      this.queryOne(
        `UPDATE bucketstats
         SET n_objects = n_objects + 1
         WHERE bucket = $1`,
        [bucketToS3Format(bucket)])
    ])
  }

  async selectBucketId(bucket: string, key: string) {
    const res = await this.queryOne(
      `SELECT bucket_id
       FROM ${bucket}
       WHERE key = $1`,
      [key])
    return {bucketId: res ? res.bucket_id : null}
  }

  async deleteObject(bucket: string, key: string) {
    return Promise.all([
      this.queryOne(
        `DELETE FROM ${bucket} WHERE key = $1`,
        [key]),
      this.queryOne(
        `UPDATE bucketstats
         SET n_objects = n_objects - 1
         WHERE bucket = $1`,
        [bucketToS3Format(bucket)])
    ])
  }

  async selectBucket(bucket: string) {
    const {table} = await this.queryOne(
      'SELECT to_regclass($1) as table',
      [bucket])
    return table
  }

  private async queryOne(sql: string, params: Array<any>) {
    const res = await this.client.query(sql, params)
    if (res.rows && res.rows.length > 0)
      return res.rows[0]
    return null
  }
}
