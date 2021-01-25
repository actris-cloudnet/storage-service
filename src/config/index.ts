import {ClientConfiguration} from 'aws-sdk/clients/s3'
import * as fs from 'fs'

interface S3Config {
  connection: ClientConfiguration
  credentials: [{ user: string, pwHash: string }]
  maxObjectsPerBucket: number
  recountAfter: number
  port: number
}

const readJSONFile = (filepath: string) =>
  JSON.parse(fs.readFileSync(filepath).toString())

const isProd = process.env.NODE_ENV == 'production'

const config: S3Config = {
  connection: isProd
    ? readJSONFile('src/config/private/remote.connection.json')
    : readJSONFile('src/config/local.connection.json'),
  credentials: isProd
    ? readJSONFile('src/config/private/remote.credentials.json')
    : readJSONFile('src/config/local.credentials.json'),
  maxObjectsPerBucket: isProd
    ? 1900000
    : 10,
  recountAfter: isProd
    ? 1000
    : 10,
  port: 5900
}

export default config
