import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureSchema, saveRun } from "@/lib/db";
import { newRun, runPipeline } from "@/lib/agents/orchestrator";

export const runtime = "nodejs";
// The whole pipeline runs in this one request. It's bounded internally (parallel
// evaluation, capped discovery, deadline on the editorial call) so it finishes
// in roughly 30-60s, well within the Pro limit.
export const maxDuration = 300;

const BriefSchema = z.object({
  category: z.string().min(1),
  audience: z.string().min(1),
  style: z.string().min(1),
  budgetMin: z.number().nonnegative(),
  budgetMax: z.number().positive(),
  notes: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    await ensureSchema();
    const body = await req.json();
    const brief = BriefSchema.parse(body);

    const run = newRun(brief);
    await saveRun(run); // persist queued state first (so it's retrievable)

    await runPipeline(run); // runs to completion, mutates run in place
    await saveRun(run); // persist the finished run

    return NextResponse.json(run);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "bad request";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
