import { NextResponse } from 'next/server';
import type { PropertyVideo } from '@realestatevids/shared';
import { getDb } from '@/lib/db';

function mapVideo(video: {
  id: string;
  propertyId: string;
  variant: string;
  status: string;
  outputUrl: string | null;
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
}): PropertyVideo {
  return {
    id: video.id,
    property_id: video.propertyId,
    variant: video.variant as PropertyVideo['variant'],
    status: video.status as PropertyVideo['status'],
    output_url: video.outputUrl,
    error_message: video.errorMessage,
    created_at: video.createdAt.toISOString(),
    completed_at: video.completedAt ? video.completedAt.toISOString() : null,
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: propertyId } = await params;
  const db = getDb();

  let videos;
  try {
    videos = await db.propertyVideo.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'desc' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  return NextResponse.json({ videos: videos.map(mapVideo) });
}
