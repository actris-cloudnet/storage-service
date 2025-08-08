import { ClientConfiguration } from "aws-sdk/clients/s3";

interface S3Config {
  connection: ClientConfiguration;
  credentials: { user: string; pwHash: string }[];
  maxObjectsPerBucket: (bucket: string) => number;
  port: number;
}

const config: S3Config = {
  connection: {
    endpoint: process.env.S3_ENDPOINT,
    accessKeyId: process.env.S3_ACCESSKEYID,
    secretAccessKey: process.env.S3_SECRETACCESSKEY,
    computeChecksums: true,
    s3ForcePathStyle: process.env.S3_FORCE_PATH_STYLE == "true",
    maxRetries: 10,
  },
  credentials: [
    {
      user: process.env.SS_USER!,
      pwHash: process.env.SS_PWHASH!,
    },
  ],
  maxObjectsPerBucket: (bucket) => {
    const maxValue = process.env.SS_MAXOBJECTSPERBUCKET;
    if (!maxValue)
      throw new Error(`Invalid SS_MAXOBJECTSPERBUCKET: ${maxValue}`);
    return parseInt(maxValue, 10);
  },
  port: 5900,
};

export default config;
