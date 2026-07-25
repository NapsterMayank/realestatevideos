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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variant: video.variant }),
    });
  }

  if (videos.length === 0) {
    return null;
  }

  const STATUS_LABEL: Record<PropertyVideo['status'], string> = {
    queued: 'Queued',
    processing: 'Rendering…',
    done: 'Ready',
    failed: 'Failed',
  };

  const STATUS_COLOR: Record<PropertyVideo['status'], string> = {
    queued: 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200',
    processing: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    done: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    failed: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {videos.map((video) => (
        <div
          key={video.id}
          className="flex flex-col gap-2 rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium capitalize text-zinc-800 dark:text-zinc-100">
              {video.variant}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[video.status]}`}>
              {STATUS_LABEL[video.status]}
            </span>
          </div>

          {video.status === 'done' && video.output_url ? (
            <>
              <video controls className="w-full rounded-md bg-black" src={`/api/videos/${video.id}/stream`} />
              <a
                href={`/api/videos/${video.id}/stream`}
                download
                className="text-center text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Download
              </a>
            </>
          ) : null}

          {video.status === 'failed' ? (
            <>
              <p className="text-sm text-red-600 dark:text-red-400">{video.error_message}</p>
              <button
                onClick={() => retry(video)}
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                Retry
              </button>
            </>
          ) : null}

          {video.status === 'queued' || video.status === 'processing' ? (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div className="h-full w-1/3 animate-pulse bg-amber-400" />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
