// Aesthetic + Value Evaluator agent. Scores each product on the taste axes and
// writes the rationale. Runs in batches for efficiency. Feeds the fusion engine.
// It also receives the operator's past feedback so judgment improves over time.

import type { ProductCandidate, DiscoveryBrief, Evaluation, Feedback } from "@/lib/types";
import { BIG_TICKET_TASTE } from "./taste";
import { askJSON, llmAvailable } from "./llm";
import { fuse, type TasteScores } from "@/lib/scoring/fusion";
import { reviewStrength, priceFit, credibilityScore } from "@/lib/scoring/signals";

interface RawEval {
  id: string;
  aesthetics: number;
  value: number;
  quality: number;
  desirability: number;
  trendFit: number;
  rationale: string;
  redFlags: string[];
  collectionRole: string;
}

function feedbackBlock(feedback: Feedback[]): string {
  if (!feedback.length) return "";
  const loved = feedback.filter((f) => f.signal === "love").slice(0, 12);
  const passed = feedback.filter((f) => f.signal === "pass").slice(0, 12);
  const fmt = (f: Feedback) => `- ${f.productTitle}${f.note ? ` (${f.note})` : ""}`;
  return `
LEARNED TASTE FROM THIS OPERATOR (weight these patterns heavily):
Products they LOVED:
${loved.map(fmt).join("\n") || "(none yet)"}
Products they PASSED on:
${passed.map(fmt).join("\n") || "(none yet)"}
Infer the operator's preferences from these and let them shift your scoring.`.trim();
}

export async function evaluateProducts(
  products: ProductCandidate[],
  brief: DiscoveryBrief,
  feedback: Feedback[] = []
): Promise<Evaluation[]> {
  if (!llmAvailable() || products.length === 0) {
    return products.map((p) => fuse(p, heuristicTaste(p, brief), brief));
  }

  const system = `${BIG_TICKET_TASTE}

You are the Evaluator. Score each product on five taste axes (0-100):
aesthetics, value, quality, desirability, trendFit. Be discerning: most products
are average. Reserve 85+ for things that genuinely earn it. Write a specific,
concrete rationale and assign a collectionRole (e.g. "the value pick", "the
splurge", "the design statement", "the safe default", "the compact choice").
Flag real problems in redFlags (generic design, dropship signals, weak reviews,
overpriced, off-brief). ${feedbackBlock(feedback)}`;

  // Split into batches and evaluate them ALL IN PARALLEL. Sequential awaits
  // were the main time sink (each Claude call is several seconds; 3-4 in a row
  // blew past the function limit). Running them concurrently keeps total time
  // close to a single call.
  const batchSize = 8;
  const batches: ProductCandidate[][] = [];
  for (let i = 0; i < products.length; i += batchSize) {
    batches.push(products.slice(i, i + batchSize));
  }

  const evalArrays = await Promise.all(
    batches.map(async (batch) => {
    const listing = batch
      .map((p) =>
        JSON.stringify({
          id: p.id,
          title: p.title,
          brand: p.brand,
          retailer: p.retailer,
          price: p.price,
          rating: p.rating,
          reviews: p.reviewCount,
          info: p.snippet?.slice(0, 400) || null,
          specs: p.specs,
        })
      )
      .join("\n");

    const prompt = `Brief: ${brief.category} | audience: ${brief.audience} | style: ${brief.style} | budget $${brief.budgetMin}-${brief.budgetMax}${brief.notes ? ` | notes: ${brief.notes}` : ""}

Products:
${listing}

Return JSON: {"evals":[{"id":"...","aesthetics":0-100,"value":0-100,"quality":0-100,"desirability":0-100,"trendFit":0-100,"rationale":"specific reason it does or doesn't deserve a spot","redFlags":["..."],"collectionRole":"..."}]}
One entry per product id. No text outside JSON.`;

    const batchEvals: Evaluation[] = [];
    try {
      const out = await askJSON<{ evals: RawEval[] }>({
        system,
        prompt,
        maxTokens: 3500,
        temperature: 0.3,
      });
      const byId = new Map(out.evals.map((e) => [e.id, e]));
      for (const p of batch) {
        const e = byId.get(p.id);
        const taste: TasteScores = e
          ? {
              aesthetics: e.aesthetics,
              value: e.value,
              quality: e.quality,
              desirability: e.desirability,
              trendFit: e.trendFit,
              rationale: e.rationale,
              redFlags: e.redFlags || [],
              collectionRole: e.collectionRole || "candidate",
            }
          : heuristicTaste(p, brief);
        batchEvals.push(fuse(p, taste, brief));
      }
    } catch {
      for (const p of batch) batchEvals.push(fuse(p, heuristicTaste(p, brief), brief));
    }
    return batchEvals;
    })
  );
  return evalArrays.flat();
}

// Used when no LLM is available, or as a per-product fallback. Derives plausible
// taste scores from the hard signals so the pipeline always produces output.
function heuristicTaste(p: ProductCandidate, brief: DiscoveryBrief): TasteScores {
  const rs = reviewStrength(p.rating, p.reviewCount);
  const pf = priceFit(p.price, brief);
  const cred = credibilityScore(p);
  const cheapJunk = (p.price ?? 0) > 0 && (p.price ?? 0) < brief.budgetMin * 0.4;
  const flags: string[] = [];
  if (cheapJunk) flags.push("priced well below the band, possible low quality");
  if ((p.reviewCount ?? 0) < 25 && p.rating != null) flags.push("thin review volume");
  if (/generic|basic|no-name|amazonbasics/i.test(`${p.title} ${p.brand ?? ""}`)) flags.push("generic / unbranded");
  return {
    aesthetics: Math.round((cred * 0.5 + rs * 0.5) * (cheapJunk ? 0.7 : 1)),
    value: pf,
    quality: rs,
    desirability: Math.round(((cred + rs) / 2) * (cheapJunk ? 0.7 : 1)),
    trendFit: 60,
    rationale: `Scored from signals: ${p.rating ?? "?"}★ (${p.reviewCount ?? 0} reviews) at ${p.retailer ?? "unknown retailer"}, $${p.price ?? "?"}.`,
    redFlags: flags,
    collectionRole: pf > 80 ? "the value pick" : cred > 85 ? "the safe default" : "candidate",
  };
}
