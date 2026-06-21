import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";
import { ensureSchema, saveRun, usingPostgres } from "@/lib/db";
import { newRun, runPipeline } from "@/lib/agents/orchestrator";

export const runtime = "nodejs";
export const maxDuration = 300; // allow long agent runs on Vercel

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
    await saveRun(run);

    // Respond immediately with the run id so the browser never waits on the
    // full pipeline (which can take 30-90s and would otherwise hit the
    // serverless request timeout -> "failed to fetch"). waitUntil keeps the
    // function alive to finish the pipeline in the background; the run page
    // polls GET /api/runs/[id] for live progress.
    //
    // Always hand the pipeline to the background via waitUntil so the POST
    // returns in well under a second (no more 504 on /api/runs/create). The
    // function stays alive to finish the work; the run page polls for progress.
    //
    // In-memory fallback (no DATABASE_URL) can't share state across requests,
    // so there we run inline as a last resort and at least return the finished
    // run directly. With Postgres configured (production), it's fully backgrounded.
    if (usingPostgres) {
      waitUntil(runPipeline(run));
    } else {
      await runPipeline(run);
    }

    return NextResponse.json({ id: run.id, mode: run.mode, status: run.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "bad request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
