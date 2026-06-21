// Resolves DIRECT retailer product links for the FINAL curated products only
// (~25), not the hundreds of candidates. This is what keeps us under the link
// provider's rate limit (the wide fan-out was hitting HTTP 429).
//
// For each final product that currently has a Google Shopping link, we try to
// find its real store page:
//   1. Exa scoped search within prioritized retailers (majors then boutique).
//   2. Serper site-scoped organic fallback ("<title> site:retailer").
// We ONLY swap the link when the result is confidently the SAME product (brand +
// strong title-word overlap), preferring higher-tier retailers, never used/resale.
// Calls are throttled in small batches so we never trip the rate limit.

import type { EvaluatedProduct } from "@/lib/types";
import { serperOrganic } from "./serper";
import { exaScopedForProduct } from "./exa";
import { retailerFromUrl, retailerPriority, isUsedOrResale, MAJOR_RETAILERS, BOUTIQUE_RETAILERS } from "./retailers";

function isGoogle(url: string): boolean {
  try {
    return new URL(url).hostname.replace(/^www\./, "").startsWith("google.");
  } catch {
    return true;
  }
}

interface Candidate {
  url: string;
  host: string | null;
  title: string;
}

export async function resolveFinalLinks(
  products: EvaluatedProduct[]
): Promise<EvaluatedProduct[]> {
  const needsFix = products.filter((p) => !p.url || isGoogle(p.url));
  if (needsFix.length === 0) return products;

  // Throttle: process in small sequential batches so we stay under rate limits.
  const BATCH = 4;
  for (let i = 0; i < needsFix.length; i += BATCH) {
    const batch = needsFix.slice(i, i + BATCH);
    await Promise.allSettled(batch.map((p) => resolveOne(p)));
    if (i + BATCH < needsFix.length) await sleep(400); // brief pause between batches
  }
  return products;
}

async function resolveOne(p: EvaluatedProduct): Promise<void> {
  const candidates: Candidate[] = [];

  // 1. Exa scoped (one call, within prioritized retailer domains).
  try {
    const exa = await exaScopedForProduct(`${p.title} ${p.retailer || ""}`.trim());
    for (const r of exa) candidates.push({ url: r.url, host: retailerFromUrl(r.url), title: r.title });
  } catch {
    /* ignore */
  }

  // 2. Serper site-scoped fallback if Exa gave nothing usable.
  if (!hasGoodCandidate(p, candidates)) {
    try {
      const domains = [...MAJOR_RETAILERS, ...BOUTIQUE_RETAILERS].slice(0, 10);
      const siteQuery = `${p.title} (${domains.map((d) => `site:${d}`).join(" OR ")})`;
      const res = await serperOrganic(siteQuery, "resolve", 10);
      for (const r of res) candidates.push({ url: r.url, host: retailerFromUrl(r.url), title: r.title || "" });
    } catch {
      /* ignore */
    }
  }

  const best = pickBest(p, candidates);
  if (best) {
    p.url = best.url;
    p.retailer = retailerFromUrl(best.url);
  }
  // If nothing confident, keep the original (correct) Google Shopping link.
}

function hasGoodCandidate(p: EvaluatedProduct, cands: Candidate[]): boolean {
  return cands.some(
    (c) =>
      c.host &&
      !c.host.startsWith("google.") &&
      !isUsedOrResale(c.host) &&
      isSameProduct(p.title, p.brand, c.title)
  );
}

function pickBest(p: EvaluatedProduct, cands: Candidate[]): Candidate | null {
  const valid = cands.filter(
    (c) =>
      c.host &&
      !c.host.startsWith("google.") &&
      !isUsedOrResale(c.host) &&
      isLikelyProductPage(c.url) &&
      isSameProduct(p.title, p.brand, c.title)
  );
  valid.sort((a, b) => retailerPriority(b.host) - retailerPriority(a.host));
  return valid[0] || null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Confident same-product check: brand must appear, and most distinctive title
// words must be present. Prevents linking to a different model/color.
function isSameProduct(origTitle: string, brand: string | null, resultTitle: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const orig = norm(origTitle);
  const res = norm(resultTitle);
  if (!res) return false;
  if (brand) {
    const b = norm(brand);
    if (b && !res.includes(b)) return false;
  }
  const stop = new Set(["the", "and", "for", "with", "slice", "cup", "toaster", "coffee", "maker", "inch", "new", "set"]);
  const words = orig.split(" ").filter((w) => w.length > 2 && !stop.has(w));
  if (words.length === 0) return false;
  const hits = words.filter((w) => res.includes(w)).length;
  return hits / words.length >= 0.6;
}

function isLikelyProductPage(url: string): boolean {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    if (path === "/" || path.length < 6) return false;
    if (/\/(blog|help|about|account|cart|search)\b/.test(path)) return false;
    return true;
  } catch {
    return false;
  }
}
