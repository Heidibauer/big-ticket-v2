// Credibility model for retailers. Used both to filter discovery and to seed
// the "credibility" judgment axis. This is a starting heuristic the operator
// can tune; it is intentionally explicit rather than a black box.

const TIER_1 = [
  "amazon.com", "wayfair.com", "target.com", "bestbuy.com", "williams-sonoma.com",
  "potterybarn.com", "crateandbarrel.com", "westelm.com", "cb2.com", "rejuvenation.com",
  "article.com", "roomandboard.com", "design-within-reach.com", "dwr.com", "nordstrom.com",
  "rh.com", "anthropologie.com", "homedepot.com", "lowes.com", "rei.com",
  "surlatable.com", "bloomingdales.com", "macys.com", "serenaandlily.com",
];

const TIER_2 = [
  "walmart.com", "overstock.com", "houzz.com", "luluandgeorgia.com", "burrow.com",
  "floyddetroit.com", "thuma.co", "castlery.com", "joybird.com", "allmodern.com",
  "wayfair.ca", "made.com", "muji.com", "ikea.com", "abccarpet.com",
];

// Marketplaces / aggregators we keep but treat with mild caution.
const CAUTION = ["aliexpress.com", "temu.com", "etsy.com", "ebay.com", "dhgate.com"];

export function retailerFromUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host;
  } catch {
    return null;
  }
}

export function retailerLabel(host: string | null): string | null {
  if (!host) return null;
  const map: Record<string, string> = {
    "amazon.com": "Amazon",
    "wayfair.com": "Wayfair",
    "target.com": "Target",
    "bestbuy.com": "Best Buy",
    "williams-sonoma.com": "Williams Sonoma",
    "potterybarn.com": "Pottery Barn",
    "crateandbarrel.com": "Crate & Barrel",
    "westelm.com": "West Elm",
    "cb2.com": "CB2",
    "article.com": "Article",
    "rh.com": "RH",
    "homedepot.com": "Home Depot",
    "thuma.co": "Thuma",
    "burrow.com": "Burrow",
    "joybird.com": "Joybird",
    "ikea.com": "IKEA",
    "surlatable.com": "Sur La Table",
    "serenaandlily.com": "Serena & Lily",
  };
  return map[host] || host.replace(/\.com$|\.co$/, "").replace(/\b\w/g, (c) => c.toUpperCase());
}

// 0-100 credibility score for a retailer host.
export function retailerCredibility(host: string | null): number {
  if (!host) return 40;
  const h = host.toLowerCase();
  if (TIER_1.some((d) => h.endsWith(d))) return 92;
  if (TIER_2.some((d) => h.endsWith(d))) return 78;
  if (CAUTION.some((d) => h.endsWith(d))) return 45;
  // Unknown brand DTC sites are plausibly fine; give a neutral-positive score.
  return 60;
}

export function isAcceptableRetailer(host: string | null): boolean {
  // We don't hard-block much; the evaluator handles nuance. We only drop the
  // obviously junky aggregators that flood discovery with dropship clones.
  if (!host) return false;
  const blocked = ["aliexpress.com", "dhgate.com", "temu.com"];
  return !blocked.some((d) => host.toLowerCase().endsWith(d));
}
