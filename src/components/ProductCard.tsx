"use client";

import { useState } from "react";
import type { EvaluatedProduct, DiscoveryBrief } from "@/lib/types";

function scoreColor(n: number): string {
  if (n >= 72) return "#57c98a";
  if (n >= 55) return "#e2b04a";
  return "#e2685f";
}

const AXES: { key: keyof EvaluatedProduct["evaluation"]["scores"]; label: string }[] = [
  { key: "desirability", label: "Desire" },
  { key: "aesthetics", label: "Aesthetic" },
  { key: "value", label: "Value" },
  { key: "quality", label: "Quality" },
  { key: "credibility", label: "Trust" },
  { key: "trendFit", label: "Trend" },
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

  async function sendFeedback(s: "love" | "pass") {
    setBusy(true);
    setSignal(s);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId,
          productId: product.id,
          productTitle: product.title,
          signal: s,
          brief: { category: brief.category, audience: brief.audience, style: brief.style },
        }),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      {product.imageUrl && (
        <div className="card-image">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.imageUrl}
            alt={product.title}
            loading="lazy"
            onError={(ev) => {
              // Hide broken images gracefully.
              (ev.currentTarget.parentElement as HTMLElement).style.display = "none";
            }}
          />
        </div>
      )}
      <div className="card-top">
        <div>
          <div className="rank">#{rank}</div>
          <h3>{product.title}</h3>
          <div className="meta">
            {[product.brand, product.retailer, product.price != null ? `$${product.price}` : null]
              .filter(Boolean)
              .join(" · ")}
            {product.rating != null && ` · ${product.rating}★ (${product.reviewCount ?? 0})`}
          </div>
        </div>
        <div
          className="score-badge"
          style={{ borderColor: scoreColor(e.composite), color: scoreColor(e.composite) }}
        >
          {e.composite}
        </div>
      </div>

      <div className="row">
        <span className="role">{e.collectionRole}</span>
        <span className={`verdict ${e.verdict}`}>{e.verdict}</span>
      </div>

      <p className="rationale">{e.rationale}</p>

      <div className="axes">
        {AXES.map((a) => {
          const v = e.scores[a.key];
          return (
            <div className="axis" key={a.key}>
              {a.label} <b>{v}</b>
              <div className="bar">
                <span style={{ width: `${v}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {e.redFlags.length > 0 && (
        <div className="flags">⚠ {e.redFlags.join(" · ")}</div>
      )}

      <div className="card-foot">
        <a
          className="btn-ghost"
          href={product.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          View product →
        </a>
        <div className="feedback-row">
          <button
            className={`btn-ghost ${signal === "love" ? "active-love" : ""}`}
            disabled={busy}
            onClick={() => sendFeedback("love")}
            title="Teach the system this is the kind of product we want"
          >
            ♥ Love
          </button>
          <button
            className={`btn-ghost ${signal === "pass" ? "active-pass" : ""}`}
            disabled={busy}
            onClick={() => sendFeedback("pass")}
            title="Teach the system to avoid products like this"
          >
            ✕ Pass
          </button>
        </div>
      </div>
    </div>
  );
}
