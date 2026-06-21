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

// Advance the run by exactly ONE stage, persist, and return true if more work
// remains. Each stage is a few seconds of work, so no single request is long
// running — which is what Vercel's serverless model requires. The run page
// calls /process repeatedly until the run reaches a terminal state.
//
// Stage is driven by status:
//   queued      -> strategize themes        -> discovering
//   discovering -> discover products        -> evaluating
//   evaluating  -> evaluate (with feedback) -> curating
//   curating    -> curate the collection    -> done
export async function advanceRun(run: Run): Promise<boolean> {
  const brief = run.brief;
  try {
    switch (run.status) {
      case "queued": {
        run.status = "discovering";
        run.steps.push(step("Strategizing themes", "Reasoning about subcategories and intent"));
        const themes = await strategizeThemes(brief, 3);
        run.themes = themes;
        run.steps.push(step("Themes ready", themes.map((t) => t.title).join(" · ")));
        await saveRun(run);
        return true;
      }

      case "discovering": {
        run.steps.push(step("Discovering products", `Searching across ${run.themes.length} themes`));
        const discovered = (
          await Promise.all(run.themes.map((t) => discoverForTheme(t)))
        ).flat();
        run.discovered = discovered;
        run.steps.push(step("Discovery complete", `${discovered.length} candidates found`));
        if (discovered.length === 0) {
          run.status = "error";
          run.error = "No products discovered. Check API keys or broaden the brief.";
          run.steps.push(step("Error", run.error));
          await saveRun(run);
          return false;
        }
        run.status = "evaluating";
        await saveRun(run);
        return true;
      }

      case "evaluating": {
        const discovered = run.discovered ?? [];
        const feedback = await getRelevantFeedback(brief);
        run.steps.push(
          step(
            "Evaluating with taste + signals",
            feedback.length
              ? `Applying ${feedback.length} prior feedback signals`
              : "Scoring aesthetics, value, quality, desirability"
          )
        );
        const evals = await evaluateProducts(discovered, brief, feedback);
        const evaluated: EvaluatedProduct[] = discovered
          .map((p) => {
            const e = evals.find((x) => x.productId === p.id);
            return e ? { ...p, evaluation: e } : null;
          })
          .filter((x): x is EvaluatedProduct => x !== null);
        run.evaluated = evaluated;
        const recommended = evaluated.filter((p) => p.evaluation.verdict !== "pass").length;
        run.steps.push(step("Evaluation complete", `${recommended} cleared the bar`));
        run.status = "curating";
        // Discovered data no longer needed; drop to keep the record small.
        run.discovered = undefined;
        await saveRun(run);
        return true;
      }

      case "curating": {
        const evaluated = run.evaluated ?? [];
        run.steps.push(step("Curating the collection", "Ranking, diversity, editorial frame"));
        const collection = await curate(evaluated, brief, 8);
        run.collection = collection;
        run.status = "done";
        run.evaluated = undefined;
        run.steps.push(step("Collection ready", `${collection.products.length} products curated`));
        await saveRun(run);
        return false;
      }

      default:
        return false; // done or error
    }
  } catch (err) {
    run.status = "error";
    run.error = err instanceof Error ? err.message : String(err);
    run.steps.push(step("Error", run.error));
    await saveRun(run);
    return false;
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
