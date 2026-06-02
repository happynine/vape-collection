import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function getS3Client(): S3Client {
  const endpoint = process.env.S3_ENDPOINT_URL || process.env.COZE_BUCKET_ENDPOINT_URL;
  const region = process.env.S3_REGION || 'cn-beijing';
  const accessKey = process.env.S3_ACCESS_KEY || '';
  const secretKey = process.env.S3_SECRET_KEY || '';

  return new S3Client({
    endpoint,
    region,
    credentials: accessKey && secretKey ? {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    } : undefined,
  });
}

function getBucketName(): string {
  return process.env.S3_BUCKET_NAME || process.env.COZE_BUCKET_NAME || '';
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');

  if (!key) {
    return NextResponse.json({ error: 'key is required' }, { status: 400 });
  }

  try {
    const s3 = getS3Client();
    const bucketName = getBucketName();

    const url = await getSignedUrl(s3, new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    }), { expiresIn: 86400 }); // 1 day

    return NextResponse.json({ url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to generate URL';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
