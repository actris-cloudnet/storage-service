import { S3ClientConfig } from "@aws-sdk/client-s3";
import * as fs from "fs";

interface S3Config {
  connection: S3ClientConfig;
  credentials: [{ user: string; pwHash: string }];
  maxObjectsPerBucket: (bucket: string) => number;
  port: number;
}

const readJSONFile = (filepath: string) =>
  JSON.parse(fs.readFileSync(filepath).toString());

const isProd = process.env.NODE_ENV == "production";
const isRemote = process.env.SS_MODE == "remote";

const config: S3Config = {
  connection:
    isProd || isRemote
      ? {
          endpoint: process.env.S3_ENDPOINT,
          credentials: {
            accessKeyId: process.env.S3_ACCESSKEYID,
            secretAccessKey: process.env.S3_SECRETACCESSKEY,
          },
          region: "EU",
        }
      : readJSONFile("src/config/local.connection.json"),
  credentials: isProd
    ? [
        {
          user: process.env.SS_USER,
          pwHash: process.env.SS_PWHASH,
        },
      ]
    : readJSONFile("src/config/local.credentials.json"),
  maxObjectsPerBucket: isProd
    ? (bucket) => {
        const maxValue = process.env.SS_MAXOBJECTSPERBUCKET;
        if (!maxValue)
          throw new Error(`Invalid SS_MAXOBJECTSPERBUCKET: ${maxValue}`);
        return parseInt(maxValue, 10);
      }
    : (bucket) => (bucket.includes("test") ? 10 : 100000),
  port: 5900,
};

export default config;
