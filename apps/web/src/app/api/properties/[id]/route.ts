import { NextResponse } from 'next/server';
import type { Property } from '@realestatevids/shared';
import { getDb } from '@/lib/db';

function mapProperty(property: {
  id: string;
  name: string;
  contactPhone: string;
  contactWebsite: string;
  agencyName: string | null;
  createdAt: Date;
}): Property {
  return {
    id: property.id,
    name: property.name,
    contact_phone: property.contactPhone,
    contact_website: property.contactWebsite,
    agency_name: property.agencyName,
    created_at: property.createdAt.toISOString(),
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  let property;
  try {
    property = await db.property.findUniqueOrThrow({ where: { id } });
  } catch {
    return NextResponse.json({ error: 'Property not found' }, { status: 404 });
  }

  return NextResponse.json({ property: mapProperty(property) });
}
