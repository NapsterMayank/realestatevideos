import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@realestatevids/db';

const { mockUpdate, mockDelete } = vi.hoisted(() => {
  const mockUpdate = vi.fn();
  const mockDelete = vi.fn();
  return { mockUpdate, mockDelete };
});

vi.mock('@/lib/db', () => ({
  getDb: () => ({
    propertyImage: { update: mockUpdate, delete: mockDelete },
  }),
}));

import { PATCH, DELETE } from './route';

function notFoundError() {
  return new Prisma.PrismaClientKnownRequestError('Record to update not found.', {
    code: 'P2025',
    clientVersion: '5.19.1',
  });
}

describe('PATCH /api/properties/:id/images/:imageId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates the roomType of the given image', async () => {
    mockUpdate.mockResolvedValue({ id: 'img-1', roomType: 'kitchen' });

    const req = new Request('http://localhost/api/properties/p1/images/img-1', {
      method: 'PATCH',
      body: JSON.stringify({ roomType: 'kitchen' }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: 'p1', imageId: 'img-1' }) });
    const body = await res.json();

    expect(mockUpdate).toHaveBeenCalledWith({ where: { id: 'img-1' }, data: { roomType: 'kitchen' } });
    expect(body.ok).toBe(true);
  });

  it('returns 400 when roomType is missing', async () => {
    const req = new Request('http://localhost/api/properties/p1/images/img-1', {
      method: 'PATCH',
      body: JSON.stringify({}),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: 'p1', imageId: 'img-1' }) });

    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns 404 when the image does not exist', async () => {
    mockUpdate.mockRejectedValue(notFoundError());

    const req = new Request('http://localhost/api/properties/p1/images/missing', {
      method: 'PATCH',
      body: JSON.stringify({ roomType: 'kitchen' }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: 'p1', imageId: 'missing' }) });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBeTruthy();
  });
});

describe('DELETE /api/properties/:id/images/:imageId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes the given image row', async () => {
    mockDelete.mockResolvedValue({ id: 'img-1' });

    const req = new Request('http://localhost/api/properties/p1/images/img-1', { method: 'DELETE' });
    const res = await DELETE(req, { params: Promise.resolve({ id: 'p1', imageId: 'img-1' }) });
    const body = await res.json();

    expect(mockDelete).toHaveBeenCalledWith({ where: { id: 'img-1' } });
    expect(body.ok).toBe(true);
  });

  it('returns 404 when the image does not exist', async () => {
    mockDelete.mockRejectedValue(notFoundError());

    const req = new Request('http://localhost/api/properties/p1/images/missing', { method: 'DELETE' });
    const res = await DELETE(req, { params: Promise.resolve({ id: 'p1', imageId: 'missing' }) });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBeTruthy();
  });
});
