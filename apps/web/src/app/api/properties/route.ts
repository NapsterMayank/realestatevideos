import { NextResponse } from 'next/server';
import type { Property } from '@realestatevids/shared';
import { getDb } from '@/lib/db';

function mapProperty(property: {
  id: string;
  name: string;
  contactPhone: string;
  contactWebsite: string | null;
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

export async function GET() {
  const db = getDb();

  let properties;
  try {
    properties = await db.property.findMany({ orderBy: { createdAt: 'desc' } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  return NextResponse.json({ properties: properties.map(mapProperty) });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const contactPhone = typeof body.contact_phone === 'string' ? body.contact_phone.trim() : '';
  const contactWebsite =
    typeof body.contact_website === 'string' && body.contact_website.trim() ? body.contact_website.trim() : null;
  const agencyName = typeof body.agency_name === 'string' && body.agency_name.trim() ? body.agency_name.trim() : null;

  if (!name || !contactPhone) {
    return NextResponse.json(
      { error: 'name and contact_phone are required' },
      { status: 400 }
    );
  }

  const db = getDb();

  let property;
  try {
    property = await db.property.create({
      data: { name, contactPhone, contactWebsite, agencyName },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  return NextResponse.json({ property: mapProperty(property) }, { status: 201 });
}
