'use client';

import { useEffect, useState } from 'react';
import type { PropertyVideo } from '@realestatevids/shared';

export function VideoStatusList({ propertyId }: { propertyId: string }) {
  const [videos, setVideos] = useState<PropertyVideo[]>([]);

  useEffect(() => {
    async function load() {
      const response = await fetch(`/api/properties/${propertyId}/videos`);
      if (!response.ok) {
        console.error('Failed to load videos', response.status);
        return;
      }
      const { videos } = await response.json();
      setVideos(videos ?? []);
    }

    load();

    const pollId = setInterval(load, 3000);

    return () => {
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
