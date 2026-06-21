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
      // Prefer a result on a known/real retailer domain that isn't Google.
      const hit = results.find((r) => {
        const host = retailerFromUrl(r.url);
        return host && !host.startsWith("google.") && isLikelyProductPage(r.url);
      });
      if (hit) {
        p.url = hit.url;
        if (!p.retailer) p.retailer = retailerFromUrl(hit.url);
      }
    })
  );

  // Don't let resolution blow the time budget.
  const deadline = new Promise<void>((resolve) => setTimeout(resolve, 12000));
  await Promise.race([work, deadline]);
  return products;
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
