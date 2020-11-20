const fs = require('fs')
const AWS = require('aws-sdk')

const s3 = new AWS.S3(JSON.parse(fs.readFileSync('src/config/local.connection.json').toString()))

const bucket = 'test'
const versionedBucket = 'test-versioning';

(async () => {
  process.stdout.write('Initializing buckets... ')
  try {
    await Promise.all([bucket, versionedBucket].map(bucket =>
      s3.createBucket({Bucket: bucket}).promise()
    ))
  } catch (e) {} // eslint-disable-line no-empty
  const params = {
    Bucket: versionedBucket,
    VersioningConfiguration: {
      MFADelete: 'Disabled',
      Status: 'Enabled'
    }
  }
  await s3.putBucketVersioning(params).promise()
  console.log('OK')
})()
