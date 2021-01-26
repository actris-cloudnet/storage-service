
export function bucketToS3Format(bucket: string) {
  return bucket.replace(/"/g, '')
}
