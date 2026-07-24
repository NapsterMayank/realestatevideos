import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFindMany, mockCreate, mockPresign } = vi.hoisted(() => {
  const mockFindMany = vi.fn();
  const mockCreate = vi.fn();
  const mockPresign = vi.fn();
  return { mockFindMany, mockCreate, mockPresign };
});

vi.mock('@/lib/db', () => ({
  getDb: () => ({
    propertyImage: { findMany: mockFindMany, create: mockCreate },
  }),
}));

vi.mock('@/lib/storage', () => ({
  getPresignedUploadUrl: mockPresign,
}));

import { GET, POST } from './route';

describe('GET /api/properties/:id/images', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns images ordered by displayOrder, mapped to snake_case', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'img-1',
        propertyId: 'p1',
        imageUrl: 'p1/img-1.jpg',
        roomType: 'bedroom',
        displayOrder: 0,
        zoomDirection: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);

    const req = new Request('http://localhost/api/properties/p1/images');
    const res = await GET(req, { params: Promise.resolve({ id: 'p1' }) });
    const body = await res.json();

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { propertyId: 'p1' },
      orderBy: { displayOrder: 'asc' },
    });
    expect(body.images).toHaveLength(1);
    expect(body.images[0]).toMatchObject({
      id: 'img-1',
      property_id: 'p1',
      image_url: 'p1/img-1.jpg',
      room_type: 'bedroom',
      display_order: 0,
    });
  });
});

describe('POST /api/properties/:id/images', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPresign.mockResolvedValue('https://minio.local/signed-put-url');
  });

  it('computes displayOrder via Math.max over existing rows + 1, not .length', async () => {
    // Regression test for the Task-11 collision fix: three existing rows with
    // displayOrder 0, 1, 3 (a gap, as would happen after a delete) must yield
    // nextDisplayOrder = 4, not images.length (3).
    mockFindMany.mockResolvedValue([
      { displayOrder: 0 },
      { displayOrder: 1 },
      { displayOrder: 3 },
    ]);
    mockCreate.mockImplementation(async ({ data }: { data: { propertyId: string; imageUrl: string; roomType: string; displayOrder: number } }) => ({
      id: 'img-new',
      propertyId: data.propertyId,
      imageUrl: data.imageUrl,
      roomType: data.roomType,
      displayOrder: data.displayOrder,
      zoomDirection: null,
      createdAt: new Date(),
    }));

    const req = new Request('http://localhost/api/properties/p1/images', {
      method: 'POST',
      body: JSON.stringify({ fileName: 'house.jpg', contentType: 'image/jpeg' }),
    });

    await POST(req, { params: Promise.resolve({ id: 'p1' }) });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ displayOrder: 4 }) })
    );
  });

  it('defaults displayOrder to 0 and roomType to bedroom when no images exist', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCreate.mockImplementation(async ({ data }: { data: { propertyId: string; imageUrl: string; roomType: string; displayOrder: number } }) => ({
      id: 'img-new',
      propertyId: data.propertyId,
      imageUrl: data.imageUrl,
      roomType: data.roomType,
      displayOrder: data.displayOrder,
      zoomDirection: null,
      createdAt: new Date(),
    }));

    const req = new Request('http://localhost/api/properties/p1/images', {
      method: 'POST',
      body: JSON.stringify({ fileName: 'house.jpg', contentType: 'image/jpeg' }),
    });

    await POST(req, { params: Promise.resolve({ id: 'p1' }) });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ displayOrder: 0, roomType: 'bedroom', propertyId: 'p1' }),
      })
    );
  });

  it('returns a presigned upload URL and the created imageId', async () => {
    mockFindMany.mockResolvedValue([]);
    mockCreate.mockResolvedValue({
      id: 'img-new',
      propertyId: 'p1',
      imageUrl: 'p1/some-key-house.jpg',
      roomType: 'bedroom',
      displayOrder: 0,
      zoomDirection: null,
      createdAt: new Date(),
    });

    const req = new Request('http://localhost/api/properties/p1/images', {
      method: 'POST',
      body: JSON.stringify({ fileName: 'house.jpg', contentType: 'image/jpeg' }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'p1' }) });
    const body = await res.json();

    expect(mockPresign).toHaveBeenCalledWith(
      'property-photos',
      expect.stringContaining('house.jpg'),
      'image/jpeg'
    );
    expect(body.uploadUrl).toBe('https://minio.local/signed-put-url');
    expect(body.imageId).toBe('img-new');
  });

  it('returns 400 when fileName or contentType is missing', async () => {
    const req = new Request('http://localhost/api/properties/p1/images', {
      method: 'POST',
      body: JSON.stringify({ fileName: 'house.jpg' }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: 'p1' }) });

    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
