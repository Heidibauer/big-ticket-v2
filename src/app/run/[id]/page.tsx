"use client";

import { useEffect, useState } from "react";
import type { Run } from "@/lib/types";
import ProductCard from "@/components/ProductCard";
import { Logo } from "@/components/Logo";

function cap(x: string){return x.charAt(0).toUpperCase()+x.slice(1);}
const TERMINAL = ["done", "error"];

// Playful status copy so the wait feels like the system working FOR you.
const STATUS_COPY: Record<string, string> = {
  queued: "Getting started",
  discovering: "Digging through the best retailers",
  evaluating: "Sizing up looks, value, and reviews",
  curating: "Narrowing it down",
  done: "Here&apos;s the good stuff",
  error: "Hit a snag",
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

  if (notFound) return <Shell><div className="banner">We couldn&apos;t find that one.</div></Shell>;
  if (!run) return <Shell><div className="row"><span className="spinner dark" /> <span className="muted">Loading…</span></div></Shell>;

  const working = !TERMINAL.includes(run.status);

  return (
    <Shell>
      <div className="between" style={{ marginBottom: 24, gap: 12 }}>
        <a href="/" className="link-quiet" style={{ fontSize: 13 }}>← New search</a>
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
          <header className="result-head fade-up">
            <div className="result-overline">Hand-picked for you</div>
            <h2 className="result-title">{cap(run.brief.category)}</h2>
            <p className="result-sub">{run.collection.editorialAngle}</p>
            <div className="result-facts">
              <span className="result-stat">{run.collection.products.length} picks</span>
              <span className="result-dot">·</span>
              <span className="result-stat">${run.brief.budgetMin}–{run.brief.budgetMax}</span>
              {run.collection.diversityNotes && (
                <>
                  <span className="result-dot">·</span>
                  <span className="result-stat muted">{run.collection.diversityNotes}</span>
                </>
              )}
            </div>
            <div className="result-criteria">
              {run.brief.style.split(/,\s*/).filter(Boolean).slice(0, 6).map((t) => (
                <span className="criteria-tag" key={t}>{t}</span>
              ))}
            </div>
          </header>
          <div className="cards">
            {run.collection.products.map((p, i) => (
              <ProductCard key={p.id} product={p} rank={i + 1} runId={run.id} brief={run.brief} />
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: 32 }}>
            <a href="/" className="btn">Find something else</a>
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
        <a href="/" style={{ textDecoration: "none" }}><Logo height={38} /></a>
      </div>
      {children}
    </div>
  );
}
