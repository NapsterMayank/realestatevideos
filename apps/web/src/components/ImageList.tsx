'use client';

import { useState } from 'react';
import type { PropertyImage } from '@realestatevids/shared';

const ROOM_PRESETS = ['bedroom', 'kitchen', 'living room', 'bathroom', 'exterior', 'balcony', 'dining room'];

export function ImageList({
  propertyId,
  images,
  onChanged,
}: {
  propertyId: string;
  images: PropertyImage[];
  onChanged: () => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);

  async function updateRoomType(id: string, roomType: string) {
    const response = await fetch(`/api/properties/${propertyId}/images/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomType }),
    });
    if (!response.ok) {
      console.error('Failed to update room type', response.status);
    }
    onChanged();
  }

  async function deleteImage(id: string) {
    const response = await fetch(`/api/properties/${propertyId}/images/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      console.error('Failed to delete image', response.status);
    }
    onChanged();
  }

  async function reorder(draggedId: string, targetId: string) {
    const ids = images.map((img) => img.id);
    const fromIndex = ids.indexOf(draggedId);
    const toIndex = ids.indexOf(targetId);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;

    const reordered = [...images];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);

    const response = await fetch(`/api/properties/${propertyId}/images/reorder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedIds: reordered.map((img) => img.id) }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      console.error('Failed to reorder images', response.status, body.error);
    }
    onChanged();
  }

  if (images.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
      {images.map((image, index) => (
        <div
          key={image.id}
          draggable
          onDragStart={() => setDraggingId(image.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => draggingId && reorder(draggingId, image.id)}
          className={`group relative flex cursor-move flex-col overflow-hidden rounded-lg border bg-white shadow-sm transition-shadow hover:shadow-md dark:bg-zinc-900 ${
            draggingId === image.id ? 'opacity-50' : 'border-zinc-200 dark:border-zinc-700'
          }`}
        >
          <div className="relative aspect-square w-full bg-zinc-100 dark:bg-zinc-800">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/images/${image.id}/stream`}
              alt={image.room_type}
              className="h-full w-full object-cover"
              draggable={false}
            />
            <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white">
              {index + 1}
            </span>
            <button
              onClick={() => deleteImage(image.id)}
              aria-label="Delete image"
              className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-red-600 group-hover:opacity-100"
            >
              ×
            </button>
          </div>
          <input
            list="room-presets"
            defaultValue={image.room_type}
            onBlur={(e) => updateRoomType(image.id, e.target.value)}
            className="w-full border-t border-zinc-200 bg-transparent px-2 py-1.5 text-sm text-zinc-800 outline-none focus:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:focus:bg-zinc-800"
          />
        </div>
      ))}
      <datalist id="room-presets">
        {ROOM_PRESETS.map((preset) => (
          <option key={preset} value={preset} />
        ))}
      </datalist>
    </div>
  );
}
