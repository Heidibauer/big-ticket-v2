// Credibility model for retailers. Used both to filter discovery and to seed
// the "credibility" judgment axis. This is a starting heuristic the operator
// can tune; it is intentionally explicit rather than a black box.

// Prioritized retailers for resolving DIRECT product links. Majors first, then
// boutique/specialty. Edit these to control exactly which stores get searched.
export const MAJOR_RETAILERS = [
  "williams-sonoma.com", "target.com", "crateandbarrel.com", "wayfair.com",
  "nordstrom.com", "westelm.com", "potterybarn.com", "surlatable.com",
  "bedbathandbeyond.com", "macys.com", "bloomingdales.com", "kohls.com",
  "amazon.com", "bestbuy.com", "homedepot.com",
];
export const BOUTIQUE_RETAILERS = [
  "anthropologie.com", "mackenzie-childs.com", "lenox.com", "food52.com",
  "smeg.com", "qvc.com", "uncommongoods.com", "worldmarket.com",
  "terrain.com", "anthropologie.com", "shopterrain.com",
];

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
  // Quality home/kitchen + department stores commonly carrying patterned goods.
  "anthropologie.com", "mackenzie-childs.com", "lenox.com", "surlatable.com",
  "kohls.com", "qvc.com", "saksfifthavenue.com", "neimanmarcus.com",
];

// Etsy is a marketplace but sells NEW handmade/print goods, so allowed (low tier).
const CAUTION = ["etsy.com"];

// USED-GOODS / RESALE / low-trust marketplaces. We never send users here for a
// "buy this product" link: listings are often used, third-party, or transient.
const USED_OR_RESALE = [
  "ebay.com", "poshmark.com", "mercari.com", "depop.com", "facebook.com",
  "offerup.com", "craigslist.org", "etsy.com/listing", // (used vintage on etsy varies)
  "aliexpress.com", "temu.com", "dhgate.com", "wish.com", "alibaba.com",
  "shein.com", "kijiji.ca", "letgo.com", "vinted.com",
];

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

export function isUsedOrResale(host: string | null): boolean {
  if (!host) return false;
  const h = host.toLowerCase();
  return USED_OR_RESALE.some((d) => h.endsWith(d) || h.includes(d));
}

// 0-100 credibility score for a retailer host. Used-goods/resale sites score
// very low so they never win link selection or ranking.
export function retailerCredibility(host: string | null): number {
  if (!host) return 40;
  const h = host.toLowerCase();
  if (isUsedOrResale(h)) return 10;
  if (TIER_1.some((d) => h.endsWith(d))) return 92;
  if (TIER_2.some((d) => h.endsWith(d))) return 78;
  if (CAUTION.some((d) => h.endsWith(d))) return 50;
  // Unknown brand DTC sites are plausibly fine; give a neutral-positive score.
  return 62;
}

// Retailer priority for choosing among multiple links for the SAME product.
// Higher = preferred. This is what stops eBay from winning over Williams Sonoma.
export function retailerPriority(host: string | null): number {
  if (!host) return 0;
  const h = host.toLowerCase();
  if (isUsedOrResale(h)) return -100; // never prefer resale/used
  if (TIER_1.some((d) => h.endsWith(d))) return 100;
  if (TIER_2.some((d) => h.endsWith(d))) return 80;
  if (CAUTION.some((d) => h.endsWith(d))) return 40;
  return 60; // unknown DTC
}

export function isAcceptableRetailer(host: string | null): boolean {
  if (!host) return false;
  // Hard-block used-goods / resale / low-trust marketplaces everywhere.
  return !isUsedOrResale(host);
}
