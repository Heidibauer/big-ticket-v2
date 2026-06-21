import { listRuns, ensureSchema } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  await ensureSchema();
  const runs = await listRuns(30);
  return (
    <div className="container">
      <div className="brand" style={{ marginBottom: 18 }}>
        <Link href="/" className="brand-mark" style={{ textDecoration: "none" }}>BT</Link>
        <h1 style={{ fontSize: 17 }}>Past runs</h1>
      </div>
      <div className="panel">
        {runs.length === 0 && <div className="muted small">No runs yet. Start one from the home page.</div>}
        {runs.map((r) => (
          <Link key={r.id} href={`/run/${r.id}`} className="between" style={{ display: "flex", padding: "12px 0", borderBottom: "1px solid var(--border)", textDecoration: "none" }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{r.brief.category} · {r.brief.style}</div>
              <div className="muted small">{r.brief.audience} · ${r.brief.budgetMin}–{r.brief.budgetMax}</div>
            </div>
            <div className="row">
              <span className={`modechip ${r.mode}`}>{r.mode}</span>
              <span className="muted small">{r.status}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
