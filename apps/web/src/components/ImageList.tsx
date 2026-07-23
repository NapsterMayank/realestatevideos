'use client';

import { useState } from 'react';
import type { PropertyImage } from '@realestatevids/shared';
import { getSupabaseBrowserClient } from '@/lib/supabaseBrowser';

const ROOM_PRESETS = ['bedroom', 'kitchen', 'living room', 'bathroom', 'exterior', 'balcony', 'dining room'];

export function ImageList({
  images,
  onChanged,
}: {
  images: PropertyImage[];
  onChanged: () => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);

  async function updateRoomType(id: string, roomType: string) {
    const supabase = getSupabaseBrowserClient();
    await supabase.from('property_images').update({ room_type: roomType }).eq('id', id);
    onChanged();
  }

  async function deleteImage(id: string) {
    const supabase = getSupabaseBrowserClient();
    await supabase.from('property_images').delete().eq('id', id);
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

    const supabase = getSupabaseBrowserClient();
    await Promise.all(
      reordered.map((img, index) =>
        supabase.from('property_images').update({ display_order: index }).eq('id', img.id)
      )
    );
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
