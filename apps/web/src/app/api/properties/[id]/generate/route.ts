import { NextResponse } from 'next/server';
import type { RenderJobPayload, VideoVariant } from '@realestatevids/shared';
import { getDb } from '@/lib/db';
import { enqueueRenderJob } from '@/lib/renderQueue';

const DIMENSIONS: Record<VideoVariant, { width: number; height: number }> = {
  vertical: { width: 1080, height: 1920 },
  landscape: { width: 1920, height: 1080 },
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: propertyId } = await params;
  const body = await request.json().catch(() => ({}));
  const requestedVariant = body.variant as VideoVariant | undefined;
  const wantsLandscape = Boolean(body.landscape);

  const db = getDb();

  let count: number;
  try {
    count = await db.propertyImage.count({ where: { propertyId } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  if (!count || count < 1) {
    return NextResponse.json({ error: 'Property has no images to render' }, { status: 400 });
  }

  const variants: VideoVariant[] =
    requestedVariant === 'vertical' || requestedVariant === 'landscape'
      ? [requestedVariant]
      : wantsLandscape
        ? ['vertical', 'landscape']
        : ['vertical'];
  const videos = [];

  for (const variant of variants) {
    let video;
    try {
      video = await db.propertyVideo.create({
        data: { propertyId, variant, status: 'queued' },
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 500 }
      );
    }

    videos.push(video);

    const payload: RenderJobPayload = {
      propertyVideoId: video.id,
      propertyId,
      ...DIMENSIONS[variant],
    };
    await enqueueRenderJob(payload);
  }

  return NextResponse.json({ videos });
}
