import { NextResponse } from 'next/server';
import type { RenderJobPayload, VideoVariant } from '@realestatevids/shared';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { enqueueRenderJob } from '@/lib/renderQueue';

const DIMENSIONS: Record<VideoVariant, { width: number; height: number }> = {
  vertical: { width: 1080, height: 1920 },
  landscape: { width: 1920, height: 1080 },
};

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const propertyId = params.id;
  const body = await request.json().catch(() => ({}));
  const wantsLandscape = Boolean(body.landscape);

  const supabase = getSupabaseServerClient();

  const { count, error: countError } = await supabase
    .from('property_images')
    .select('*', { count: 'exact', head: true })
    .eq('property_id', propertyId);

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }
  if (!count || count < 1) {
    return NextResponse.json({ error: 'Property has no images to render' }, { status: 400 });
  }

  const variants: VideoVariant[] = wantsLandscape ? ['vertical', 'landscape'] : ['vertical'];
  const videos = [];

  for (const variant of variants) {
    const { data, error } = await supabase
      .from('property_videos')
      .insert({ property_id: propertyId, variant, status: 'queued' })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    videos.push(data);

    const payload: RenderJobPayload = {
      propertyVideoId: data.id,
      propertyId,
      ...DIMENSIONS[variant],
    };
    await enqueueRenderJob(payload);
  }

  return NextResponse.json({ videos });
}
