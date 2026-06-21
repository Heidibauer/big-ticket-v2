// Discovery orchestrator. Given a theme, it fans out across sources, merges,
// dedupes, and enriches the most promising candidates. Source-agnostic: add a
// new adapter and plug it in here without touching the agent pipeline.

import type { ProductCandidate, Theme } from "@/lib/types";
import { serperShopping } from "./serper";
import { exaRetailerSearch, exaAvailable } from "./exa";
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
  // Choose ONE record to be the "link owner" and keep its url AND image together,
  // so the image and link always describe the same listing (this prevents the
  // image-says-pink / link-goes-to-silver mismatch). We prefer a direct retailer
  // URL (non-Google) as the owner; Exa results are direct retailer pages.
  const aIsGoogle = isGoogleHost(a.url);
  const bIsGoogle = isGoogleHost(b.url);
  const owner = !aIsGoogle ? a : !bIsGoogle ? b : a; // record whose url we trust
  const other = owner === a ? b : a;
  return {
    ...owner,
    // Link and image come from the SAME owner record. Only borrow the other's
    // image if the owner has none.
    url: owner.url,
    imageUrl: owner.imageUrl || other.imageUrl || null,
    // Price/rating are attribute data; safe to borrow if missing.
    price: owner.price ?? other.price,
    rating: owner.rating ?? other.rating,
    reviewCount: owner.reviewCount ?? other.reviewCount,
    snippet: owner.snippet ?? other.snippet,
    brand: owner.brand ?? other.brand,
    retailer: owner.retailer ?? other.retailer,
    specs: { ...other.specs, ...owner.specs },
  };
}

function isGoogleHost(url: string): boolean {
  try {
    return new URL(url).hostname.replace(/^www\./, "").startsWith("google.");
  } catch {
    return false;
  }
}

export async function discoverForTheme(theme: Theme): Promise<ProductCandidate[]> {
  const mode = resolveMode();

  if (mode === "mock") {
    return fixtureProducts(theme.id);
  }

  // Live: fan out across queries AND sources in parallel.
  //  - Serper Shopping: structured products with price/rating/image (but links
  //    are often Google Shopping pages).
  //  - Exa retailer search: direct first-party store product pages, searched
  //    within prioritized retailers (majors then boutique). Correctly matched
  //    links, no guessing. When both find the same product, we keep Exa's direct
  //    retailer URL and Serper's price/image (see mergeCandidate).
  const tasks: Promise<ProductCandidate[]>[] = [];
  for (const q of theme.searchQueries.slice(0, 3)) {
    tasks.push(serperShopping(q, theme.id, 20));
    if (exaAvailable()) tasks.push(exaRetailerSearch(q, theme.id));
  }

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

  // No per-theme page enrichment: with many themes running in parallel it would
  // dominate runtime, and Shopping already gives price + image + rating. We keep
  // a wide set per theme (high recall) and let the rerank stage filter hard.

  // Attach brand guess from retailer host when missing.
  for (const p of merged) {
    if (!p.retailer) p.retailer = retailerFromUrl(p.url);
  }

  return merged.slice(0, 30);
}
