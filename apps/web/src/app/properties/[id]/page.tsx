'use client';

import { use, useCallback, useEffect, useState } from 'react';
import type { PropertyImage } from '@realestatevids/shared';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';
import { ImageUploader } from '@/components/ImageUploader';
import { ImageList } from '@/components/ImageList';
import { RuntimeEstimate } from '@/components/RuntimeEstimate';

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
    await fetch(`/api/properties/${propertyId}/generate`, {
      method: 'POST',
      body: JSON.stringify({ landscape }),
    });
    setGenerating(false);
  }

  return (
    <main>
      <h1>Property photos</h1>
      <ImageUploader propertyId={propertyId} nextDisplayOrder={images.length} onUploaded={loadImages} />
      <ImageList images={images} onChanged={loadImages} />
      <RuntimeEstimate numPhotos={images.length} />
      <label>
        <input type="checkbox" checked={landscape} onChange={(e) => setLandscape(e.target.checked)} />
        Also generate landscape version
      </label>
      <button disabled={generating || images.length === 0} onClick={handleGenerate}>
        Generate Video
      </button>
    </main>
  );
}
