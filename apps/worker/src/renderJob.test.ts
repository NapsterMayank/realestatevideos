import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { renderJob, type RenderJobDeps } from './renderJob';
import type { Property, PropertyImage, RenderJobPayload } from '@realestatevids/shared';

const TEMP_DIR = '/tmp/render-v1';

const property: Property = {
  id: 'p1',
  name: '123 Main St',
  contact_phone: '+91 9999999999',
  contact_website: 'www.example.com',
  agency_name: null,
  created_at: '2026-01-01T00:00:00Z',
};

const images: PropertyImage[] = [
  {
    id: 'img1',
    property_id: 'p1',
    image_url: 'storage/img1.jpg',
    room_type: 'bedroom',
    display_order: 0,
    zoom_direction: null,
    created_at: '2026-01-01T00:00:00Z',
  },
];

const payload: RenderJobPayload = {
  propertyVideoId: 'v1',
  propertyId: 'p1',
  width: 1080,
  height: 1920,
};

function makeDeps(overrides: Partial<RenderJobDeps> = {}): RenderJobDeps {
  return {
    fetchProperty: vi.fn().mockResolvedValue(property),
    fetchOrderedImages: vi.fn().mockResolvedValue(images),
    downloadImage: vi.fn().mockResolvedValue(undefined),
    runEditly: vi.fn().mockResolvedValue(undefined),
    uploadVideo: vi.fn().mockResolvedValue('property-videos/p1/v1.mp4'),
    updateVideoStatus: vi.fn().mockResolvedValue(undefined),
    makeTempDir: vi.fn().mockResolvedValue(TEMP_DIR),
    removeTempDir: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('renderJob', () => {
  it('marks processing, renders, uploads, and marks done', async () => {
    const deps = makeDeps();

    await renderJob(payload, deps);

    expect(deps.updateVideoStatus).toHaveBeenNthCalledWith(1, 'v1', { status: 'processing' });
    expect(deps.downloadImage).toHaveBeenCalledWith('storage/img1.jpg', path.join(TEMP_DIR, 'image-0.jpg'));
    expect(deps.runEditly).toHaveBeenCalledOnce();
    expect(deps.uploadVideo).toHaveBeenCalledWith(path.join(TEMP_DIR, 'output.mp4'), 'v1');
    expect(deps.updateVideoStatus).toHaveBeenNthCalledWith(2, 'v1', {
      status: 'done',
      output_url: 'property-videos/p1/v1.mp4',
      completed_at: expect.any(String),
    });
    expect(deps.removeTempDir).toHaveBeenCalledWith(TEMP_DIR);
  });

  it('marks failed with error message and still cleans up temp dir on render error', async () => {
    const deps = makeDeps({
      runEditly: vi.fn().mockRejectedValue(new Error('ffmpeg exploded')),
    });

    await renderJob(payload, deps);

    expect(deps.updateVideoStatus).toHaveBeenNthCalledWith(2, 'v1', {
      status: 'failed',
      error_message: 'ffmpeg exploded',
    });
    expect(deps.removeTempDir).toHaveBeenCalledWith(TEMP_DIR);
  });
});
