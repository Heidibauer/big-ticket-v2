// Serper.dev client. We use the Shopping endpoint for real products (price,
// rating, reviews, image) and Organic as a fallback for context + DTC brands.

import type { ProductCandidate } from "@/lib/types";
import { retailerFromUrl, retailerLabel, isAcceptableRetailer } from "./retailers";
import { fetchWithTimeout } from "./http";

const BASE = "https://google.serper.dev";

interface SerperShoppingItem {
  title?: string;
  source?: string; // retailer name, e.g. "Williams Sonoma"
  link?: string; // often a google.com/shopping redirect, not the retailer page
  productLink?: string; // sometimes the direct retailer/product URL
  offers?: string;
  price?: string;
  rating?: number;
  ratingCount?: number;
  imageUrl?: string;
  image?: string;
  thumbnail?: string;
  delivery?: string;
}

// Serper Shopping's `link` is usually a Google Shopping page, which we don't
// want to surface to users. Detect those so we can prefer a real retailer URL.
function isGoogleLink(url: string): boolean {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "");
    return h.endsWith("google.com") || h === "google.com" || h.startsWith("google.");
  } catch {
    return false;
  }
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
    .filter((it) => it.title)
    .map((it, i): ProductCandidate => {
      // Prefer a direct retailer URL. productLink is the real page when present;
      // otherwise the main link, unless it's a Google Shopping redirect.
      const candidateUrl =
        it.productLink && !isGoogleLink(it.productLink)
          ? it.productLink
          : it.link && !isGoogleLink(it.link)
          ? it.link
          : null;
      const host = candidateUrl ? retailerFromUrl(candidateUrl) : null;
      return {
        id: `serper-shop-${themeId}-${i}-${Math.random().toString(36).slice(2, 7)}`,
        title: it.title!.trim(),
        brand: null,
        retailer: it.source || retailerLabel(host),
        url: candidateUrl || "",
        imageUrl: it.imageUrl || it.image || it.thumbnail || null,
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
    // Require a real, buyable retailer URL AND an image. This guarantees every
    // surfaced product links to a US retailer page and shows a picture. Items
    // that are only a Google Shopping link, or have no image, are dropped.
    .filter(
      (p) =>
        p.url &&
        !!p.imageUrl &&
        isAcceptableRetailer(retailerFromUrl(p.url)) &&
        !isArticleHost(retailerFromUrl(p.url))
    );
}

// Editorial / roundup domains that publish "best of" articles, not products.
const ARTICLE_HOSTS = [
  "bonappetit.com", "seriouseats.com", "nytimes.com", "wirecutter.com",
  "cnn.com", "forbes.com", "goodhousekeeping.com", "thespruce.com",
  "epicurious.com", "foodandwine.com", "tasteofhome.com", "reviewed.com",
  "businessinsider.com", "buzzfeed.com", "people.com", "rtings.com",
  "techradar.com", "cnet.com", "popularmechanics.com", "realsimple.com",
  "marthastewart.com", "bhg.com", "architecturaldigest.com", "elledecor.com",
  "housebeautiful.com", "apartmenttherapy.com", "kitchn.com", "delish.com",
];
function isArticleHost(host: string | null): boolean {
  if (!host) return false;
  const h = host.toLowerCase();
  return ARTICLE_HOSTS.some((d) => h.endsWith(d));
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
