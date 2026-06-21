import { NextResponse } from "next/server";
import { ensureSchema, getRun } from "@/lib/db";
import { runPipeline } from "@/lib/agents/orchestrator";

export const runtime = "nodejs";
export const maxDuration = 300; // pipeline runs inline within this request

// Runs the pipeline for an existing queued run, to completion, within this
// request. The run page calls this exactly once after navigating. Because the
// work is awaited inside a real request (not a fire-and-forget background task),
// it reliably finishes and writes a terminal status the poller can see.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    await ensureSchema();
    const run = await getRun(params.id);
    if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });

    // Only process queued runs; ignore duplicate triggers.
    if (run.status !== "queued") {
      return NextResponse.json({ id: run.id, status: run.status });
    }

    await runPipeline(run);
    return NextResponse.json({ id: run.id, status: run.status });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "process failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
