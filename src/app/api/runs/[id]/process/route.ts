import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Deprecated. The pipeline now runs synchronously inside POST /api/runs/create,
// so there is no separate processing step. Kept as a harmless no-op so any stale
// client or bookmark doesn't 404 in a confusing way.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  return NextResponse.json({ id: params.id, deprecated: true });
}
