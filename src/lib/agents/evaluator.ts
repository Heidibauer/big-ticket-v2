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
  intentMatch: number;
  aesthetics: number;
  value: number;
  quality: number;
  desirability: number;
  trendFit: number;
  matchReason?: string;
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

  // The explicit requirement the operator asked for. This is the contract the
  // output must honor. style + notes carry the look/feature must-haves.
  const requirement = [brief.style, brief.notes].filter(Boolean).join(". ") || brief.category;

  const system = `${BIG_TICKET_TASTE}

You are the Evaluator. The operator asked for a SPECIFIC thing, and your first
and most important job is to judge whether each product ACTUALLY MATCHES that
request. Matching the request matters MORE than how nice the product is.

THE REQUEST (must-have): "${requirement}"
Category: ${brief.category}

You are given each product's PHOTO. Judge what you SEE, not just the title. A
title like "Smeg 2 Slice Toaster" tells you nothing about whether it's patterned;
the image does. Look at the actual product.

Score each product on these axes (0-100):
- categoryCheck: FIRST, is this product actually a "${brief.category}"? It must be
  the real physical item, NOT something that merely depicts or decorates it. Wall
  art, prints, posters, decals, stickers, fridge skins/wraps, lampshades-only,
  digital downloads, greeting cards, and similar are NOT the product. If it is not
  truly a "${brief.category}", set intentMatch to 0 and add a redFlag "wrong category".
- intentMatch: How well does this product match the request "${requirement}"? Be
  STRICT and literal. If the request asks for prints/patterns/florals/animals/
  bright multicolor and the product is a SINGLE SOLID COLOR, intentMatch must be
  LOW (under 35), no matter how attractive it is. A solid pastel toaster does NOT
  match "bright patterned floral". Only give 80+ when the product clearly and
  obviously has the requested attribute visible in the image.
- aesthetics, value, quality, desirability, trendFit: normal taste axes, judged
  in service of THIS request (a product that misses the request is not desirable
  here even if it's objectively pretty).

Also return matchReason: one short, concrete phrase on what makes it match or
miss (e.g. "bold tropical leaf print, multicolor" or "solid pink, no pattern").
Write a specific rationale and a collectionRole. Flag problems in redFlags.
Be discerning: most products are average. Reserve 85+ for ones that earn it.
${feedbackBlock(feedback)}`;

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

    const prompt = `Request to match: "${requirement}" | category: ${brief.category} | audience: ${brief.audience} | budget $${brief.budgetMin}-${brief.budgetMax}

The images above are shown in product order; each is labeled with its id. Judge intentMatch from the IMAGE.

Products:
${listing}

Return JSON: {"evals":[{"id":"...","intentMatch":0-100,"aesthetics":0-100,"value":0-100,"quality":0-100,"desirability":0-100,"trendFit":0-100,"matchReason":"short phrase: what makes it match or miss the request","rationale":"specific reason it does or doesn't deserve a spot","redFlags":["..."],"collectionRole":"..."}]}
One entry per product id. No text outside JSON.`;

    // Attach product images so the model judges the actual look (essential for
    // visual requirements). Cap to keep payloads sane.
    const images = batch
      .filter((p) => p.imageUrl)
      .map((p) => ({ url: p.imageUrl as string, label: `Product id ${p.id}: ${p.title}` }));

    const batchEvals: Evaluation[] = [];
    try {
      const out = await askJSON<{ evals: RawEval[] }>({
        system,
        prompt,
        images,
        maxTokens: 4000,
        temperature: 0.2,
      });
      const byId = new Map(out.evals.map((e) => [e.id, e]));
      for (const p of batch) {
        const e = byId.get(p.id);
        const taste: TasteScores = e
          ? {
              intentMatch: typeof e.intentMatch === "number" ? e.intentMatch : 50,
              aesthetics: e.aesthetics,
              value: e.value,
              quality: e.quality,
              desirability: e.desirability,
              trendFit: e.trendFit,
              rationale: e.rationale,
              matchReason: e.matchReason,
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

  // No LLM/vision here, so we can only guess intentMatch from text. Look for the
  // brief's descriptor words in the title/snippet; default neutral if unknown so
  // the gate doesn't wrongly drop everything in a keyless/fallback run.
  const reqWords = `${brief.style} ${brief.notes ?? ""}`
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 3);
  const hay = `${p.title} ${p.snippet ?? ""}`.toLowerCase();
  const hits = reqWords.filter((w) => hay.includes(w)).length;
  // The heuristic can't actually see the product, so it must not hard-fail items
  // it simply can't assess. Default to passing the gate; only boost on a match.
  const intentMatch = hits > 0 ? 78 : 65;

  return {
    intentMatch,
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
