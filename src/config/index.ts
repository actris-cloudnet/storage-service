import {ClientConfiguration} from 'aws-sdk/clients/s3'
import * as fs from 'fs'

interface S3Config {
  connection: ClientConfiguration
  credentials: [{ user: string, pwHash: string }]
  maxObjectsPerBucket: Function
  port: number
}

const readJSONFile = (filepath: string) =>
  JSON.parse(fs.readFileSync(filepath).toString())

const isProd = process.env.NODE_ENV == 'production'
const isRemote = process.env.SS_MODE == 'remote'

const config: S3Config = {
  connection: isProd || isRemote
    ? {
      endpoint: process.env.S3_ENDPOINT,
      accessKeyId: process.env.S3_ACCESSKEYID,
      secretAccessKey: process.env.S3_SECRETACCESSKEY,
      computeChecksums: true
    }
    : readJSONFile('src/config/local.connection.json'),
  credentials: isProd
    ? [{
      user: process.env.SS_USER,
      pwHash: process.env.SS_PWHASH
    }]
    : readJSONFile('src/config/local.credentials.json'),
  maxObjectsPerBucket: (bucket: string) =>
    isProd
      ? process.env.SS_MAXOBJECTSPERBUCKET
      : bucket.includes('test') ? 10 : 100000,
  port: 5900
}

export default config
