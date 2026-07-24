import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockTransaction, mockUpdate } = vi.hoisted(() => {
  const mockTransaction = vi.fn();
  const mockUpdate = vi.fn();
  return { mockTransaction, mockUpdate };
});

vi.mock('@/lib/db', () => ({
  getDb: () => ({
    propertyImage: { update: mockUpdate },
    $transaction: mockTransaction,
  }),
}));

import { PATCH } from './route';

describe('PATCH /api/properties/:id/images/reorder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTransaction.mockImplementation(async (ops: unknown[]) => ops);
    mockUpdate.mockImplementation((args: unknown) => args);
  });

  it('updates displayOrder for every id to match its array index in a single transaction call', async () => {
    const req = new Request('http://localhost/api/properties/p1/images/reorder', {
      method: 'PATCH',
      body: JSON.stringify({ orderedIds: ['img-c', 'img-a', 'img-b'] }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: 'p1' }) });
    const body = await res.json();

    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledTimes(3);
    expect(mockUpdate).toHaveBeenNthCalledWith(1, { where: { id: 'img-c' }, data: { displayOrder: 0 } });
    expect(mockUpdate).toHaveBeenNthCalledWith(2, { where: { id: 'img-a' }, data: { displayOrder: 1 } });
    expect(mockUpdate).toHaveBeenNthCalledWith(3, { where: { id: 'img-b' }, data: { displayOrder: 2 } });
    expect(body.ok).toBe(true);
  });

  it('returns 400 when orderedIds is not an array', async () => {
    const req = new Request('http://localhost/api/properties/p1/images/reorder', {
      method: 'PATCH',
      body: JSON.stringify({}),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: 'p1' }) });

    expect(res.status).toBe(400);
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
