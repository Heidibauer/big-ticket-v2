// Storage layer. Uses Neon Postgres when DATABASE_URL is set, otherwise an
// in-memory store so the app runs end-to-end with zero infra. Same interface
// either way, so callers never branch on storage mode.

import { neon } from "@neondatabase/serverless";
import type { Run, Feedback } from "@/lib/types";

const url = process.env.DATABASE_URL;
const sql = url ? neon(url) : null;

// ---- in-memory fallback ----
const mem = {
  runs: new Map<string, Run>(),
  feedback: [] as Feedback[],
};

export const usingPostgres = !!sql;

export async function ensureSchema() {
  if (!sql) return;
  await sql`
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `;
}

export async function saveRun(run: Run): Promise<void> {
  if (sql) {
    await sql`
      INSERT INTO runs (id, data) VALUES (${run.id}, ${JSON.stringify(run)}::jsonb)
      ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data;
    `;
  } else {
    mem.runs.set(run.id, run);
  }
}

export async function getRun(id: string): Promise<Run | null> {
  if (sql) {
    const rows = (await sql`SELECT data FROM runs WHERE id = ${id}`) as { data: Run }[];
    return rows[0]?.data ?? null;
  }
  return mem.runs.get(id) ?? null;
}

export async function listRuns(limit = 25): Promise<Run[]> {
  if (sql) {
    const rows = (await sql`
      SELECT data FROM runs ORDER BY created_at DESC LIMIT ${limit}
    `) as { data: Run }[];
    return rows.map((r) => r.data);
  }
  return [...mem.runs.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

export async function saveFeedback(fb: Feedback): Promise<void> {
  if (sql) {
    await sql`
      INSERT INTO feedback (id, run_id, data)
      VALUES (${fb.id}, ${fb.runId}, ${JSON.stringify(fb)}::jsonb);
    `;
  } else {
    mem.feedback.push(fb);
  }
}

// Pull recent feedback relevant to a brief so the evaluator can learn the
// operator's taste over time. We match loosely on category + audience + style.
export async function getRelevantFeedback(
  brief: Pick<Feedback["brief"], "category" | "audience" | "style">,
  limit = 40
): Promise<Feedback[]> {
  let all: Feedback[];
  if (sql) {
    const rows = (await sql`
      SELECT data FROM feedback ORDER BY created_at DESC LIMIT 400
    `) as { data: Feedback }[];
    all = rows.map((r) => r.data);
  } else {
    all = [...mem.feedback].reverse();
  }
  const cat = brief.category.toLowerCase();
  const scored = all
    .map((f) => {
      let rel = 0;
      if (f.brief.category.toLowerCase() === cat) rel += 3;
      if (f.brief.audience.toLowerCase() === brief.audience.toLowerCase()) rel += 1;
      if (f.brief.style.toLowerCase() === brief.style.toLowerCase()) rel += 1;
      return { f, rel };
    })
    .filter((x) => x.rel > 0)
    .sort((a, b) => b.rel - a.rel);
  return scored.slice(0, limit).map((x) => x.f);
}
