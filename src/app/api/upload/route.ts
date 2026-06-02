import { NextRequest, NextResponse } from 'next/server';
import { S3Storage } from 'coze-coding-dev-sdk';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const storage = new S3Storage({
      endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
      accessKey: '',
      secretKey: '',
      bucketName: process.env.COZE_BUCKET_NAME,
      region: 'cn-beijing',
    });

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = `logos/${Date.now()}_${file.name}`;

    const fileKey = await storage.uploadFile({
      fileContent: buffer,
      fileName,
      contentType: file.type || 'image/png',
    });

    const url = await storage.generatePresignedUrl({
      key: fileKey,
      expireTime: 86400 * 30, // 30 days
    });

    return NextResponse.json({ key: fileKey, url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
