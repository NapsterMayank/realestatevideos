'use client';

import { use, useCallback, useEffect, useState } from 'react';
import type { PropertyImage } from '@realestatevids/shared';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { ImageUploader } from '@/components/ImageUploader';
import { ImageList } from '@/components/ImageList';
import { RuntimeEstimate } from '@/components/RuntimeEstimate';
import { VideoStatusList } from '@/components/VideoStatusList';

export default function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: propertyId } = use(params);
  const [images, setImages] = useState<PropertyImage[]>([]);
  const [landscape, setLandscape] = useState(false);
  const [generating, setGenerating] = useState(false);

  const loadImages = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase
      .from('property_images')
      .select('*')
      .eq('property_id', propertyId)
      .order('display_order', { ascending: true });
    setImages(data ?? []);
  }, [propertyId]);

  useEffect(() => {
    loadImages();
  }, [loadImages]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const response = await fetch(`/api/properties/${propertyId}/generate`, {
        method: 'POST',
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

  const nextDisplayOrder = Math.max(-1, ...images.map((i) => i.display_order)) + 1;

  return (
    <main>
      <h1>Property photos</h1>
      <ImageUploader propertyId={propertyId} nextDisplayOrder={nextDisplayOrder} onUploaded={loadImages} />
      <ImageList images={images} onChanged={loadImages} />
      <RuntimeEstimate numPhotos={images.length} />
      <label>
        <input type="checkbox" checked={landscape} onChange={(e) => setLandscape(e.target.checked)} />
        Also generate landscape version
      </label>
      <button disabled={generating || images.length === 0} onClick={handleGenerate}>
        Generate Video
      </button>
      <VideoStatusList propertyId={propertyId} />
    </main>
  );
}
