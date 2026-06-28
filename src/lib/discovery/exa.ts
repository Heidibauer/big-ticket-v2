// Exa adapter. Exa is a neural/semantic web search built for agents; it returns
// clean, direct page URLs. We use it to search WITHIN a prioritized list of real
// retailers (majors first, then boutique), so the product links go straight to a
// store's own product page, correctly matched to the product we found. This
// replaces the old "guess the link by re-searching" approach that mismatched.

import type { ProductCandidate } from "@/lib/types";
import {
  retailerFromUrl,
  retailerLabel,
  isUsedOrResale,
  MAJOR_RETAILERS,
  BOUTIQUE_RETAILERS,
} from "./retailers";
import { fetchWithTimeout } from "./http";

const BASE = "https://api.exa.ai";

interface ExaResult {
  title?: string;
  url?: string;
  text?: string;
  image?: string;
  score?: number;
}

// Search Exa within a specific set of retailer domains for a query. Returns
// candidates whose URLs are the retailer's own product pages.
async function exaSearchScoped(
  query: string,
  domains: string[],
  themeId: string,
  num: number,
  tag: string
): Promise<ProductCandidate[]> {
  const key = process.env.EXA_API_KEY;
  if (!key) {
    console.log("[exa] no EXA_API_KEY set");
    return [];
  }
  const res = await fetchWithTimeout(
    `${BASE}/search`,
    {
      method: "POST",
      headers: { "x-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        numResults: num,
        type: "auto",
        includeDomains: domains,
        // Minimal, well-supported contents request: text + images.
        contents: { text: true, livecrawl: "fallback" },
      }),
    },
    12000
  );
  if (!res) {
    console.log(`[exa] ${tag} request failed/timed out for "${query}"`);
    return [];
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.log(`[exa] ${tag} HTTP ${res.status} for "${query}": ${body.slice(0, 200)}`);
    return [];
  }
  const data = (await res.json()) as { results?: ExaResult[] };
  console.log(`[exa] ${tag} "${query}" -> ${data.results?.length ?? 0} results`);
  return (data.results || [])
    .filter((r) => r.url && r.title)
    .map((r, i): ProductCandidate => {
      const host = retailerFromUrl(r.url!);
      return {
        id: `exa-${tag}-${themeId}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        title: r.title!.trim(),
        brand: null,
        retailer: retailerLabel(host),
        url: r.url!, // direct retailer product page
        imageUrl: r.image || null,
        price: null, // Exa doesn't give structured price; Serper/merge fills it
        currency: "USD",
        rating: null,
        reviewCount: null,
        snippet: r.text?.slice(0, 400) || null,
        specs: {},
        themeId,
        source: "exa",
      };
    })
    .filter((p) => !isUsedOrResale(retailerFromUrl(p.url)));
}

// Public: search majors and boutiques for a query, majors weighted first.
export async function exaRetailerSearch(
  query: string,
  themeId: string
): Promise<ProductCandidate[]> {
  if (!process.env.EXA_API_KEY) return [];
  const [majors, boutiques] = await Promise.all([
    exaSearchScoped(query, MAJOR_RETAILERS, themeId, 10, "major"),
    exaSearchScoped(query, BOUTIQUE_RETAILERS, themeId, 8, "boutique"),
  ]);
  // Majors first so they take priority in dedup/merge ordering.
  return [...majors, ...boutiques];
}

export function exaAvailable(): boolean {
  return !!process.env.EXA_API_KEY;
}

// Single Exa call to resolve a direct retailer link for ONE product. Searches
// within all prioritized retailers at once. Returns lightweight {url,title}.
export async function exaScopedForProduct(
  query: string
): Promise<{ url: string; title: string }[]> {
  if (!process.env.EXA_API_KEY) return [];
  const domains = [...MAJOR_RETAILERS, ...BOUTIQUE_RETAILERS];
  const results = await exaSearchScoped(query, domains, "final", 8, "resolve");
  return results.map((r) => ({ url: r.url, title: r.title }));
}

// PRIMARY discovery: one Exa call per query across ALL prioritized retailers.
// Returns products that already OWN their direct store link + image (no later
// matching needed). One call per query keeps us well under the rate limit.
export async function exaDiscover(query: string, themeId: string): Promise<ProductCandidate[]> {
  if (!process.env.EXA_API_KEY) return [];
  const domains = [...MAJOR_RETAILERS, ...BOUTIQUE_RETAILERS];
  return exaSearchScoped(query, domains, themeId, 15, "discover");
}
