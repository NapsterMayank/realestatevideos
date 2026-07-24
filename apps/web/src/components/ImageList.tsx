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
      body: JSON.stringify({ orderedIds: reordered.map((img) => img.id) }),
    });
    if (!response.ok) {
      console.error('Failed to reorder images', response.status);
    }
    onChanged();
  }

  return (
    <ul>
      {images.map((image) => (
        <li
          key={image.id}
          draggable
          onDragStart={() => setDraggingId(image.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => draggingId && reorder(draggingId, image.id)}
        >
          <input
            list="room-presets"
            defaultValue={image.room_type}
            onBlur={(e) => updateRoomType(image.id, e.target.value)}
          />
          <button onClick={() => deleteImage(image.id)}>Delete</button>
        </li>
      ))}
      <datalist id="room-presets">
        {ROOM_PRESETS.map((preset) => (
          <option key={preset} value={preset} />
        ))}
      </datalist>
    </ul>
  );
}
