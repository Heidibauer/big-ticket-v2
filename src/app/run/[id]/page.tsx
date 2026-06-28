"use client";

import { useEffect, useState } from "react";
import type { Run } from "@/lib/types";
import ProductCard from "@/components/ProductCard";

const TERMINAL = ["done", "error"];

// Playful status copy so the wait feels like the system working FOR you.
const STATUS_COPY: Record<string, string> = {
  queued: "Warming up the research engine",
  discovering: "Hunting across real retailers",
  evaluating: "Judging looks, value, and reviews",
  curating: "Curating your shortlist",
  done: "Your shortlist is ready",
  error: "Something went sideways",
};

export default function RunPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const [run, setRun] = useState<Run | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    let tries = 0;
    async function load() {
      try {
        const res = await fetch(`/api/runs/${id}`, { cache: "no-store" });
        if (res.status === 404) { if (alive) setNotFound(true); return; }
        const data: Run = await res.json();
        if (!alive) return;
        setRun(data);
        const done = data.status === "done" || data.status === "error";
        if (!done && tries++ < 90) timer = setTimeout(load, 2000);
      } catch {
        if (alive && tries++ < 90) timer = setTimeout(load, 2500);
      }
    }
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, [id]);

  if (notFound) return <Shell><div className="banner">We couldn&apos;t find that hunt.</div></Shell>;
  if (!run) return <Shell><div className="row"><span className="spinner dark" /> <span className="muted">Loading…</span></div></Shell>;

  const working = !TERMINAL.includes(run.status);

  return (
    <Shell>
      <div className="between" style={{ marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div className="muted small" style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Your hunt</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--black)" }}>
            {run.brief.category} <span className="muted" style={{ fontWeight: 600 }}>·</span> {run.brief.style}
          </div>
          <div className="muted small">{run.brief.audience} · ${run.brief.budgetMin}–{run.brief.budgetMax}</div>
        </div>
        <span className={`modechip ${run.mode}`}>{run.mode === "live" ? "● LIVE" : "○ DEMO"}</span>
      </div>

      {/* Live pipeline — shown while working */}
      {(working || run.steps.length > 0) && !run.collection && (
        <div className="hero fade-up" style={{ marginBottom: 20 }}>
          <div className="between" style={{ marginBottom: 14 }}>
            <div className="tagline" style={{ marginBottom: 0 }}>
              {STATUS_COPY[run.status] || "Working"}
            </div>
            {working && <span className="spinner" />}
          </div>
          <div className="steps">
            {run.steps.map((s, i) => (
              <div className="step" key={i} style={{ color: "#fff" }}>
                <span className="dot" style={{ background: "#fff", boxShadow: "0 0 0 4px rgba(255,255,255,0.2)" }} />
                <div>
                  <span className="label" style={{ color: "#fff" }}>{s.label}</span>
                  {s.detail && <> &nbsp;<span style={{ color: "rgba(255,255,255,0.8)" }}>{s.detail}</span></>}
                </div>
              </div>
            ))}
            {run.steps.length === 0 && <span style={{ color: "rgba(255,255,255,0.85)" }}>Starting…</span>}
          </div>
          {run.error && <div className="banner" style={{ marginTop: 14 }}>{run.error}</div>}
        </div>
      )}

      {/* Themes */}
      {run.themes.length > 0 && !run.collection && (
        <div className="panel fade-up" style={{ marginBottom: 18 }}>
          <strong style={{ fontSize: 14, color: "var(--deep-purple)" }}>Angles we&apos;re exploring</strong>
          <div className="grid2" style={{ marginTop: 12 }}>
            {run.themes.map((t) => (
              <div className="theme-card" key={t.id}>
                <div className="between">
                  <h4>{t.title}</h4>
                  <span className={`pill ${t.trendSignal}`}>{t.trendSignal}</span>
                </div>
                <div className="muted small">{t.intent}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Collection */}
      {run.collection && (
        <>
          <div className="collection-head fade-up">
            <div className="tagline" style={{ color: "var(--deep-purple)", marginBottom: 8 }}>Your curated shortlist</div>
            <h2 className="gradient-text">{run.collection.title}</h2>
            <p className="muted" style={{ maxWidth: 740, fontSize: 15, lineHeight: 1.6 }}>{run.collection.editorialAngle}</p>
            <div className="small muted" style={{ marginTop: 6, fontWeight: 600 }}>{run.collection.diversityNotes}</div>
          </div>
          <div className="cards">
            {run.collection.products.map((p, i) => (
              <ProductCard key={p.id} product={p} rank={i + 1} runId={run.id} brief={run.brief} />
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: 32 }}>
            <a href="/" className="btn">✨ Start a new hunt</a>
          </div>
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="container">
      <div className="brand" style={{ marginBottom: 22 }}>
        <a href="/" className="brand-mark" style={{ textDecoration: "none" }}>
          <span className="c1" /><span className="c2" />
        </a>
        <a href="/" style={{ textDecoration: "none" }}><span className="wordmark">Big Ticket<span className="dot">.</span></span></a>
      </div>
      {children}
    </div>
  );
}
