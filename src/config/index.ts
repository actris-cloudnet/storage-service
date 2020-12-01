import {ClientConfiguration} from 'aws-sdk/clients/s3'
import * as fs from 'fs'

interface S3Config {
  connection: ClientConfiguration,
  buckets: string[],
  credentials: [{ user: string, pwHash: string }],
  port: number
}

const readJSONFile = (filepath: string) =>
  JSON.parse(fs.readFileSync(filepath).toString())


const config: S3Config = {
  connection: (process.env.NODE_ENV == 'production')
    ? readJSONFile('src/config/private/remote.connection.json')
    : readJSONFile('src/config/local.connection.json'),
  buckets: [
    'cloudnet-upload',
    'cloudnet-product',
    'cloudnet-product-volatile',
    'cloudnet-img',
    'test',
    'test-versioning'
  ],
  credentials: (process.env.NODE_ENV == 'production')
    ? readJSONFile('src/config/private/remote.credentials.json')
    : readJSONFile('src/config/local.credentials.json'),
  port: 5900
}

export default config
