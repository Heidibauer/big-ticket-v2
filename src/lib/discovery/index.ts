// Discovery orchestrator. Given a theme, it fans out across sources, merges,
// dedupes, and enriches the most promising candidates. Source-agnostic: add a
// new adapter and plug it in here without touching the agent pipeline.

import type { ProductCandidate, Theme } from "@/lib/types";
import { serperShopping, serperOrganic } from "./serper";
import { tavilySearch, tavilyEnrich } from "./tavily";
import { fixtureProducts } from "@/data/fixtures";
import { resolveMode } from "./mode";
import { retailerFromUrl } from "./retailers";

// Normalize a title for dedup: lowercase, strip punctuation + retailer noise.
function dedupeKey(p: ProductCandidate): string {
  const t = p.title
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\b(buy|shop|sale|best|review|reviews|official|store)\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 6)
    .join(" ");
  return t;
}

function mergeCandidate(a: ProductCandidate, b: ProductCandidate): ProductCandidate {
  // Keep the richer record; prefer shopping-source pricing/ratings.
  return {
    ...a,
    price: a.price ?? b.price,
    rating: a.rating ?? b.rating,
    reviewCount: a.reviewCount ?? b.reviewCount,
    imageUrl: a.imageUrl ?? b.imageUrl,
    snippet: a.snippet ?? b.snippet,
    brand: a.brand ?? b.brand,
    retailer: a.retailer ?? b.retailer,
    specs: { ...b.specs, ...a.specs },
  };
}

export async function discoverForTheme(theme: Theme): Promise<ProductCandidate[]> {
  const mode = resolveMode();

  if (mode === "mock") {
    return fixtureProducts(theme.id);
  }

  // Live: fan out across queries and sources in parallel. Capped to keep the
  // total run well under the serverless time limit. Serper Shopping is fast and
  // gives us price+rating directly, so we lean on it and use fewer Tavily calls.
  const tasks: Promise<ProductCandidate[]>[] = [];
  for (const q of theme.searchQueries.slice(0, 2)) {
    tasks.push(serperShopping(q, theme.id, 12));
  }
  // One organic pass for DTC / editorial coverage.
  tasks.push(serperOrganic(`best ${theme.title}`, theme.id, 6));

  const settled = await Promise.allSettled(tasks);
  const all: ProductCandidate[] = [];
  for (const s of settled) if (s.status === "fulfilled") all.push(...s.value);

  // Dedupe + merge.
  const byKey = new Map<string, ProductCandidate>();
  for (const p of all) {
    const key = dedupeKey(p);
    if (!key) continue;
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeCandidate(existing, p) : p);
  }
  let merged = [...byKey.values()];

  // Prioritize candidates that already have price + rating, then enrich the
  // thin ones (no price OR no snippet) up to a budget to control API spend.
  merged.sort((a, b) => {
    const score = (p: ProductCandidate) =>
      (p.price ? 2 : 0) + (p.rating ? 2 : 0) + (p.imageUrl ? 1 : 0);
    return score(b) - score(a);
  });

  // Enrich only a few of the most promising thin candidates. Page extraction is
  // the slowest step, so we keep this tight to protect the overall run time.
  const toEnrich = merged.filter((p) => !p.price || !p.snippet).slice(0, 3);
  await Promise.allSettled(
    toEnrich.map(async (p) => {
      const { context, price } = await tavilyEnrich(p.url);
      if (context && !p.snippet) p.snippet = context;
      if (price && !p.price) p.price = price;
    })
  );

  // Attach brand guess from retailer host when missing.
  for (const p of merged) {
    if (!p.retailer) p.retailer = retailerFromUrl(p.url);
  }

  return merged.slice(0, 24);
}
