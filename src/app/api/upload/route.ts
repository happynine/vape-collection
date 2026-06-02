import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';

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

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const s3 = getS3Client();
    const bucketName = getBucketName();
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = `logos/${Date.now()}_${file.name}`;

    await s3.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: fileName,
      Body: buffer,
      ContentType: file.type || 'image/png',
    }));

    // Generate presigned URL for reading
    const url = await getSignedUrl(s3, new GetObjectCommand({
      Bucket: bucketName,
      Key: fileName,
    }), { expiresIn: 86400 * 30 }); // 30 days

    return NextResponse.json({ key: fileName, url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
