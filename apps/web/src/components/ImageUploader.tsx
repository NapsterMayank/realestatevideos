'use client';

import { useRef, useState } from 'react';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';

export function ImageUploader({
  propertyId,
  nextDisplayOrder,
  onUploaded,
}: {
  propertyId: string;
  nextDisplayOrder: number;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFiles(files: FileList) {
    setUploading(true);
    const supabase = getSupabaseBrowserClient();
    let order = nextDisplayOrder;

    for (const file of Array.from(files)) {
      const path = `${propertyId}/${crypto.randomUUID()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from('property-photos').upload(path, file);
      if (uploadError) {
        console.error('Upload failed', uploadError);
        continue;
      }
      const { error: insertError } = await supabase.from('property_images').insert({
        property_id: propertyId,
        image_url: path,
        room_type: 'bedroom',
        display_order: order,
      });
      if (insertError) {
        console.error('Insert failed', insertError);
      }
      order += 1;
    }

    setUploading(false);
    onUploaded();
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*"
        disabled={uploading}
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />
      {uploading ? <p>Uploading...</p> : null}
    </div>
  );
}
