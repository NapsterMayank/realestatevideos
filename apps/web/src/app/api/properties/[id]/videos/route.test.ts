import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFindMany } = vi.hoisted(() => {
  const mockFindMany = vi.fn();
  return { mockFindMany };
});

vi.mock('@/lib/db', () => ({
  getDb: () => ({
    propertyVideo: { findMany: mockFindMany },
  }),
}));

import { GET } from './route';

describe('GET /api/properties/:id/videos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns videos ordered by createdAt desc, mapped to snake_case', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'vid-1',
        propertyId: 'p1',
        variant: 'vertical',
        status: 'done',
        outputUrl: 'vid-1.mp4',
        errorMessage: null,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        completedAt: new Date('2026-01-02T00:05:00.000Z'),
      },
    ]);

    const req = new Request('http://localhost/api/properties/p1/videos');
    const res = await GET(req, { params: Promise.resolve({ id: 'p1' }) });
    const body = await res.json();

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { propertyId: 'p1' },
      orderBy: { createdAt: 'desc' },
    });
    expect(body.videos).toHaveLength(1);
    expect(body.videos[0]).toMatchObject({
      id: 'vid-1',
      property_id: 'p1',
      variant: 'vertical',
      status: 'done',
      output_url: 'vid-1.mp4',
      error_message: null,
    });
  });
});
