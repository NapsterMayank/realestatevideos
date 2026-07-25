'use client';

import { useCallback, useRef, useState } from 'react';

type UploadState = 'uploading' | 'done' | 'error';

interface PendingFile {
  key: string;
  file: File;
  previewUrl: string;
  state: UploadState;
  error?: string;
}

export function ImageUploader({
  propertyId,
  onUploaded,
}: {
  propertyId: string;
  onUploaded: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const dragCounter = useRef(0);

  const isUploading = pending.some((p) => p.state === 'uploading');

  const handleFiles = useCallback(
    async (files: FileList) => {
      const entries: PendingFile[] = Array.from(files)
        .filter((file) => file.type.startsWith('image/'))
        .map((file) => ({
          key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
          file,
          previewUrl: URL.createObjectURL(file),
          state: 'uploading' as UploadState,
        }));

      if (entries.length === 0) return;

      setPending((prev) => [...prev, ...entries]);

      let anySucceeded = false;

      for (const entry of entries) {
        try {
          const createResponse = await fetch(`/api/properties/${propertyId}/images`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileName: entry.file.name, contentType: entry.file.type }),
          });
          if (!createResponse.ok) {
            throw new Error(`Failed to register image (${createResponse.status})`);
          }
          const { uploadUrl, imageId } = await createResponse.json();

          const uploadResponse = await fetch(uploadUrl, {
            method: 'PUT',
            body: entry.file,
            headers: { 'Content-Type': entry.file.type },
          });
          if (!uploadResponse.ok) {
            await fetch(`/api/properties/${propertyId}/images/${imageId}`, { method: 'DELETE' });
            throw new Error(`Upload failed (${uploadResponse.status})`);
          }

          anySucceeded = true;
          setPending((prev) =>
            prev.map((p) => (p.key === entry.key ? { ...p, state: 'done' } : p))
          );
        } catch (error) {
          console.error('Upload failed', error);
          setPending((prev) =>
            prev.map((p) =>
              p.key === entry.key
                ? { ...p, state: 'error', error: error instanceof Error ? error.message : String(error) }
                : p
            )
          );
        }
      }

      if (anySucceeded) {
        onUploaded();
      }

      // Clear finished entries after a short delay so success/failure is visible briefly.
      setTimeout(() => {
        setPending((prev) => {
          for (const p of prev) {
            if (p.state !== 'uploading') URL.revokeObjectURL(p.previewUrl);
          }
          return prev.filter((p) => p.state === 'uploading');
        });
      }, 2000);
    },
    [propertyId, onUploaded]
  );

  function onDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current += 1;
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true);
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragging(false);
    }
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }

  return (
    <div className="w-full">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={`flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
          isDragging
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
            : 'border-zinc-300 bg-zinc-50 hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600'
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="h-10 w-10 text-zinc-400"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 7.5m0 0L7.5 12m4.5-4.5v13.5"
          />
        </svg>
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
          {isDragging ? 'Drop photos to upload' : 'Drag photos here, or click to browse'}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">JPG, PNG, WebP — multiple files supported</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {pending.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {pending.map((p) => (
            <div key={p.key} className="relative aspect-square overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.previewUrl} alt={p.file.name} className="h-full w-full object-cover" />
              <div
                className={`absolute inset-0 flex items-center justify-center text-xs font-medium text-white ${
                  p.state === 'uploading'
                    ? 'bg-black/40'
                    : p.state === 'error'
                      ? 'bg-red-600/70'
                      : 'bg-transparent'
                }`}
              >
                {p.state === 'uploading' ? 'Uploading…' : p.state === 'error' ? (p.error ?? 'Failed') : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {isUploading ? <p className="mt-2 text-sm text-zinc-500">Uploading…</p> : null}
    </div>
  );
}
