// Pairwise / listwise reranker. Research on LLM-as-judge shows that RELATIVE
// judgments ("is A more on-brief than B?") are far more reliable than absolute
// 0-100 scores, which drift between runs. After the vision evaluator gives each
// finalist an absolute score, this stage re-orders the finalists by comparing
// them directly against each other and the brief, with the images in view.
//
// We do it as a single listwise call (the model ranks all finalists at once)
// rather than O(n^2) pairwise calls, to stay within the run's time budget while
// still capturing the reliability of relative comparison.

import type { EvaluatedProduct, DiscoveryBrief } from "@/lib/types";
import { BIG_TICKET_TASTE } from "./taste";
import { askJSON, llmAvailable } from "./llm";

export async function pairwiseRerank(
  finalists: EvaluatedProduct[],
  brief: DiscoveryBrief
): Promise<EvaluatedProduct[]> {
  if (!llmAvailable() || finalists.length < 3) return finalists;

  const requirement = [brief.style, brief.notes].filter(Boolean).join(". ") || brief.category;

  const system = `${BIG_TICKET_TASTE}

You are the final Reranker, acting like a head editor making the call on the
finished shortlist. You are given the finalist products WITH their images. Your
job is to put them in the best possible order for a collection that must satisfy
this request: "${requirement}" (category: ${brief.category}).

Judge RELATIVELY, comparing products head-to-head:
- The product that BEST matches the request, and is most desirable to own and
  most screenshot-worthy, goes first.
- Strongly demote any product that does not actually match the request, even if
  it is attractive on its own. Matching the request is the dominant criterion.
- Reward genuine variety of looks near the top; avoid near-duplicates back to back.
- Use the images, not just the titles, to judge how each product actually looks.`;

  const listing = finalists
    .map(
      (p, i) =>
        `[${i}] id=${p.id} | ${p.title} | ${p.brand || p.retailer || ""} | $${p.price ?? "?"} | current match ${p.evaluation.scores.intentMatch}`
    )
    .join("\n");

  const images = finalists
    .filter((p) => p.imageUrl)
    .map((p) => ({ url: p.imageUrl as string, label: `Product id ${p.id}: ${p.title}` }));

  const prompt = `Finalists (images shown above, in order):
${listing}

Rank ALL of them from best to worst for the request "${requirement}".
Return JSON: {"order":["id1","id2",...],"notes":"one line on the top of the order"}
The "order" array must contain every product id exactly once, best first. No text outside JSON.`;

  try {
    const out = await askJSON<{ order: string[]; notes?: string }>({
      system,
      prompt,
      images,
      maxTokens: 1200,
      temperature: 0.2,
    });
    const byId = new Map(finalists.map((p) => [p.id, p]));
    const ordered: EvaluatedProduct[] = [];
    const used = new Set<string>();
    for (const id of out.order || []) {
      const p = byId.get(id);
      if (p && !used.has(id)) {
        ordered.push(p);
        used.add(id);
      }
    }
    // Append any the model forgot, preserving their prior composite order.
    for (const p of finalists) if (!used.has(p.id)) ordered.push(p);
    return ordered.length ? ordered : finalists;
  } catch {
    return finalists; // fall back to absolute-score order
  }
}
