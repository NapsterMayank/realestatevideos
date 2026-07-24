'use client';

import { useRef, useState } from 'react';

export function ImageUploader({
  propertyId,
  onUploaded,
}: {
  propertyId: string;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFiles(files: FileList) {
    setUploading(true);

    for (const file of Array.from(files)) {
      try {
        const createResponse = await fetch(`/api/properties/${propertyId}/images`, {
          method: 'POST',
          body: JSON.stringify({ fileName: file.name, contentType: file.type }),
        });
        if (!createResponse.ok) {
          console.error('Failed to create image record', createResponse.status);
          continue;
        }
        const { uploadUrl } = await createResponse.json();

        const uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type },
        });
        if (!uploadResponse.ok) {
          console.error('Upload failed', uploadResponse.status);
        }
      } catch (error) {
        console.error('Upload failed', error);
      }
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
