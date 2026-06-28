"use client";

import { useState } from "react";
import type { EvaluatedProduct, DiscoveryBrief } from "@/lib/types";

function scoreColor(n: number): string {
  if (n >= 72) return "linear-gradient(120deg,#53c9ee,#5e1eb9)";
  if (n >= 55) return "linear-gradient(120deg,#7c8bff,#403ec6)";
  return "linear-gradient(120deg,#bdbdc7,#8a8a93)";
}

const VERDICT_LABEL: Record<string, string> = {
  recommend: "Top pick",
  consider: "Worth a look",
  pass: "Long shot",
};

const AXES: { key: keyof EvaluatedProduct["evaluation"]["scores"]; label: string }[] = [
  { key: "intentMatch", label: "Match" },
  { key: "aesthetics", label: "Looks" },
  { key: "value", label: "Value" },
  { key: "quality", label: "Quality" },
];

export default function ProductCard({
  product,
  rank,
  runId,
  brief,
}: {
  product: EvaluatedProduct;
  rank: number;
  runId: string;
  brief: DiscoveryBrief;
}) {
  const e = product.evaluation;
  const [signal, setSignal] = useState<"love" | "pass" | null>(null);
  const [busy, setBusy] = useState(false);
  const [showScores, setShowScores] = useState(false);

  async function sendFeedback(s: "love" | "pass") {
    if (busy) return;
    const next = signal === s ? null : s;
    setSignal(next);
    if (!next) return;
    setBusy(true);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId,
          productId: product.id,
          productTitle: product.title,
          signal: next,
          brief: { category: brief.category, audience: brief.audience, style: brief.style },
        }),
      });
    } catch {
      /* keep the visual state even if the network blips */
    } finally {
      setBusy(false);
    }
  }

  const priceStr = product.price != null ? `$${product.price}` : null;
  const ratingStr = product.rating != null ? `${product.rating}★` : null;

  return (
    <div className="card fade-up">
      <div className="card-image">
        <span className="card-rank-badge">#{rank}</span>
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt={product.title}
            loading="lazy"
            onError={(ev) => {
              (ev.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : null}
      </div>

      <div className="card-body">
        {/* PRIMARY: title + key facts + score */}
        <div className="card-top">
          <div style={{ minWidth: 0 }}>
            <h3>{product.title}</h3>
            <div className="meta">
              {product.retailer || product.brand}
              {priceStr && <> · <b style={{ color: "var(--black)" }}>{priceStr}</b></>}
              {ratingStr && <> · {ratingStr} <span style={{ opacity: 0.7 }}>({product.reviewCount ?? 0})</span></>}
            </div>
          </div>
          <div className="score-badge" style={{ background: scoreColor(e.composite) }} title="Overall desirability score">
            {e.composite}
          </div>
        </div>

        {/* SECONDARY: editorial hook — why it fits the brief */}
        {e.matchReason && (
          <div className="match-reason">
            <span className="match-label">Why it fits</span> {e.matchReason}
          </div>
        )}

        {/* The editor's note. Hide the dev-y "Scored from signals" fallback text. */}
        {e.rationale && !/^scored from signals/i.test(e.rationale) && (
          <p className="rationale">{e.rationale}</p>
        )}

        {/* TERTIARY: a single verdict tag + a quiet expandable score breakdown */}
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className={`verdict-tag ${e.verdict}`}>{VERDICT_LABEL[e.verdict] || e.verdict}</span>
          <button className="link-quiet" onClick={() => setShowScores((v) => !v)}>
            {showScores ? "Hide scores" : "See scores"}
          </button>
        </div>

        {showScores && (
          <div className="axes">
            {AXES.map((a) => {
              const v = e.scores[a.key];
              return (
                <div className="axis" key={a.key}>
                  {a.label} <b>{v}</b>
                  <div className="bar"><span style={{ width: `${v}%` }} /></div>
                </div>
              );
            })}
          </div>
        )}

        {e.redFlags.length > 0 && <div className="flags">⚠ {e.redFlags.join(" · ")}</div>}
      </div>

      <div className="card-foot">
        <a className="view-link" href={product.url} target="_blank" rel="noopener noreferrer">
          View product →
        </a>
        <div className="feedback-row">
          <button
            className={`btn-ghost ${signal === "love" ? "active-love" : ""}`}
            disabled={busy}
            onClick={() => sendFeedback("love")}
            aria-pressed={signal === "love"}
            title="Save this to teach the system your taste"
          >
            {signal === "love" ? "♥ Loved" : "♥ Love"}
          </button>
          <button
            className={`btn-ghost ${signal === "pass" ? "active-pass" : ""}`}
            disabled={busy}
            onClick={() => sendFeedback("pass")}
            aria-pressed={signal === "pass"}
            title="Not for me"
          >
            {signal === "pass" ? "✕ Passed" : "✕ Pass"}
          </button>
        </div>
      </div>
    </div>
  );
}
