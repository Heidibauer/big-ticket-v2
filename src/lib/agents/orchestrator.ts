// The conductor. Runs the full discovery -> evaluation -> curation pipeline for
// a brief, persisting progress to the run record at each step so the UI can show
// the system thinking. Pulls relevant past feedback so judgment compounds.

import type { Run, DiscoveryBrief, EvaluatedProduct, RunStep, ProductCandidate } from "@/lib/types";
import { strategizeThemes } from "./themes";
import { discoverForTheme } from "@/lib/discovery";
import { isUsedOrResale, retailerFromUrl } from "@/lib/discovery/retailers";
import { resolveFinalLinks } from "@/lib/discovery/resolveFinal";
import { passesCategoryGate } from "@/lib/discovery/categoryGate";
import { evaluateProducts } from "./evaluator";
import { pairwiseRerank } from "./reranker";
import { curate } from "./curator";
import { saveRun, getRelevantFeedback } from "@/lib/db";
import { resolveMode } from "@/lib/discovery/mode";

function step(label: string, detail?: string): RunStep {
  return { at: new Date().toISOString(), label, detail };
}

// How complete a product record is (used to prioritize the pre-filter slice).
// A DIRECT retailer link is weighted heavily so products that link straight to a
// store rise above ones that only have a Google Shopping link.
function completeness(p: ProductCandidate): number {
  const directLink = p.url && !isGoogleUrl(p.url) ? 4 : 0;
  return (
    directLink +
    (p.price != null ? 2 : 0) +
    (p.rating != null ? 2 : 0) +
    (p.reviewCount != null ? 1 : 0) +
    (p.imageUrl ? 2 : 0) +
    (p.snippet ? 1 : 0)
  );
}

function isGoogleUrl(url: string): boolean {
  try {
    return new URL(url).hostname.replace(/^www\./, "").startsWith("google.");
  } catch {
    return true;
  }
}

// Dedupe AND MERGE products that surfaced under multiple angles/sources. Keying
// on the title prefix, we combine records for the same product. Crucially, this
// pairs an Exa result (direct retailer link, may lack price/image) with a Serper
// result (price/image, but a Google Shopping link) into ONE record that has the
// DIRECT retailer link + the price/image. Without this merge, the priced Serper
// record wins the later pre-filter and users only see Google links.
function dedupeAcrossThemes(products: ProductCandidate[]): ProductCandidate[] {
  const byTitle = new Map<string, ProductCandidate>();
  for (const p of products) {
    const titleKey = p.title.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(" ").slice(0, 6).join(" ");
    if (!titleKey) continue;
    const existing = byTitle.get(titleKey);
    if (!existing) {
      byTitle.set(titleKey, p);
      continue;
    }
    // Merge: keep a direct (non-Google) URL, and fill in any missing fields.
    const existingGoogle = isGoogleUrl(existing.url);
    const pGoogle = isGoogleUrl(p.url);
    const url = !existingGoogle ? existing.url : !pGoogle ? p.url : existing.url;
    const owner = url === existing.url ? existing : p;
    const other = owner === existing ? p : existing;
    byTitle.set(titleKey, {
      ...owner,
      url,
      // Image must belong to the record we trust (the link owner) when it has
      // one, to keep image+link consistent; otherwise borrow.
      imageUrl: owner.imageUrl || other.imageUrl || null,
      price: owner.price ?? other.price,
      rating: owner.rating ?? other.rating,
      reviewCount: owner.reviewCount ?? other.reviewCount,
      snippet: owner.snippet ?? other.snippet,
      brand: owner.brand ?? other.brand,
      retailer: owner.retailer ?? other.retailer,
    });
  }
  return [...byTitle.values()];
}

// Run the entire pipeline in one call and return the finished run. The create
// route awaits this and returns the completed collection directly — no polling,
// no driver loop, no per-stage requests, no concurrency lock. This removes the
// whole class of race conditions that plagued the polling design. Progress is
// still recorded in run.steps so the UI can show what happened.
export async function runPipeline(run: Run): Promise<Run> {
  const brief = run.brief;
  try {
    // 1. THEMES — wide fan-out for high recall (expert-researcher decomposition).
    run.status = "discovering";
    run.steps.push(step("Planning research angles", "Decomposing the brief like an expert design researcher"));
    const themes = await strategizeThemes(brief, 10);
    run.themes = themes;
    run.steps.push(step("Angles ready", `${themes.length} angles: ${themes.map((t) => t.title).join(" · ")}`));

    // 2. DISCOVERY (all angles + queries in parallel; high recall, filter later)
    run.steps.push(step("Discovering products", `Searching ${themes.length} angles in parallel`));
    const discoveredRaw = (await Promise.all(themes.map((t) => discoverForTheme(t)))).flat();
    // Global dedupe across angles (same product can appear under several angles).
    const deduped = dedupeAcrossThemes(discoveredRaw);
    // CATEGORY GATE: drop items that match the look but are the wrong category
    // (wall art, prints, decals, fridge skins, digital downloads, etc.). If the
    // gate is too aggressive and leaves too few, fall back to the deduped set.
    const gated = deduped.filter((p) => passesCategoryGate(p, brief));
    const discovered = gated.length >= 8 ? gated : deduped;
    run.steps.push(step("Discovery complete", `${discovered.length} on-category candidates from ${discoveredRaw.length} results`));
    if (discovered.length === 0) {
      run.status = "error";
      run.error = "No products discovered. Check API keys or broaden the brief.";
      run.steps.push(step("Error", run.error));
      return run;
    }

    // 3. STAGE 1 — cheap pre-filter (high recall -> manageable set). Keep only
    //    products with an image (we need it for vision) and a price, then take a
    //    generous slice favoring complete records. This is the retrieval->ranking
    //    funnel: we don't vision-score hundreds of items, we shortlist first.
    const withImageAndPrice = discovered.filter((p) => p.imageUrl && p.price != null);
    // Prefer pictured + priced candidates; if too few, fall back to priced, then
    // to whatever we have, so the pipeline never empties out on strict filters.
    const base =
      withImageAndPrice.length >= 8
        ? withImageAndPrice
        : discovered.filter((p) => p.price != null).length >= 8
        ? discovered.filter((p) => p.price != null)
        : discovered;
    const prefiltered = [...base].sort((a, b) => completeness(b) - completeness(a)).slice(0, 40);
    run.steps.push(step("Shortlisting candidates", `${prefiltered.length} candidates to score`));

    // 4. STAGE 2A — vision multi-criteria scoring (precision). Each product is
    //    judged on its actual photo against the brief.
    run.status = "evaluating";
    const feedback = await getRelevantFeedback(brief);
    run.steps.push(
      step(
        "Scoring on the image",
        feedback.length ? `Vision scoring + ${feedback.length} prior feedback signals` : "Vision scoring against the brief"
      )
    );
    const evals = await evaluateProducts(prefiltered, brief, feedback);
    let evaluated: EvaluatedProduct[] = prefiltered
      .map((p) => {
        const e = evals.find((x) => x.productId === p.id);
        return e ? { ...p, evaluation: e } : null;
      })
      .filter((x): x is EvaluatedProduct => x !== null);

    // 5. STAGE 2B — pairwise tournament rerank among the finalists. Absolute
    //    scores drift; relative judgments are more reliable. We take the top
    //    matches and let the model compare them head-to-head to settle order.
    const finalists = [...evaluated]
      .sort((a, b) => b.evaluation.composite - a.evaluation.composite)
      .slice(0, 30);
    run.status = "curating";
    run.steps.push(step("Reranking finalists", `Head-to-head comparison of the top ${finalists.length}`));
    const reranked = await pairwiseRerank(finalists, brief);
    // Merge reranked order back: reranked finalists first (in their new order),
    // then the rest by composite.
    const finalistIds = new Set(reranked.map((p) => p.id));
    const rest = evaluated
      .filter((p) => !finalistIds.has(p.id))
      .sort((a, b) => b.evaluation.composite - a.evaluation.composite);
    evaluated = [...reranked, ...rest];

    const recommended = evaluated.filter((p) => p.evaluation.verdict !== "pass").length;
    run.steps.push(step("Evaluation complete", `${recommended} cleared the bar`));

    // 6. CURATION — target a fuller collection (20-30 products).
    run.steps.push(step("Curating the collection", "Diversity + editorial frame"));
    const collection = await curate(evaluated, brief, 25);

    // 7. RESOLVE DIRECT LINKS — for the FINAL products only (throttled, so we
    //    never trip the link provider's rate limit). Turns Google Shopping links
    //    into direct retailer pages, with strict same-product matching so we
    //    never link to the wrong item. Unresolved products keep their correct link.
    run.steps.push(step("Resolving retailer links", "Finding direct product pages for finalists"));
    collection.products = await resolveFinalLinks(collection.products);

    // Final safety net: never show a used-goods / resale link.
    collection.products = collection.products.filter(
      (p) => !isUsedOrResale(retailerFromUrl(p.url))
    );

    run.collection = collection;
    run.status = "done";
    run.steps.push(step("Collection ready", `${collection.products.length} products curated`));
    return run;
  } catch (err) {
    run.status = "error";
    run.error = err instanceof Error ? err.message : String(err);
    run.steps.push(step("Error", run.error));
    return run;
  }
}

export function newRun(brief: DiscoveryBrief): Run {
  return {
    id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    brief,
    status: "queued",
    steps: [],
    themes: [],
    collection: null,
    createdAt: new Date().toISOString(),
    mode: resolveMode(),
  };
}
