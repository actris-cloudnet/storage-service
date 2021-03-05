const fs = require('fs')
const AWS = require('aws-sdk')
const Client = require('pg').Client

const s3 = new AWS.S3(JSON.parse(fs.readFileSync('src/config/local.connection.json').toString()))

const buckets = ['cloudnet-test-volatile', 'cloudnet-test-versioning', 'cloudnet-test-versioning-1'];

(async () => {
  if (process.env.NODE_ENV == 'production' || process.env.SS_MODE != 'local') {
    console.log('Not running in local mode. Skipping bucket and table creation.')
    return
  }

  process.stdout.write('Initializing buckets... ')
  try {
    await Promise.all(buckets.map(bucket =>
      s3.createBucket({Bucket: bucket}).promise()
    ))
  } catch (e) {} // eslint-disable-line no-empty
  const params = {
    Bucket: buckets[1],
    VersioningConfiguration: {
      MFADelete: 'Disabled',
      Status: 'Enabled'
    }
  }
  await s3.putBucketVersioning(params).promise()
  console.log('OK')

  process.stdout.write('Initializing db... ')
  const client = new Client()
  await client.connect()
  await client.query(fs.readFileSync('src/db/createtable.sql', 'utf-8'))
  await client.query(fs.readFileSync('src/db/createtable-test.sql', 'utf-8'))
  console.log('OK')

  process.exit(0)
})()
