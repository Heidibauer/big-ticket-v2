// The hybrid scoring core. Fuses LLM taste scores with deterministic hard
// signals into one transparent composite. This is why "hybrid" is the most
// robust answer: taste catches what numbers can't (aesthetics, desirability),
// signals keep taste anchored to reality (real reviews, real price fit), and
// data-completeness scales confidence so we never over-trust a thin record.

import type { Evaluation, ProductCandidate, DiscoveryBrief } from "@/lib/types";
import { reviewStrength, priceFit, dataCompleteness, credibilityScore } from "./signals";

export interface TasteScores {
  aesthetics: number;
  value: number;
  quality: number;
  desirability: number;
  trendFit: number;
  rationale: string;
  redFlags: string[];
  collectionRole: string;
}

// Weights for the six judgment axes in the composite. Tuned to Big Ticket's
// priorities: desirability + aesthetics lead, credibility + value keep it honest.
const AXIS_WEIGHTS = {
  desirability: 0.26,
  aesthetics: 0.22,
  value: 0.16,
  quality: 0.15,
  credibility: 0.12,
  trendFit: 0.09,
};

export function fuse(
  product: ProductCandidate,
  taste: TasteScores,
  brief: DiscoveryBrief
): Evaluation {
  const signalScores = {
    reviewStrength: reviewStrength(product.rating, product.reviewCount),
    priceFit: priceFit(product.price, brief),
    dataCompleteness: dataCompleteness(product),
  };
  const credibility = credibilityScore(product);

  // Blend each axis with its closest hard signal so numbers temper taste.
  const value = blend(taste.value, signalScores.priceFit, 0.6);
  const quality = blend(taste.quality, signalScores.reviewStrength, 0.55);
  const cred = blend(credibility, signalScores.reviewStrength, 0.7);

  const scores = {
    aesthetics: clamp(taste.aesthetics),
    value: clamp(value),
    quality: clamp(quality),
    desirability: clamp(taste.desirability),
    trendFit: clamp(taste.trendFit),
    credibility: clamp(cred),
  };

  let composite =
    scores.desirability * AXIS_WEIGHTS.desirability +
    scores.aesthetics * AXIS_WEIGHTS.aesthetics +
    scores.value * AXIS_WEIGHTS.value +
    scores.quality * AXIS_WEIGHTS.quality +
    scores.credibility * AXIS_WEIGHTS.credibility +
    scores.trendFit * AXIS_WEIGHTS.trendFit;

  // Confidence discount: if we know little about a product, pull its composite
  // toward a neutral 50 so thin records can't top the ranking on vibes alone.
  const conf = signalScores.dataCompleteness / 100;
  composite = composite * (0.7 + 0.3 * conf) + 50 * (1 - (0.7 + 0.3 * conf));

  // Red-flag penalty.
  composite -= Math.min(20, taste.redFlags.length * 7);

  composite = clamp(composite);

  const verdict: Evaluation["verdict"] =
    composite >= 72 ? "recommend" : composite >= 55 ? "consider" : "pass";

  return {
    productId: product.id,
    scores,
    signalScores,
    composite: Math.round(composite),
    verdict,
    rationale: taste.rationale,
    redFlags: taste.redFlags,
    collectionRole: taste.collectionRole,
  };
}

function blend(a: number, b: number, wA: number): number {
  return a * wA + b * (1 - wA);
}
function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}
