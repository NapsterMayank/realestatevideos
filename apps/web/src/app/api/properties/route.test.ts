import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFindMany, mockCreate } = vi.hoisted(() => {
  const mockFindMany = vi.fn();
  const mockCreate = vi.fn();
  return { mockFindMany, mockCreate };
});

vi.mock('@/lib/db', () => ({
  getDb: () => ({
    property: { findMany: mockFindMany, create: mockCreate },
  }),
}));

import { GET, POST } from './route';

describe('GET /api/properties', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns properties ordered by createdAt desc, mapped to snake_case', async () => {
    mockFindMany.mockResolvedValue([
      {
        id: 'p1',
        name: 'Sunny Villa',
        contactPhone: '555-0100',
        contactWebsite: 'https://example.com',
        agencyName: 'Acme Realty',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ]);

    const res = await GET();
    const body = await res.json();

    expect(mockFindMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'desc' } });
    expect(body.properties).toHaveLength(1);
    expect(body.properties[0]).toMatchObject({
      id: 'p1',
      name: 'Sunny Villa',
      contact_phone: '555-0100',
      contact_website: 'https://example.com',
      agency_name: 'Acme Realty',
    });
  });
});

describe('POST /api/properties', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a property and returns it mapped to snake_case', async () => {
    mockCreate.mockResolvedValue({
      id: 'p1',
      name: 'Sunny Villa',
      contactPhone: '555-0100',
      contactWebsite: 'https://example.com',
      agencyName: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const req = new Request('http://localhost/api/properties', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Sunny Villa',
        contact_phone: '555-0100',
        contact_website: 'https://example.com',
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        name: 'Sunny Villa',
        contactPhone: '555-0100',
        contactWebsite: 'https://example.com',
        agencyName: null,
      },
    });
    expect(res.status).toBe(201);
    expect(body.property).toMatchObject({ id: 'p1', name: 'Sunny Villa' });
  });

  it('returns 400 when required fields are missing', async () => {
    const req = new Request('http://localhost/api/properties', {
      method: 'POST',
      body: JSON.stringify({ name: 'Sunny Villa' }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('trims whitespace and treats blank agency_name as null', async () => {
    mockCreate.mockResolvedValue({
      id: 'p1',
      name: 'Sunny Villa',
      contactPhone: '555-0100',
      contactWebsite: 'https://example.com',
      agencyName: null,
      createdAt: new Date(),
    });

    const req = new Request('http://localhost/api/properties', {
      method: 'POST',
      body: JSON.stringify({
        name: '  Sunny Villa  ',
        contact_phone: ' 555-0100 ',
        contact_website: ' https://example.com ',
        agency_name: '   ',
      }),
    });

    await POST(req);

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        name: 'Sunny Villa',
        contactPhone: '555-0100',
        contactWebsite: 'https://example.com',
        agencyName: null,
      },
    });
  });
});
