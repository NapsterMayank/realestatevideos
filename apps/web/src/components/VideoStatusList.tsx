'use client';

import { useEffect, useState } from 'react';
import type { PropertyVideo } from '@realestatevids/shared';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';

export function VideoStatusList({ propertyId }: { propertyId: string }) {
  const [videos, setVideos] = useState<PropertyVideo[]>([]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    async function load() {
      const { data } = await supabase
        .from('property_videos')
        .select('*')
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false });
      setVideos(data ?? []);
    }

    load();

    const channel = supabase
      .channel(`property_videos:${propertyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'property_videos', filter: `property_id=eq.${propertyId}` },
        load
      )
      .subscribe();

    const pollId = setInterval(load, 3000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollId);
    };
  }, [propertyId]);

  async function retry(video: PropertyVideo) {
    await fetch(`/api/properties/${propertyId}/generate`, {
      method: 'POST',
      body: JSON.stringify({ variant: video.variant }),
    });
  }

  if (videos.length === 0) {
    return null;
  }

  return (
    <ul>
      {videos.map((video) => (
        <li key={video.id}>
          <strong>{video.variant}</strong>: {video.status}
          {video.status === 'done' && video.output_url ? (
            <>
              <video controls width={240} src={`/api/videos/${video.id}/stream`} />
              <a href={`/api/videos/${video.id}/stream`} download>
                Download
              </a>
            </>
          ) : null}
          {video.status === 'failed' ? (
            <>
              <span>{video.error_message}</span>
              <button onClick={() => retry(video)}>Retry</button>
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
