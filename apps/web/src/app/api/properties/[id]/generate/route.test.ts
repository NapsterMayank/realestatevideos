import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSingle, mockInsert, mockEqCount, mockFrom, mockEnqueue } = vi.hoisted(() => {
  const mockSingle = vi.fn();
  const mockInsertSelect = vi.fn(() => ({ single: mockSingle }));
  const mockInsert = vi.fn(() => ({ select: mockInsertSelect }));
  const mockEqCount = vi.fn();
  const mockSelectCount = vi.fn(() => ({ eq: mockEqCount }));
  const mockFrom = vi.fn((table: string) => {
    if (table === 'property_images') {
      return { select: mockSelectCount };
    }
    return { insert: mockInsert };
  });
  const mockEnqueue = vi.fn().mockResolvedValue(undefined);
  return { mockSingle, mockInsertSelect, mockInsert, mockEqCount, mockSelectCount, mockFrom, mockEnqueue };
});

vi.mock('@/lib/supabaseServer', () => ({
  getSupabaseServerClient: () => ({ from: mockFrom }),
}));

vi.mock('@/lib/renderQueue', () => ({
  enqueueRenderJob: mockEnqueue,
}));

import { POST } from './route';

describe('POST /api/properties/:id/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEqCount.mockResolvedValue({ count: 3, error: null });
    mockSingle.mockImplementation(async () => ({
      data: { id: 'video-1', property_id: 'p1', variant: 'vertical', status: 'queued' },
      error: null,
    }));
  });

  it('creates one queued row and one job for vertical-only requests', async () => {
    const req = new Request('http://localhost/api/properties/p1/generate', {
      method: 'POST',
      body: JSON.stringify({ landscape: false }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'p1' }) });
    const body = await res.json();

    expect(mockInsert).toHaveBeenCalledTimes(1);
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

    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(mockEnqueue).toHaveBeenCalledTimes(2);
  });

  it('creates exactly one landscape row and job when variant is requested, even if landscape flag is also true', async () => {
    mockSingle.mockImplementation(async () => ({
      data: { id: 'video-2', property_id: 'p1', variant: 'landscape', status: 'queued' },
      error: null,
    }));

    const req = new Request('http://localhost/api/properties/p1/generate', {
      method: 'POST',
      body: JSON.stringify({ variant: 'landscape' }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'p1' }) });
    const body = await res.json();

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ property_id: 'p1', variant: 'landscape', status: 'queued' })
    );
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).toHaveBeenCalledWith(
      expect.objectContaining({ propertyId: 'p1', width: 1920, height: 1080 })
    );
    expect(body.videos).toHaveLength(1);
    expect(body.videos[0].variant).toBe('landscape');
  });

  it('returns 400 when the property has no images', async () => {
    mockEqCount.mockResolvedValue({ count: 0, error: null });

    const req = new Request('http://localhost/api/properties/p1/generate', {
      method: 'POST',
      body: JSON.stringify({ landscape: false }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'p1' }) });

    expect(res.status).toBe(400);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
