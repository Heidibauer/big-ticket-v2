// Exa adapter. Exa is a neural/semantic web search built for agents; it returns
// clean, direct page URLs. We use it to search WITHIN a prioritized list of real
// retailers (majors first, then boutique), so the product links go straight to a
// store's own product page, correctly matched to the product we found. This
// replaces the old "guess the link by re-searching" approach that mismatched.

import type { ProductCandidate } from "@/lib/types";
import { retailerFromUrl, retailerLabel, isUsedOrResale } from "./retailers";
import { fetchWithTimeout } from "./http";

const BASE = "https://api.exa.ai";

// Tier 1: major trusted US retailers. Tier 2: boutique / unique / specialty.
// Discovery searches these directly so links are first-party store pages.
export const MAJOR_RETAILERS = [
  "williams-sonoma.com", "target.com", "crateandbarrel.com", "wayfair.com",
  "nordstrom.com", "westelm.com", "potterybarn.com", "surlatable.com",
  "bedbathandbeyond.com", "macys.com", "bloomingdales.com", "kohls.com",
];
export const BOUTIQUE_RETAILERS = [
  "anthropologie.com", "mackenzie-childs.com", "lenox.com", "food52.com",
  "smeg.com", "dolcegabbana.com", "drewbarrymorebeautiful.com", "qvc.com",
  "uncommongoods.com", "world-market.com", "terrain.com", "etsy.com",
];

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
  if (!key) return [];
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
        contents: { text: { maxCharacters: 400 }, imageLinks: 1 },
      }),
    },
    12000
  );
  if (!res || !res.ok) return [];
  const data = (await res.json()) as { results?: ExaResult[] };
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
