// Curator agent. Takes all evaluated products and assembles a COLLECTION, not a
// list: it ranks by composite desirability, enforces diversity across brand /
// price / style, drops near-duplicates and passes, and writes the editorial
// angle. This is where "collections over lists" becomes real.

import type { EvaluatedProduct, Collection, DiscoveryBrief } from "@/lib/types";
import { BIG_TICKET_TASTE } from "./taste";
import { askJSON, llmAvailable } from "./llm";

export async function curate(
  evaluated: EvaluatedProduct[],
  brief: DiscoveryBrief,
  targetSize = 8
): Promise<Collection> {
  // 1. Drop clear passes and obvious dupes by brand+title.
  const ranked = [...evaluated].sort(
    (a, b) => b.evaluation.composite - a.evaluation.composite
  );
  const seen = new Set<string>();
  const deduped: EvaluatedProduct[] = [];
  for (const p of ranked) {
    const key = `${(p.brand || "").toLowerCase()}|${p.title.toLowerCase().slice(0, 30)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(p);
  }

  // Quality gate: a social-worthy collection is built only from products that
  // cleared the bar (recommend/consider). We'd rather show a tight set of 5
  // strong pieces than pad to 8 with mediocre ones. "pass" products are kept
  // only as a last-resort backfill so the page is never empty.
  const strong = deduped.filter((p) => p.evaluation.verdict !== "pass");
  const pool = strong.length >= 4 ? strong : deduped;

  // 2. Diversity pass: greedily build the set, discouraging brand/price clustering.
  const selected: EvaluatedProduct[] = [];
  const brandCount: Record<string, number> = {};
  const priceBuckets: Record<string, number> = {};
  const bucket = (price: number | null) => {
    if (price == null) return "unknown";
    const span = brief.budgetMax - brief.budgetMin || 1;
    const pos = (price - brief.budgetMin) / span;
    return pos < 0.33 ? "low" : pos < 0.66 ? "mid" : "high";
  };

  for (const p of pool) {
    if (selected.length >= targetSize) break;
    const brand = (p.brand || p.retailer || "?").toLowerCase();
    const b = bucket(p.price);
    const brandPenalty = (brandCount[brand] || 0) >= 2 ? 1 : 0;
    const pricePenalty = (priceBuckets[b] || 0) >= Math.ceil(targetSize / 2) ? 1 : 0;
    // Skip only if it's a weak product AND would worsen clustering.
    if ((brandPenalty || pricePenalty) && p.evaluation.composite < 70) continue;
    selected.push(p);
    brandCount[brand] = (brandCount[brand] || 0) + 1;
    priceBuckets[b] = (priceBuckets[b] || 0) + 1;
  }
  // Backfill from the strong pool only if diversity filtering left us short.
  if (selected.length < Math.min(targetSize, pool.length)) {
    for (const p of pool) {
      if (selected.length >= targetSize) break;
      if (!selected.includes(p)) selected.push(p);
    }
  }

  const products = selected.slice(0, targetSize);

  // 3. Editorial framing (LLM if available).
  let title = `${cap(brief.style)} ${brief.category}: the shortlist`;
  let editorialAngle = `A curated set of ${brief.category} for ${brief.audience}, spanning value to splurge within $${brief.budgetMin}-${brief.budgetMax}.`;
  let diversityNotes = describeDiversity(products, brief);

  if (llmAvailable() && products.length) {
    // The editorial frame is a nice-to-have. Race it against a short deadline so
    // curation always finishes fast and never causes a request timeout; if the
    // LLM is slow we ship the (already solid) deterministic title and notes.
    const framing = askJSON<{ title: string; editorialAngle: string; diversityNotes: string }>({
      system: `${BIG_TICKET_TASTE}

You are the Curator writing the editorial frame for a finished collection.
Write in Big Ticket's voice: specific, warm, a little bold, no hype words, no em
dashes. The title is 8 words or fewer.`,
      prompt: `Brief: ${brief.category} | ${brief.audience} | ${brief.style} | $${brief.budgetMin}-${brief.budgetMax}
Collection (ranked):
${products.map((p, i) => `${i + 1}. ${p.title} - ${p.brand || p.retailer} - $${p.price ?? "?"} - role: ${p.evaluation.collectionRole} - ${p.evaluation.composite}/100`).join("\n")}

Return JSON: {"title":"...","editorialAngle":"2 sentences on the POV of this set","diversityNotes":"1-2 sentences on how the set spans price, brand, and style"}`,
      maxTokens: 600,
      temperature: 0.6,
    });
    const deadline = new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000));
    try {
      const out = await Promise.race([framing, deadline]);
      if (out && out.title) title = out.title;
      if (out && out.editorialAngle) editorialAngle = out.editorialAngle;
      if (out && out.diversityNotes) diversityNotes = out.diversityNotes;
    } catch {
      /* keep deterministic defaults */
    }
  }

  return { title, editorialAngle, products, diversityNotes };
}

function describeDiversity(products: EvaluatedProduct[], brief: DiscoveryBrief): string {
  const brands = new Set(products.map((p) => p.brand || p.retailer).filter(Boolean));
  const prices = products.map((p) => p.price).filter((x): x is number => x != null);
  const lo = prices.length ? Math.min(...prices) : null;
  const hi = prices.length ? Math.max(...prices) : null;
  return `${products.length} products across ${brands.size} brands${
    lo != null ? `, $${lo} to $${hi}` : ""
  }.`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
