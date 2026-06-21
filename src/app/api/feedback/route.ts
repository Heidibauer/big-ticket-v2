import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureSchema, saveFeedback } from "@/lib/db";
import type { Feedback } from "@/lib/types";

export const runtime = "nodejs";

const Schema = z.object({
  runId: z.string(),
  productId: z.string(),
  productTitle: z.string(),
  signal: z.enum(["love", "pass"]),
  note: z.string().optional(),
  brief: z.object({
    category: z.string(),
    audience: z.string(),
    style: z.string(),
  }),
});

export async function POST(req: Request) {
  try {
    await ensureSchema();
    const body = await req.json();
    const data = Schema.parse(body);
    const fb: Feedback = {
      id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      ...data,
      createdAt: new Date().toISOString(),
    };
    await saveFeedback(fb);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "bad request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
