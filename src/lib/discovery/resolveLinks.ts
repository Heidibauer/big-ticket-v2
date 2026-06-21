// Resolves direct retailer product URLs for the FINAL curated products.
// Serper Shopping often returns a Google Shopping link rather than the retailer's
// own page. Rather than slow every candidate down, we only resolve the handful of
// products that actually make the final collection: for each one with a Google
// link, we run a targeted organic search ("<title> <retailer>") and take the
// first result on the retailer's own domain. Runs in parallel, bounded by a
// deadline so it never holds up the response.

import type { EvaluatedProduct } from "@/lib/types";
import { serperOrganic } from "./serper";
import { retailerFromUrl } from "./retailers";

function isGoogle(url: string): boolean {
  try {
    return new URL(url).hostname.replace(/^www\./, "").startsWith("google.");
  } catch {
    return true; // treat unparseable as needing resolution
  }
}

export async function resolveRetailerLinks(
  products: EvaluatedProduct[]
): Promise<EvaluatedProduct[]> {
  const needsFix = products.filter((p) => !p.url || isGoogle(p.url));
  if (needsFix.length === 0) return products;

  const work = Promise.allSettled(
    needsFix.map(async (p) => {
      const q = `${p.title} ${p.retailer || ""}`.trim();
      const results = await serperOrganic(q, "resolve", 8);
      // CRITICAL: only swap the link if the result is confidently THE SAME
      // product. A wrong-but-real link is worse than a correct Google link.
      const hit = results.find((r) => {
        const host = retailerFromUrl(r.url);
        if (!host || host.startsWith("google.")) return false;
        if (!isLikelyProductPage(r.url)) return false;
        return isSameProduct(p.title, p.brand, r.title || "");
      });
      if (hit) {
        p.url = hit.url;
        if (!p.retailer) p.retailer = retailerFromUrl(hit.url);
      }
      // If no confident match, we leave p.url as-is (the original link).
    })
  );

  // Don't let resolution blow the time budget.
  const deadline = new Promise<void>((resolve) => setTimeout(resolve, 12000));
  await Promise.race([work, deadline]);
  return products;
}

// Confident same-product check. We only trust a resolved link when the result
// title clearly refers to the same item: the brand must appear (when known), and
// the meaningful words of the original title must mostly be present.
function isSameProduct(origTitle: string, brand: string | null, resultTitle: string): boolean {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const orig = norm(origTitle);
  const res = norm(resultTitle);
  if (!res) return false;

  // Brand must be present in the result (strong signal it's the same line).
  if (brand) {
    const b = norm(brand);
    if (b && !res.includes(b)) return false;
  }

  // Significant-word overlap. Ignore short/generic words.
  const stop = new Set(["the", "and", "for", "with", "slice", "cup", "toaster", "coffee", "maker", "inch", "new"]);
  const origWords = orig.split(" ").filter((w) => w.length > 2 && !stop.has(w));
  if (origWords.length === 0) return false;
  const hits = origWords.filter((w) => res.includes(w)).length;
  const ratio = hits / origWords.length;
  // Require a strong majority of distinctive words to match.
  return ratio >= 0.6;
}

// Heuristic: a product page usually has a deeper path than a homepage and often
// contains product-ish path segments. Good enough to avoid landing on homepages.
function isLikelyProductPage(url: string): boolean {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    if (path === "/" || path.length < 6) return false;
    // Avoid obvious non-product pages.
    if (/\/(blog|help|about|account|cart|search)\b/.test(path)) return false;
    return true;
  } catch {
    return false;
  }
}
