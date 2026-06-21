import { NextResponse } from "next/server";
import { getRun, ensureSchema } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await ensureSchema();
  const run = await getRun(params.id);
  if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(run);
}
