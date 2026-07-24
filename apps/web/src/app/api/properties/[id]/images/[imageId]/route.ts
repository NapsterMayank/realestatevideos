import { NextResponse } from 'next/server';
import { Prisma } from '@realestatevids/db';
import { getDb } from '@/lib/db';

function isRecordNotFoundError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025';
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  const { imageId } = await params;
  const body = await request.json().catch(() => ({}));
  const roomType = body.roomType as string | undefined;

  if (!roomType) {
    return NextResponse.json({ error: 'roomType is required' }, { status: 400 });
  }

  const db = getDb();

  try {
    await db.propertyImage.update({ where: { id: imageId }, data: { roomType } });
  } catch (err) {
    if (isRecordNotFoundError(err)) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; imageId: string }> }
) {
  const { imageId } = await params;
  const db = getDb();

  try {
    await db.propertyImage.delete({ where: { id: imageId } });
  } catch (err) {
    if (isRecordNotFoundError(err)) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
