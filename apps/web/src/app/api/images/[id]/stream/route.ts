import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getPresignedDownloadUrl } from '@/lib/storage';

const PHOTOS_BUCKET = process.env.MINIO_PHOTOS_BUCKET ?? 'property-photos';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  let image;
  try {
    image = await db.propertyImage.findUniqueOrThrow({ where: { id } });
  } catch {
    return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  }

  let signedUrl: string;
  try {
    signedUrl = await getPresignedDownloadUrl(PHOTOS_BUCKET, image.imageUrl, 60 * 10);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not sign url' },
      { status: 500 }
    );
  }

  return NextResponse.redirect(signedUrl);
}
