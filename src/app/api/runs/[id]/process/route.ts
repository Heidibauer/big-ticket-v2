import { NextResponse } from "next/server";
import { ensureSchema, getRun } from "@/lib/db";
import { advanceRun } from "@/lib/agents/orchestrator";

export const runtime = "nodejs";
export const maxDuration = 60; // one stage only; finishes in a few seconds

// Advances the run by exactly ONE stage and returns. The client calls this
// repeatedly (once per poll) until the run is terminal. Keeping each request
// short avoids the serverless termination that long-running requests hit.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    await ensureSchema();
    const run = await getRun(params.id);
    if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });

    if (run.status === "done" || run.status === "error") {
      return NextResponse.json({ id: run.id, status: run.status, more: false });
    }

    const more = await advanceRun(run);
    return NextResponse.json({ id: run.id, status: run.status, more });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "process failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
