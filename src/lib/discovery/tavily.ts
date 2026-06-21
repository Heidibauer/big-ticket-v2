// Tavily client. Two jobs:
//  1) search() — discover DTC + editorial product mentions Serper Shopping misses.
//  2) enrich() — pull richer page content for a specific product URL so the
//     evaluator has real material (materials, dimensions, review language) to
//     reason about instead of a bare title.

import type { ProductCandidate } from "@/lib/types";
import { retailerFromUrl, retailerLabel, isAcceptableRetailer } from "./retailers";
import { fetchWithTimeout } from "./http";

const BASE = "https://api.tavily.com";

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
  raw_content?: string;
  score?: number;
}

export async function tavilySearch(
  query: string,
  themeId: string,
  num = 6
): Promise<ProductCandidate[]> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return [];
  const res = await fetchWithTimeout(`${BASE}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query,
      search_depth: "basic",
      max_results: num,
      include_answer: false,
    }),
  });
  if (!res || !res.ok) return [];
  const data = (await res.json()) as { results?: TavilyResult[] };
  return (data.results || [])
    .filter((r) => r.url && r.title)
    .map((r, i): ProductCandidate => {
      const host = retailerFromUrl(r.url!);
      return {
        id: `tavily-${themeId}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        title: r.title!.trim(),
        brand: null,
        retailer: retailerLabel(host),
        url: r.url!,
        imageUrl: null,
        price: null,
        currency: "USD",
        rating: null,
        reviewCount: null,
        snippet: r.content?.slice(0, 600) || null,
        specs: {},
        themeId,
        source: "tavily",
      };
    })
    .filter((p) => isAcceptableRetailer(retailerFromUrl(p.url)));
}

// Enrich a single product page. Best-effort: returns extra context text and any
// price we can scrape from the content.
export async function tavilyEnrich(url: string): Promise<{ context: string | null; price: number | null }> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return { context: null, price: null };
  try {
    const res = await fetchWithTimeout(`${BASE}/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: key, urls: [url] }),
    }, 10000);
    if (!res || !res.ok) return { context: null, price: null };
    const data = (await res.json()) as { results?: { raw_content?: string }[] };
    const raw = data.results?.[0]?.raw_content || "";
    const context = raw ? raw.replace(/\s+/g, " ").slice(0, 1200) : null;
    let price: number | null = null;
    const m = raw.match(/\$\s?([\d,]+(?:\.\d{2})?)/);
    if (m) price = parseFloat(m[1].replace(/,/g, ""));
    return { context, price };
  } catch {
    return { context: null, price: null };
  }
}
