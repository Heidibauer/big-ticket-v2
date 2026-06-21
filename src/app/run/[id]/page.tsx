"use client";

import { useEffect, useState } from "react";
import type { Run } from "@/lib/types";
import ProductCard from "@/components/ProductCard";

const TERMINAL = ["done", "error"];

export default function RunPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [run, setRun] = useState<Run | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [procErr, setProcErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    // Drive the pipeline one stage at a time. Each /process call does a single
    // short stage and tells us whether more work remains. We keep calling until
    // the run is terminal. This avoids any long-running request, which is what
    // was getting killed on the server before.
    async function drive() {
      // First load current state.
      try {
        const res = await fetch(`/api/runs/${id}`, { cache: "no-store" });
        if (res.status === 404) {
          if (alive) setNotFound(true);
          return;
        }
        const data: Run = await res.json();
        if (!alive) return;
        setRun(data);
        if (data.status === "done" || data.status === "error") return;
      } catch {
        if (alive) setTimeout(drive, 2500);
        return;
      }

      // Advance one stage.
      try {
        const r = await fetch(`/api/runs/${id}/process`, { method: "POST" });
        const body = await r.json().catch(() => ({}));
        if (!alive) return;
        if (!r.ok) {
          setProcErr(body.error || `process failed (${r.status})`);
        }
        // Refresh displayed state after the stage.
        const res2 = await fetch(`/api/runs/${id}`, { cache: "no-store" });
        const data2: Run = await res2.json();
        if (!alive) return;
        setRun(data2);
        if (data2.status !== "done" && data2.status !== "error") {
          setTimeout(drive, 600);
        }
      } catch (e) {
        if (!alive) return;
        // Transient: retry the stage after a short pause.
        setTimeout(drive, 2500);
      }
    }

    drive();
    return () => {
      alive = false;
    };
  }, [id]);

  if (notFound) return <Shell><div className="banner">Run not found.</div></Shell>;
  if (!run) return <Shell><div className="row"><span className="spinner" /> <span className="muted">Loading run…</span></div></Shell>;

  const working = !TERMINAL.includes(run.status);

  return (
    <Shell>
      <div className="between" style={{ marginBottom: 16 }}>
        <div>
          <div className="muted small">Brief</div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>
            {run.brief.category} · {run.brief.style} · ${run.brief.budgetMin}–{run.brief.budgetMax}
          </div>
          <div className="muted small">{run.brief.audience}</div>
        </div>
        <span className={`modechip ${run.mode}`}>{run.mode === "live" ? "LIVE DATA" : "MOCK DATA"}</span>
      </div>

      {/* Pipeline progress */}
      <div className="panel" style={{ marginBottom: 18 }}>
        <div className="between" style={{ marginBottom: 10 }}>
          <strong style={{ fontSize: 14 }}>Pipeline</strong>
          {working ? <span className="row small muted"><span className="spinner" /> {run.status}…</span> : <span className="small muted">{run.status}</span>}
        </div>
        <div className="steps">
          {run.steps.map((s, i) => (
            <div className="step" key={i}>
              <span className="dot" />
              <div>
                <span className="label">{s.label}</span>
                {s.detail && <> &nbsp;<span className="detail">{s.detail}</span></>}
              </div>
            </div>
          ))}
          {run.steps.length === 0 && <span className="muted small">Starting…</span>}
        </div>
        {run.error && <div className="banner" style={{ marginTop: 12 }}>{run.error}</div>}
        {procErr && !run.error && (
          <div className="banner" style={{ marginTop: 12 }}>Processing error: {procErr}</div>
        )}
      </div>

      {/* Themes */}
      {run.themes.length > 0 && (
        <div className="panel" style={{ marginBottom: 18 }}>
          <strong style={{ fontSize: 14 }}>Themes the strategist surfaced</strong>
          <div className="grid2" style={{ marginTop: 12 }}>
            {run.themes.map((t) => (
              <div className="theme-card" key={t.id}>
                <div className="between">
                  <h4>{t.title}</h4>
                  <span className={`pill ${t.trendSignal}`}>{t.trendSignal}</span>
                </div>
                <div className="muted small">{t.intent}</div>
                <div className="small" style={{ marginTop: 6 }}>{t.rationale}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Collection */}
      {run.collection && (
        <>
          <div className="collection-head">
            <h2>{run.collection.title}</h2>
            <p className="muted" style={{ maxWidth: 720 }}>{run.collection.editorialAngle}</p>
            <div className="small muted">{run.collection.diversityNotes}</div>
          </div>
          <div className="cards">
            {run.collection.products.map((p, i) => (
              <ProductCard key={p.id} product={p} rank={i + 1} runId={run.id} brief={run.brief} />
            ))}
          </div>
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="container">
      <div className="brand" style={{ marginBottom: 18 }}>
        <a href="/" className="brand-mark" style={{ textDecoration: "none" }}>BT</a>
        <h1 style={{ fontSize: 17 }}>Product Discovery</h1>
      </div>
      {children}
    </div>
  );
}
