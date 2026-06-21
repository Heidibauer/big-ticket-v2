// The conductor. Runs the full discovery -> evaluation -> curation pipeline for
// a brief, persisting progress to the run record at each step so the UI can show
// the system thinking. Pulls relevant past feedback so judgment compounds.

import type { Run, DiscoveryBrief, EvaluatedProduct, RunStep } from "@/lib/types";
import { strategizeThemes } from "./themes";
import { discoverForTheme } from "@/lib/discovery";
import { evaluateProducts } from "./evaluator";
import { curate } from "./curator";
import { saveRun, getRelevantFeedback } from "@/lib/db";
import { resolveMode } from "@/lib/discovery/mode";

function step(label: string, detail?: string): RunStep {
  return { at: new Date().toISOString(), label, detail };
}

export async function runPipeline(run: Run): Promise<void> {
  const brief = run.brief;
  try {
    // 1. THEMES
    run.status = "discovering";
    run.steps.push(step("Strategizing themes", "Reasoning about subcategories and intent"));
    await saveRun(run);

    const themes = await strategizeThemes(brief, 3);
    run.themes = themes;
    run.steps.push(
      step("Themes ready", themes.map((t) => t.title).join(" · "))
    );
    await saveRun(run);

    // 2. DISCOVERY (parallel across themes)
    run.steps.push(step("Discovering products", `Searching across ${themes.length} themes`));
    await saveRun(run);

    const discovered = (
      await Promise.all(themes.map((t) => discoverForTheme(t)))
    ).flat();
    run.steps.push(step("Discovery complete", `${discovered.length} candidates found`));
    await saveRun(run);

    if (discovered.length === 0) {
      run.status = "error";
      run.error = "No products discovered. Check API keys or broaden the brief.";
      await saveRun(run);
      return;
    }

    // 3. EVALUATION (with learned feedback)
    run.status = "evaluating";
    const feedback = await getRelevantFeedback(brief);
    run.steps.push(
      step(
        "Evaluating with taste + signals",
        feedback.length ? `Applying ${feedback.length} prior feedback signals` : "Scoring aesthetics, value, quality, desirability"
      )
    );
    await saveRun(run);

    const evals = await evaluateProducts(discovered, brief, feedback);
    const evaluated: EvaluatedProduct[] = discovered
      .map((p) => {
        const e = evals.find((x) => x.productId === p.id);
        return e ? { ...p, evaluation: e } : null;
      })
      .filter((x): x is EvaluatedProduct => x !== null);

    const recommended = evaluated.filter((p) => p.evaluation.verdict !== "pass").length;
    run.steps.push(step("Evaluation complete", `${recommended} cleared the bar`));
    await saveRun(run);

    // 4. CURATION
    run.status = "curating";
    run.steps.push(step("Curating the collection", "Ranking, diversity, editorial frame"));
    await saveRun(run);

    const collection = await curate(evaluated, brief, 8);
    run.collection = collection;
    run.status = "done";
    run.steps.push(step("Collection ready", `${collection.products.length} products curated`));
    await saveRun(run);
  } catch (err) {
    run.status = "error";
    run.error = err instanceof Error ? err.message : String(err);
    run.steps.push(step("Error", run.error));
    await saveRun(run);
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
