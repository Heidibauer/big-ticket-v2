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
import { exaScopedForProduct } from "./exa";
import { retailerFromUrl, retailerPriority, isUsedOrResale } from "./retailers";

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

  // Resolve in modest parallel batches (fast, but small enough to avoid the
  // rate-limit burst that hit 429 before), and cap the WHOLE stage with a hard
  // deadline so a slow provider can never make the run feel stuck. Whatever
  // hasn't resolved by the deadline simply keeps its original correct link.
  const BATCH = 8;
  const run = (async () => {
    for (let i = 0; i < needsFix.length; i += BATCH) {
      const batch = needsFix.slice(i, i + BATCH);
      await Promise.allSettled(batch.map((p) => resolveOne(p)));
      if (i + BATCH < needsFix.length) await sleep(250);
    }
  })();
  const deadline = new Promise<void>((r) => setTimeout(r, 18000));
  await Promise.race([run, deadline]);
  return products;
}

async function resolveOne(p: EvaluatedProduct): Promise<void> {
  const candidates: Candidate[] = [];

  // Single Exa scoped call within prioritized retailer domains. One call per
  // product keeps the stage fast and rate-safe. If it yields no confident match,
  // we keep the product's original (correct) link rather than spend more calls.
  try {
    const exa = await exaScopedForProduct(`${p.title} ${p.retailer || ""}`.trim());
    for (const r of exa) candidates.push({ url: r.url, host: retailerFromUrl(r.url), title: r.title });
  } catch {
    /* ignore */
  }

  // Try candidates best-first; swap to the first one we confirm is REACHABLE
  // (returns 200). This drops dead/404 links. If none verify, keep the original.
  const ranked = rankCandidates(p, candidates);
  for (const c of ranked) {
    if (await isReachable(c.url)) {
      p.url = c.url;
      p.retailer = retailerFromUrl(c.url);
      return;
    }
  }
  // If nothing confident + reachable, keep the original (correct) link.
}

function rankCandidates(p: EvaluatedProduct, cands: Candidate[]): Candidate[] {
  return cands
    .filter(
      (c) =>
        c.host &&
        !c.host.startsWith("google.") &&
        !isUsedOrResale(c.host) &&
        isLikelyProductPage(c.url) &&
        isSameProduct(p.title, p.brand, c.title)
    )
    .sort((a, b) => retailerPriority(b.host) - retailerPriority(a.host));
}

// Confirm a URL is live (200-ish) before we ever show it. Bounded timeout so a
// slow check can't stall the run; treat unreachable as "don't use".
async function isReachable(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; BigTicketBot/1.0)" },
    });
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Distinctive tokens that pin down the EXACT variant: colors, patterns, and
// model-number-like tokens (containing a digit). These must match, so a "pink
// floral" product can never resolve to a "silver" page.
const COLOR_PATTERN_WORDS = [
  "pink", "blue", "green", "red", "yellow", "orange", "purple", "black", "white",
  "cream", "ivory", "teal", "navy", "coral", "mint", "sage", "blush", "gold",
  "silver", "copper", "rose", "lavender", "burgundy", "gray", "grey", "tan",
  "floral", "flower", "botanical", "leaf", "tropical", "animal", "leopard",
  "zebra", "jungle", "geometric", "striped", "polka", "checkered", "plaid",
  "paisley", "abstract", "vintage", "retro", "marble", "patterned", "print",
];

// Confident same-product check. Requires: brand present (when known), a strong
// majority of distinctive words, AND that any color/pattern/model token in the
// original is present in the result. This is what stops wrong-variant links.
function isSameProduct(origTitle: string, brand: string | null, resultTitle: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const orig = norm(origTitle);
  const res = norm(resultTitle);
  if (!res) return false;

  if (brand) {
    const b = norm(brand);
    if (b && !res.includes(b)) return false;
  }

  const origTokens = orig.split(" ");
  const resTokens = new Set(res.split(" "));

  // Any distinctive variant token (color/pattern word, or a model token with a
  // digit) present in the original MUST also be in the result.
  const distinctive = origTokens.filter(
    (w) => COLOR_PATTERN_WORDS.includes(w) || /\d/.test(w)
  );
  for (const d of distinctive) {
    // model tokens: allow substring match (e.g. "tsf01" within a longer sku)
    const present = [...resTokens].some((t) => t === d || t.includes(d) || d.includes(t));
    if (!present) return false;
  }

  // Strong overlap on the remaining meaningful words.
  const stop = new Set(["the", "and", "for", "with", "slice", "cup", "toaster", "coffee", "maker", "inch", "new", "set", "style"]);
  const words = origTokens.filter((w) => w.length > 2 && !stop.has(w));
  if (words.length === 0) return false;
  const hits = words.filter((w) => resTokens.has(w) || res.includes(w)).length;
  return hits / words.length >= 0.7;
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
