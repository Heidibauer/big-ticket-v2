// Serper.dev client. We use the Shopping endpoint for real products (price,
// rating, reviews, image) and Organic as a fallback for context + DTC brands.

import type { ProductCandidate } from "@/lib/types";
import { retailerFromUrl, retailerLabel, isAcceptableRetailer } from "./retailers";
import { fetchWithTimeout } from "./http";

const BASE = "https://google.serper.dev";

interface SerperShoppingItem {
  title?: string;
  source?: string;
  link?: string;
  price?: string;
  rating?: number;
  ratingCount?: number;
  imageUrl?: string;
  delivery?: string;
}

function parsePrice(raw?: string): number | null {
  if (!raw) return null;
  const m = raw.replace(/,/g, "").match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : null;
}

export async function serperShopping(
  query: string,
  themeId: string,
  num = 12
): Promise<ProductCandidate[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  const res = await fetchWithTimeout(`${BASE}/shopping`, {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num }),
  });
  if (!res || !res.ok) return [];
  const data = (await res.json()) as { shopping?: SerperShoppingItem[] };
  const items = data.shopping || [];
  return items
    .filter((it) => it.link && it.title)
    .map((it, i): ProductCandidate => {
      const host = retailerFromUrl(it.link!);
      return {
        id: `serper-shop-${themeId}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        title: it.title!.trim(),
        brand: null,
        retailer: it.source || retailerLabel(host),
        url: it.link!,
        imageUrl: it.imageUrl || null,
        price: parsePrice(it.price),
        currency: "USD",
        rating: typeof it.rating === "number" ? it.rating : null,
        reviewCount: typeof it.ratingCount === "number" ? it.ratingCount : null,
        snippet: it.delivery || null,
        specs: {},
        themeId,
        source: "serper-shopping",
      };
    })
    .filter((p) => isAcceptableRetailer(retailerFromUrl(p.url)));
}

interface SerperOrganicItem {
  title?: string;
  link?: string;
  snippet?: string;
}

export async function serperOrganic(
  query: string,
  themeId: string,
  num = 8
): Promise<ProductCandidate[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return [];
  const res = await fetchWithTimeout(`${BASE}/search`, {
    method: "POST",
    headers: { "X-API-KEY": key, "Content-Type": "application/json" },
    body: JSON.stringify({ q: query, num }),
  });
  if (!res || !res.ok) return [];
  const data = (await res.json()) as { organic?: SerperOrganicItem[] };
  const items = data.organic || [];
  return items
    .filter((it) => it.link && it.title)
    .map((it, i): ProductCandidate => {
      const host = retailerFromUrl(it.link!);
      return {
        id: `serper-org-${themeId}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        title: it.title!.trim(),
        brand: null,
        retailer: retailerLabel(host),
        url: it.link!,
        imageUrl: null,
        price: null,
        currency: "USD",
        rating: null,
        reviewCount: null,
        snippet: it.snippet || null,
        specs: {},
        themeId,
        source: "serper-organic",
      };
    })
    .filter((p) => isAcceptableRetailer(retailerFromUrl(p.url)));
}
