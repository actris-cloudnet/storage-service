import axios from "axios";
import * as fs from "fs";
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Client } from "pg";

const bucket = "cloudnet-test-volatile";
const versionedBucket = "cloudnet-test-versioning";
const baseUrl = "http://storage-service:5900";
const url = `${baseUrl}/${bucket}/`;
const versionedUrl = `${baseUrl}/${versionedBucket}/`;
const key = "testdata.txt";
const validUrl = `${url}${key}`;
const validVersionedUrl = `${versionedUrl}${key}`;
const testdataPath = "tests/testdata.txt";
const validConfig = {
  headers: {
    "Content-MD5": "91uBeeS75+K0oHTc72LelQ==",
    "Content-Type": "text/plain",
  },
  auth: {
    username: "test",
    password: "test",
  },
};

const s3 = new S3Client(
  JSON.parse(fs.readFileSync("src/config/local.connection.json").toString())
);
let client: Client;

async function emptyBucket(bucket: string) {
  const res = await s3.send(new ListObjectsCommand({ Bucket: bucket }));
  if (!res.Contents) return;
  await Promise.all(
    res.Contents.map((content) =>
      s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: content.Key }))
    )
  );
}

async function deleteExistingObjects() {
  await client.query('TRUNCATE TABLE "cloudnet-test-volatile"');
  await client.query('TRUNCATE TABLE "cloudnet-test-versioning"');
  await client.query("TRUNCATE TABLE bucketstats");
  await client.query(`INSERT INTO bucketstats VALUES
    ('cloudnet-test-volatile', 0, 0),
    ('cloudnet-test-versioning', 0, 0)`);
  await emptyBucket(bucket);
  await emptyBucket(versionedBucket);
}

beforeAll(async () => {
  client = new Client();
  return client.connect();
});

afterAll(async () => {
  return client.end();
});

describe("PUT /:bucket/:key", () => {
  beforeEach(deleteExistingObjects);

  it("should respond with 201 and file size when putting new file", async () => {
    await expect(
      axios.put(validUrl, fs.createReadStream(testdataPath), validConfig)
    ).resolves.toMatchObject({ status: 201, data: { size: 8 } });
    await expect(
      s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    ).resolves.toBeTruthy();
    const { rows } = await client.query(
      'SELECT bucket_id FROM "cloudnet-test-volatile"'
    );
    expect(rows).toHaveLength(1);
    return expect(rows[0].bucket_id).toEqual(0);
  });

  it("should respond with 201 when putting files with path as key", async () => {
    const key = "kissa/koira/mursu.txt";
    await expect(
      axios.put(`${url}${key}`, fs.createReadStream(testdataPath), validConfig)
    ).resolves.toMatchObject({ status: 201, data: { size: 8 } });
    return expect(
      s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    ).resolves.toBeTruthy();
  });

  it("should respond with 200 and file size when putting existing file", async () => {
    await axios.put(validUrl, fs.createReadStream(testdataPath), validConfig);
    await expect(
      axios.put(
        `${url}testdata.txt`,
        fs.createReadStream(testdataPath),
        validConfig
      )
    ).resolves.toMatchObject({ status: 200, data: { size: 8 } });
    await expect(
      s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    ).resolves.toBeTruthy();
    const { rows } = await client.query(
      'SELECT bucket_id FROM "cloudnet-test-volatile"'
    );
    expect(rows).toHaveLength(1);
    return expect(rows[0].bucket_id).toEqual(0);
  });

  it("should respond with 200 and file version when putting files to versioned bucket", async () => {
    await axios.put(
      validVersionedUrl,
      fs.createReadStream(testdataPath),
      validConfig
    );
    const response = await axios.put(
      validVersionedUrl,
      fs.createReadStream(testdataPath),
      validConfig
    );
    expect(response.status).toEqual(200);
    expect(response.data.version).toBeTruthy();
    await expect(
      s3.send(
        new HeadObjectCommand({
          Bucket: "cloudnet-test-versioning",
          Key: key,
          VersionId: response.data.version,
        })
      )
    ).resolves.toBeTruthy();
    const { rows } = await client.query(
      'SELECT bucket_id FROM "cloudnet-test-versioning"'
    );
    expect(rows).toHaveLength(1);
    return expect(rows[0].bucket_id).toEqual(0);
  });

  it("should change bucket after putting more than max object count objects", async () => {
    for (let i = 0; i < 10; i++) {
      await axios.put(
        `${validVersionedUrl}${i}`,
        fs.createReadStream(testdataPath),
        validConfig
      );
    }
    await axios.put(
      validVersionedUrl,
      fs.createReadStream(testdataPath),
      validConfig
    );
    const { rows } = await client.query(
      'SELECT * FROM "cloudnet-test-versioning" ORDER BY bucket_id DESC'
    );
    expect(rows).toHaveLength(11);
    expect(rows[0].bucket_id).toEqual(1);
    expect(rows[1].bucket_id).toEqual(0);
    return expect(
      s3.send(
        new HeadObjectCommand({
          Bucket: "cloudnet-test-versioning-1",
          Key: key,
        })
      )
    ).resolves.toBeTruthy();
  });

  it("should put all versions of a file to same bucket", async () => {
    for (let i = 0; i < 10; i++) {
      await axios.put(
        `${validVersionedUrl}${i}`,
        fs.createReadStream(testdataPath),
        validConfig
      );
    }
    const { data } = await axios.put(
      `${validVersionedUrl}0`,
      fs.createReadStream(testdataPath),
      validConfig
    );
    expect(data.version).toBeTruthy();
    return expect(
      axios.get(`${validVersionedUrl}0`, {
        auth: validConfig.auth,
        params: { version: data.version },
      })
    ).resolves.toBeTruthy();
  });

  it("should not change bucket for volatile files", async () => {
    for (let i = 0; i < 10; i++) {
      await axios.put(
        `${validUrl}${i}`,
        fs.createReadStream(testdataPath),
        validConfig
      );
    }
    await axios.delete(`${validUrl}9`, validConfig);
    await axios.put(validUrl, fs.createReadStream(testdataPath), validConfig);
    const { rows } = await client.query(
      'SELECT * FROM "cloudnet-test-volatile" ORDER BY bucket_id DESC'
    );
    expect(rows).toHaveLength(10);
    for (const row of rows) {
      expect(row.bucket_id).toEqual(0);
    }
    return expect(
      s3.send(
        new HeadObjectCommand({ Bucket: "cloudnet-test-volatile", Key: key })
      )
    ).resolves.toBeTruthy();
  });

  it("should respond with 400 if content-md5 header is missing", async () => {
    await expect(
      axios.put(validUrl, fs.createReadStream(testdataPath), {
        auth: validConfig.auth,
      })
    ).rejects.toMatchObject({ response: { status: 400 } });
    return expect(
      s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    ).rejects.toBeTruthy();
  });

  it("should respond with 400 if checksum is invalid", async () => {
    const invalidConfig = {
      ...validConfig,
      ...{ headers: { "Content-MD5": "81uBeeS75+K0oHTc72LelQ==" } },
    };
    await expect(
      axios.put(validUrl, fs.createReadStream(testdataPath), invalidConfig)
    ).rejects.toMatchObject({ response: { status: 400 } });
    return expect(
      s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    ).rejects.toBeTruthy();
  });

  it("should respond with 401 if auth is invalid", async () => {
    const invalidConfig = {
      ...validConfig,
      ...{ auth: { username: "test", password: "kissa" } },
    };
    await expect(
      axios.put(validUrl, fs.createReadStream(testdataPath), invalidConfig)
    ).rejects.toMatchObject({ response: { status: 401 } });
    return expect(
      s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    ).rejects.toBeTruthy();
  });

  it("should respond with 404 if trying to put to invalid bucket", async () => {
    await expect(
      axios.put(
        `${url.slice(0, url.length - 2)}/asdf`,
        fs.createReadStream(testdataPath),
        validConfig
      )
    ).rejects.toMatchObject({ response: { status: 404 } });
    return expect(
      axios.put(
        `${baseUrl}/bucketstats/asdf`,
        fs.createReadStream(testdataPath),
        validConfig
      )
    ).rejects.toMatchObject({ response: { status: 404 } });
  });
});

describe("GET /:bucket/:key", () => {
  beforeEach(deleteExistingObjects);

  it("should respond with 200 and file contents when getting existing file", async () => {
    await axios.put(validUrl, fs.createReadStream(testdataPath), validConfig);
    return expect(
      axios.get(validUrl, { auth: validConfig.auth })
    ).resolves.toMatchObject({ status: 200, data: "content\n" });
  });

  it("should respond with 200 and file contents when getting existing file with path as key", async () => {
    const key = "kissa/koira/mursu.txt";
    await axios.put(
      `${url}${key}`,
      fs.createReadStream(testdataPath),
      validConfig
    );
    return expect(
      axios.get(`${url}${key}`, { auth: validConfig.auth })
    ).resolves.toMatchObject({ status: 200, data: "content\n" });
  });

  it("should respond with 200 and file contents when getting file from a partitioned bucket", async () => {
    for (let i = 0; i < 10; i++) {
      await axios.put(
        `${validVersionedUrl}${i}`,
        fs.createReadStream(testdataPath),
        validConfig
      );
    }
    await axios.put(
      validVersionedUrl,
      fs.createReadStream(testdataPath),
      validConfig
    );
    return expect(
      axios.get(validVersionedUrl, { auth: validConfig.auth })
    ).resolves.toMatchObject({
      status: 200,
      data: "content\n",
    });
  });

  it("should respond with 200 and file contents when getting older version of file", async () => {
    const response = await axios.put(
      validVersionedUrl,
      fs.createReadStream(testdataPath),
      validConfig
    );
    const axiosPutConf = {
      headers: { "Content-MD5": "/tsthMr+IIYstDmXUain4w==" },
      auth: validConfig.auth,
    };
    await axios.put(validVersionedUrl, "invalid", axiosPutConf);
    const axiosConf = {
      auth: validConfig.auth,
      params: { version: response.data.version },
    };
    return expect(
      axios.get(validVersionedUrl, axiosConf)
    ).resolves.toMatchObject({ status: 200, data: "content\n" });
  });

  it("should respond with 404 if file does not exist", async () => {
    return expect(
      axios.get(validUrl, { auth: validConfig.auth })
    ).rejects.toMatchObject({ response: { status: 404 } });
  });

  it("should respond with 401 on invalid credentials", async () => {
    return expect(axios.get(validUrl)).rejects.toMatchObject({
      response: { status: 401, data: "Unauthorized" },
    });
  });
});

describe("DELETE /:bucket/:key", () => {
  beforeEach(deleteExistingObjects);

  it("should respond with 401 on invalid credentials", async () => {
    return expect(axios.delete(validUrl)).rejects.toMatchObject({
      response: { status: 401, data: "Unauthorized" },
    });
  });

  it("should respond with 405 if delete not allowed from the bucket", async () => {
    const res = {
      response: { status: 405, data: "DELETE not allowed for the bucket" },
    };
    return expect(
      axios.delete(versionedUrl, { auth: validConfig.auth })
    ).rejects.toMatchObject(res);
  });

  it("should respond with 200 when deleting file", async () => {
    const url = `${validUrl}`;
    await axios.put(url, fs.createReadStream(testdataPath), validConfig);
    await expect(axios.get(url, validConfig)).resolves.toMatchObject({
      status: 200,
      data: "content\n",
    });
    await expect(axios.delete(url, validConfig)).resolves.toMatchObject({
      status: 200,
    });
    return expect(axios.get(url, validConfig)).rejects.toMatchObject({
      response: { status: 404 },
    });
  });
});
