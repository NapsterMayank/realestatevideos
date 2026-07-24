import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { PropertyImage } from '@realestatevids/shared';
import { getDb } from '@/lib/db';
import { getPresignedUploadUrl } from '@/lib/storage';

const PHOTOS_BUCKET = process.env.MINIO_PHOTOS_BUCKET ?? 'property-photos';

function mapImage(image: {
  id: string;
  propertyId: string;
  imageUrl: string;
  roomType: string;
  displayOrder: number;
  zoomDirection: string | null;
  createdAt: Date;
}): PropertyImage {
  return {
    id: image.id,
    property_id: image.propertyId,
    image_url: image.imageUrl,
    room_type: image.roomType,
    display_order: image.displayOrder,
    zoom_direction: image.zoomDirection as PropertyImage['zoom_direction'],
    created_at: image.createdAt.toISOString(),
  };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: propertyId } = await params;
  const db = getDb();

  let images;
  try {
    images = await db.propertyImage.findMany({
      where: { propertyId },
      orderBy: { displayOrder: 'asc' },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  return NextResponse.json({ images: images.map(mapImage) });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: propertyId } = await params;
  const body = await request.json().catch(() => ({}));
  const fileName = body.fileName as string | undefined;
  const contentType = body.contentType as string | undefined;

  if (!fileName || !contentType) {
    return NextResponse.json({ error: 'fileName and contentType are required' }, { status: 400 });
  }

  const db = getDb();

  let existing;
  try {
    existing = await db.propertyImage.findMany({
      where: { propertyId },
      select: { displayOrder: true },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  const nextDisplayOrder = Math.max(-1, ...existing.map((image) => image.displayOrder)) + 1;
  const key = `${propertyId}/${randomUUID()}-${fileName}`;

  let image;
  try {
    image = await db.propertyImage.create({
      data: {
        propertyId,
        imageUrl: key,
        roomType: 'bedroom',
        displayOrder: nextDisplayOrder,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  let uploadUrl: string;
  try {
    uploadUrl = await getPresignedUploadUrl(PHOTOS_BUCKET, key, contentType);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Could not sign url' },
      { status: 500 }
    );
  }

  return NextResponse.json({ uploadUrl, imageId: image.id });
}
