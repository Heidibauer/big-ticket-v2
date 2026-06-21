// Deterministic, auditable hard-signal scores. These are the quantitative
// backbone that keeps the LLM's taste honest. Each returns 0-100.

import type { ProductCandidate, DiscoveryBrief } from "@/lib/types";
import { retailerCredibility, retailerFromUrl } from "@/lib/discovery/retailers";

// Review strength rewards BOTH a good rating and enough volume to trust it.
// A 5.0 from 4 reviews should not beat a 4.6 from 1,200.
export function reviewStrength(rating: number | null, count: number | null): number {
  if (rating == null && count == null) return 40; // unknown, neutral-low
  const r = rating ?? 4.0;
  const n = count ?? 0;
  // Rating component (0-70): maps 3.5->0 .. 5.0->70
  const ratingComp = Math.max(0, Math.min(70, ((r - 3.5) / 1.5) * 70));
  // Volume confidence (0-30): log scale, saturates around ~2000 reviews.
  const volComp = Math.min(30, (Math.log10(n + 1) / Math.log10(2000)) * 30);
  return Math.round(ratingComp + volComp);
}

// Price fit: where does the price land inside the brief's budget band?
// Mid-to-upper band scores best (people researching big purchases lean toward
// "worth it"), bottom-of-band and over-budget are penalized.
export function priceFit(price: number | null, brief: DiscoveryBrief): number {
  if (price == null) return 45; // unknown
  const { budgetMin, budgetMax } = brief;
  if (price > budgetMax) {
    const over = (price - budgetMax) / Math.max(budgetMax, 1);
    return Math.max(10, Math.round(60 - over * 100));
  }
  if (price < budgetMin) {
    // Suspiciously cheap for the band; mild penalty.
    return 55;
  }
  const pos = (price - budgetMin) / Math.max(budgetMax - budgetMin, 1); // 0..1
  // Peak around 0.55 of the band.
  const score = 100 - Math.abs(pos - 0.55) * 80;
  return Math.round(Math.max(60, Math.min(100, score)));
}

// How much do we actually know? Penalize thin candidates so confident judgment
// requires evidence.
export function dataCompleteness(p: ProductCandidate): number {
  let s = 0;
  if (p.price != null) s += 25;
  if (p.rating != null) s += 20;
  if (p.reviewCount != null) s += 15;
  if (p.imageUrl) s += 10;
  if (p.snippet && p.snippet.length > 40) s += 20;
  if (Object.keys(p.specs).length > 0) s += 10;
  return Math.min(100, s);
}

export function credibilityScore(p: ProductCandidate): number {
  return retailerCredibility(retailerFromUrl(p.url));
}
