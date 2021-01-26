const fs = require('fs')
const AWS = require('aws-sdk')

const s3 = new AWS.S3(JSON.parse(fs.readFileSync('src/config/local.connection.json').toString()))

const buckets = ['cloudnet-test-volatile', 'cloudnet-test-versioning', 'cloudnet-test-versioning-1'];

(async () => {
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
})()
