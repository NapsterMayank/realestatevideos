'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Property, PropertyImage } from '@realestatevids/shared';
import { ImageUploader } from '@/components/ImageUploader';
import { ImageList } from '@/components/ImageList';
import { RuntimeEstimate } from '@/components/RuntimeEstimate';
import { VideoStatusList } from '@/components/VideoStatusList';

export default function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: propertyId } = use(params);
  const [property, setProperty] = useState<Property | null>(null);
  const [images, setImages] = useState<PropertyImage[]>([]);
  const [landscape, setLandscape] = useState(false);
  const [generating, setGenerating] = useState(false);

  const loadProperty = useCallback(async () => {
    const response = await fetch(`/api/properties/${propertyId}`);
    if (!response.ok) {
      console.error('Failed to load property', response.status);
      return;
    }
    const { property } = await response.json();
    setProperty(property ?? null);
  }, [propertyId]);

  const loadImages = useCallback(async () => {
    const response = await fetch(`/api/properties/${propertyId}/images`);
    if (!response.ok) {
      console.error('Failed to load images', response.status);
      return;
    }
    const { images } = await response.json();
    setImages(images ?? []);
  }, [propertyId]);

  useEffect(() => {
    loadProperty();
    loadImages();
  }, [loadProperty, loadImages]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const response = await fetch(`/api/properties/${propertyId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ landscape }),
      });
      if (!response.ok) {
        console.error('Generate request failed', response.status);
      }
    } catch (error) {
      console.error('Generate request failed', error);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-8">
      <div>
        <Link href="/" className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
          ← All properties
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          {property?.name ?? 'Loading…'}
        </h1>
        {property ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {property.contact_phone} · {property.contact_website}
            {property.agency_name ? ` · ${property.agency_name}` : ''}
          </p>
        ) : null}
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium text-zinc-800 dark:text-zinc-100">Photos</h2>
        <ImageUploader propertyId={propertyId} onUploaded={loadImages} />
        <ImageList propertyId={propertyId} images={images} onChanged={loadImages} />
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <RuntimeEstimate numPhotos={images.length} />
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
          <input
            type="checkbox"
            checked={landscape}
            onChange={(e) => setLandscape(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300"
          />
          Also generate landscape version
        </label>
        <button
          disabled={generating || images.length === 0}
          onClick={handleGenerate}
          className="self-start rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {generating ? 'Starting…' : 'Generate Video'}
        </button>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium text-zinc-800 dark:text-zinc-100">Videos</h2>
        <VideoStatusList propertyId={propertyId} />
      </section>
    </main>
  );
}
