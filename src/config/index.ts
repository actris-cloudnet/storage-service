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
const isLocal = process.env.SS_MODE == 'local'

const config: S3Config = {
  connection: isProd
    ? readJSONFile('src/config/private/remote-rw.connection.json')
    : isLocal
      ? readJSONFile('src/config/local.connection.json')
      : readJSONFile('src/config/private/remote-ro.connection.json'),
  credentials: isProd
    ? readJSONFile('src/config/private/remote.credentials.json')
    : readJSONFile('src/config/local.credentials.json'),
  maxObjectsPerBucket: (bucket: string) =>
    isProd
      ? 1900000
      : bucket.includes('test') ? 10 : 100000,
  port: 5900
}

export default config
