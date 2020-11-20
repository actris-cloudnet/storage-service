const axios = require('axios')
const fs = require('fs')
const AWS = require('aws-sdk')

const bucket = 'test'
const versionedBucket = 'test-versioning'
const url = `http://localhost:5900/${bucket}/`
const versionedUrl = `http://localhost:5900/${versionedBucket}/`
const key = 'testdata.txt'
const validUrl = `${url}${key}`
const validVersionedUrl = `${versionedUrl}${key}`
const testdataPath = 'tests/testdata.txt'
const validConfig = {
  headers: {
    'Content-MD5': '91uBeeS75+K0oHTc72LelQ==',
  },
  auth: {
    'username': 'test',
    'password': 'test'
  }
}

const s3 = new AWS.S3(JSON.parse(fs.readFileSync('src/config/local.connection.json').toString()))

const deleteExistingObjects = async () => {
  const {Contents} = await s3.listObjects({Bucket: bucket}).promise()
  return Promise.all(Contents.map(content => s3.deleteObject({Bucket: bucket, Key: content.Key}).promise()))
}

describe('PUT /:bucket/:key', () => {
  beforeEach(deleteExistingObjects)

  it('should respond with 201 and file size when putting new file', async () => {
    await expect(axios.put(validUrl, fs.createReadStream(testdataPath), validConfig))
      .resolves.toMatchObject({status: 201, data: {size: 8}})
    return expect(s3.headObject({Bucket: bucket, Key: key}).promise()).resolves.toBeTruthy()
  })

  it('should respond with 201 when putting files with path as key', async () => {
    const key = 'kissa/koira/mursu.txt'
    await expect(axios.put(`${url}${key}`, fs.createReadStream(testdataPath), validConfig))
      .resolves.toMatchObject({status: 201, data: {size: 8}})
    return expect(s3.headObject({Bucket: bucket, Key: key}).promise()).resolves.toBeTruthy()
  })

  it('should respond with 200 and file size when putting existing file', async () => {
    await axios.put(validUrl, fs.createReadStream(testdataPath), validConfig)
    await expect(axios.put(`${url}testdata.txt`, fs.createReadStream(testdataPath), validConfig))
      .resolves.toMatchObject({status: 200, data: {size: 8}})
    return expect(s3.headObject({Bucket: bucket, Key: key}).promise()).resolves.toBeTruthy()
  })

  it('should respond with 200 and file version when putting files to versioned bucket', async () => {
    await axios.put(validVersionedUrl, fs.createReadStream(testdataPath), validConfig)
    const response = await axios.put(validVersionedUrl, fs.createReadStream(testdataPath), validConfig)
    expect(response.status).toEqual(200)
    expect(response.data.version).toBeTruthy()
    return expect(s3.headObject({Bucket: 'test-versioning', Key: key, VersionId: response.data.version}).promise()).resolves.toBeTruthy()
  })

  it('should respond with 400 if content-md5 header is missing', async () => {
    await expect(axios.put(validUrl, fs.createReadStream(testdataPath), {auth: validConfig.auth}))
      .rejects.toMatchObject({response: { status: 400 }})
    return expect(s3.headObject({Bucket: bucket, Key: key}).promise()).rejects.toBeTruthy()
  })

  it('should respond with 400 if checksum is invalid', async () => {
    const invalidConfig = {...validConfig, ...{headers: {'Content-MD5': '81uBeeS75+K0oHTc72LelQ=='}}}
    await expect(axios.put(validUrl, fs.createReadStream(testdataPath), invalidConfig))
      .rejects.toMatchObject({response: { status: 400 }})
    return expect(s3.headObject({Bucket: bucket, Key: key}).promise()).rejects.toBeTruthy()
  })

  it('should respond with 401 if auth is invalid', async () => {
    const invalidConfig = {...validConfig, ...{auth: {'userame': 'test', 'password':'kissa'}}}
    await expect(axios.put(validUrl, fs.createReadStream(testdataPath), invalidConfig))
      .rejects.toMatchObject({response: { status: 401 }})
    return expect(s3.headObject({Bucket: bucket, Key: key}).promise()).rejects.toBeTruthy()
  })

  it('should respond with 404 if trying to put to invalid bucket', async () => {
    return expect(axios.put(`${url.slice(0, url.length - 2)}/asdf`, fs.createReadStream(testdataPath), validConfig))
      .rejects.toMatchObject({response: { status: 404 }})
  })
})

describe('GET /:bucket/:key', () => {
  beforeEach(deleteExistingObjects)

  it('should respond with 200 and file contents when getting existing file', async () => {
    await axios.put(validUrl, fs.createReadStream(testdataPath), validConfig)
    return expect(axios.get(validUrl, {auth: validConfig.auth})).resolves.toMatchObject({ status: 200, data: 'content\n' })
  })

  it('should respond with 200 and file contents when getting existing file with path as key', async () => {
    const key = 'kissa/koira/mursu.txt'
    await axios.put(`${url}${key}`, fs.createReadStream(testdataPath), validConfig)
    return expect(axios.get(`${url}${key}`, {auth: validConfig.auth})).resolves.toMatchObject({ status: 200, data: 'content\n' })
  })

  it('should respond with 200 and file contents when getting older version of file', async () => {
    const response = await axios.put(validVersionedUrl, fs.createReadStream(testdataPath), validConfig)
    const axiosPutConf = {headers: {'Content-MD5': '/tsthMr+IIYstDmXUain4w=='}, auth: validConfig.auth}
    await axios.put(validVersionedUrl, 'invalid', axiosPutConf)
    const axiosConf = {auth: validConfig.auth, params: { version: response.data.version }}
    return expect(axios.get(validVersionedUrl, axiosConf)).resolves.toMatchObject({ status: 200, data: 'content\n' })
  })

  it('should respond with 404 if file does not exist', async () => {
    return expect(axios.get(validUrl, {auth: validConfig.auth})).rejects.toMatchObject({ response: { status: 404 }})
  })

  it('should respond with 401 on invalid credentials', async () => {
    return expect(axios.get(validUrl)).rejects.toMatchObject({ response: { status: 401, data: 'Unauthorized' }})
  })
})
