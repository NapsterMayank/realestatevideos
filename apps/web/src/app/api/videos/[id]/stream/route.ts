import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();

  const { data: video, error } = await supabase
    .from('property_videos')
    .select('output_url')
    .eq('id', id)
    .single();

  if (error || !video?.output_url) {
    return NextResponse.json({ error: 'Video not found' }, { status: 404 });
  }

  const { data: signed, error: signError } = await supabase.storage
    .from('property-videos')
    .createSignedUrl(video.output_url, 60 * 10);

  if (signError || !signed) {
    return NextResponse.json({ error: signError?.message ?? 'Could not sign url' }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
