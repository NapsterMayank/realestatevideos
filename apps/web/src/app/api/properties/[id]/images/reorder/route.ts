import { NextResponse } from 'next/server';
import { Prisma } from '@realestatevids/db';
import { getDb } from '@/lib/db';

function isRecordNotFoundError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025';
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await params;
  const body = await request.json().catch(() => ({}));
  const orderedIds = body.orderedIds as string[] | undefined;

  if (!Array.isArray(orderedIds)) {
    return NextResponse.json({ error: 'orderedIds must be an array' }, { status: 400 });
  }

  const db = getDb();

  try {
    await db.$transaction(
      orderedIds.map((id, index) =>
        db.propertyImage.update({ where: { id }, data: { displayOrder: index } })
      )
    );
  } catch (err) {
    if (isRecordNotFoundError(err)) {
      return NextResponse.json(
        { error: 'One or more images were deleted before reordering could complete' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
