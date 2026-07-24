import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCount, mockCreate, mockEnqueue } = vi.hoisted(() => {
  const mockCount = vi.fn();
  const mockCreate = vi.fn();
  const mockEnqueue = vi.fn().mockResolvedValue(undefined);
  return { mockCount, mockCreate, mockEnqueue };
});

vi.mock('@/lib/db', () => ({
  getDb: () => ({
    propertyImage: { count: mockCount },
    propertyVideo: { create: mockCreate },
  }),
}));

vi.mock('@/lib/renderQueue', () => ({
  enqueueRenderJob: mockEnqueue,
}));

import { POST } from './route';

describe('POST /api/properties/:id/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCount.mockResolvedValue(3);
    mockCreate.mockImplementation(async ({ data }: { data: { propertyId: string; variant: string; status: string } }) => ({
      id: 'video-1',
      propertyId: data.propertyId,
      variant: data.variant,
      status: data.status,
    }));
  });

  it('creates one queued row and one job for vertical-only requests', async () => {
    const req = new Request('http://localhost/api/properties/p1/generate', {
      method: 'POST',
      body: JSON.stringify({ landscape: false }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'p1' }) });
    const body = await res.json();

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ propertyId: 'p1', width: 1080, height: 1920 })
    );
    expect(body.videos).toHaveLength(1);
  });

  it('creates two rows and two jobs when landscape is requested', async () => {
    const req = new Request('http://localhost/api/properties/p1/generate', {
      method: 'POST',
      body: JSON.stringify({ landscape: true }),
    });

    await POST(req, { params: Promise.resolve({ id: 'p1' }) });

    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(mockEnqueue).toHaveBeenCalledTimes(2);
  });

  it('creates exactly one landscape row and job when variant is requested, even if landscape flag is also true', async () => {
    mockCreate.mockImplementation(async ({ data }: { data: { propertyId: string; variant: string; status: string } }) => ({
      id: 'video-2',
      propertyId: data.propertyId,
      variant: data.variant,
      status: data.status,
    }));

    const req = new Request('http://localhost/api/properties/p1/generate', {
      method: 'POST',
      body: JSON.stringify({ variant: 'landscape', landscape: true }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'p1' }) });
    const body = await res.json();

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ propertyId: 'p1', variant: 'landscape', status: 'queued' }),
      })
    );
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ propertyId: 'p1', width: 1920, height: 1080 })
    );
    expect(body.videos).toHaveLength(1);
    expect(body.videos[0].variant).toBe('landscape');
  });

  it('returns 400 when the property has no images', async () => {
    mockCount.mockResolvedValue(0);

    const req = new Request('http://localhost/api/properties/p1/generate', {
      method: 'POST',
      body: JSON.stringify({ landscape: false }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'p1' }) });

    expect(res.status).toBe(400);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
