import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureSchema, saveRun } from "@/lib/db";
import { newRun } from "@/lib/agents/orchestrator";

export const runtime = "nodejs";

const BriefSchema = z.object({
  category: z.string().min(1),
  audience: z.string().min(1),
  style: z.string().min(1),
  budgetMin: z.number().nonnegative(),
  budgetMax: z.number().positive(),
  notes: z.string().optional(),
});

// Create only persists a "queued" run and returns its id immediately. The
// actual pipeline is run by POST /api/runs/[id]/process, which the run page
// fires once. This avoids relying on background execution (waitUntil) surviving
// after the response is sent, which was leaving runs stuck mid-pipeline.
export async function POST(req: Request) {
  try {
    await ensureSchema();
    const body = await req.json();
    const brief = BriefSchema.parse(body);
    const run = newRun(brief);
    await saveRun(run);
    return NextResponse.json({ id: run.id, mode: run.mode, status: run.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "bad request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
