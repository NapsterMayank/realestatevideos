import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getPresignedDownloadUrl } from '@/lib/storage';

const VIDEOS_BUCKET = process.env.MINIO_VIDEOS_BUCKET ?? 'property-videos';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  let video;
  try {
    video = await db.propertyVideo.findUniqueOrThrow({ where: { id } });
  } catch {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  if (!video.outputUrl) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  let signedUrl: string;
  try {
    signedUrl = await getPresignedDownloadUrl(VIDEOS_BUCKET, video.outputUrl, 60 * 10);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not sign url' },
      { status: 500 }
    );
  }

  return NextResponse.redirect(signedUrl);
}
