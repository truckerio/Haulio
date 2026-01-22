export async function uploadToS3Stub(params: {
  bucket: string;
  key: string;
  body: Buffer;
}) {
  // Stub for future S3 integration.
  return {
    url: `s3://${params.bucket}/${params.key}`,
  };
}
