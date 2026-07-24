import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
