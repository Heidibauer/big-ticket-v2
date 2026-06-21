// The hybrid scoring core. Fuses LLM taste scores with deterministic hard
// signals into one transparent composite. This is why "hybrid" is the most
// robust answer: taste catches what numbers can't (aesthetics, desirability),
// signals keep taste anchored to reality (real reviews, real price fit), and
// data-completeness scales confidence so we never over-trust a thin record.

import type { Evaluation, ProductCandidate, DiscoveryBrief } from "@/lib/types";
import { reviewStrength, priceFit, dataCompleteness, credibilityScore } from "./signals";

export interface TasteScores {
  intentMatch: number; // 0-100: how well it matches the brief's explicit must-haves
  aesthetics: number;
  value: number;
  quality: number;
  desirability: number;
  trendFit: number;
  rationale: string;
  matchReason?: string;
  redFlags: string[];
  collectionRole: string;
}

// Weights among the TASTE axes (applied only after a product has cleared the
// intent gate). Desirability + aesthetics lead; credibility + value keep it honest.
const AXIS_WEIGHTS = {
  desirability: 0.26,
  aesthetics: 0.22,
  value: 0.16,
  quality: 0.15,
  credibility: 0.12,
  trendFit: 0.09,
};

// Intent gate thresholds. A product that doesn't actually match what the user
// asked for cannot rank well, no matter how nice it is on its own.
const INTENT_PASS = 60; // below this, the product failed the brief's must-have
const INTENT_HARD_CAP = 38; // failing products are capped here (lands in "pass")
// How much the final score is intent vs. taste, for products that DO match.
const INTENT_WEIGHT = 0.55;

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

  const intentMatch = clamp(taste.intentMatch);
  const scores = {
    intentMatch,
    aesthetics: clamp(taste.aesthetics),
    value: clamp(value),
    quality: clamp(quality),
    desirability: clamp(taste.desirability),
    trendFit: clamp(taste.trendFit),
    credibility: clamp(cred),
  };

  // 1. Taste sub-score: how good the product is on its own merits.
  let taste0 =
    scores.desirability * AXIS_WEIGHTS.desirability +
    scores.aesthetics * AXIS_WEIGHTS.aesthetics +
    scores.value * AXIS_WEIGHTS.value +
    scores.quality * AXIS_WEIGHTS.quality +
    scores.credibility * AXIS_WEIGHTS.credibility +
    scores.trendFit * AXIS_WEIGHTS.trendFit;

  // Confidence discount on the taste sub-score only.
  const conf = signalScores.dataCompleteness / 100;
  taste0 = taste0 * (0.7 + 0.3 * conf) + 50 * (1 - (0.7 + 0.3 * conf));
  taste0 -= Math.min(20, taste.redFlags.length * 7);
  taste0 = clamp(taste0);

  // 2. THE INTENT GATE. This is what makes "I asked for X and got X" true.
  //    - If the product fails to match the explicit ask, it is hard-capped low
  //      no matter how attractive it is on its own. A gorgeous plain toaster
  //      cannot outrank a real patterned one when patterns were requested.
  //    - If it matches, the final score is dominated by HOW WELL it matches,
  //      with taste as the secondary tiebreaker among genuine matches.
  let composite: number;
  if (intentMatch < INTENT_PASS) {
    // Failed the must-have: cap hard, scaled by how badly it missed.
    composite = Math.min(INTENT_HARD_CAP, Math.round((intentMatch / INTENT_PASS) * INTENT_HARD_CAP));
  } else {
    composite = clamp(intentMatch * INTENT_WEIGHT + taste0 * (1 - INTENT_WEIGHT));
  }

  const verdict: Evaluation["verdict"] =
    composite >= 72 ? "recommend" : composite >= 55 ? "consider" : "pass";

  return {
    productId: product.id,
    scores,
    signalScores,
    composite: Math.round(composite),
    verdict,
    rationale: taste.rationale,
    matchReason: taste.matchReason,
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
