// End-to-end smoke test of the pipeline with NO external keys required.
// Runs in mock mode and asserts the scoring + curation logic produces a sane,
// diverse, ranked collection. Run: npm run smoke

process.env.DISCOVERY_MODE = "mock";
delete process.env.ANTHROPIC_API_KEY; // force heuristic path so it's deterministic-ish

import { newRun, runPipeline } from "../src/lib/agents/orchestrator";
import { reviewStrength, priceFit } from "../src/lib/scoring/signals";

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error("❌ FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("✅", msg);
  }
}

async function main() {
  // Unit checks on the signal logic.
  assert(reviewStrength(5.0, 4) < reviewStrength(4.6, 1500), "high-volume 4.6 beats thin 5.0");
  assert(
    priceFit(250, { category: "x", audience: "y", style: "z", budgetMin: 80, budgetMax: 450 }) >
      priceFit(2000, { category: "x", audience: "y", style: "z", budgetMin: 80, budgetMax: 450 }),
    "in-band price beats way-over-budget"
  );

  const run = newRun({
    category: "coffee makers",
    audience: "first-time homebuyer, single woman, 30-45",
    style: "warm minimalist",
    budgetMin: 80,
    budgetMax: 450,
  });

  await runPipeline(run);

  assert(run.status === "done", `pipeline finished (status=${run.status})`);
  assert(run.themes.length > 0, `themes generated (${run.themes.length})`);
  assert(!!run.collection, "collection produced");

  const products = run.collection?.products ?? [];
  assert(products.length > 0, `collection has products (${products.length})`);

  // Ranking is monotonic by composite.
  const sorted = products.every(
    (p, i) => i === 0 || products[i - 1].evaluation.composite >= p.evaluation.composite
  );
  assert(sorted, "products ranked by composite desirability");

  // The cheap generic plastic maker should NOT rank #1.
  const top = products[0];
  assert(
    !/generic|amazonbasics/i.test(`${top.title} ${top.brand}`),
    `top pick is not the generic junk (got: ${top.title})`
  );

  // Diversity: more than one brand represented.
  const brands = new Set(products.map((p) => p.brand));
  assert(brands.size > 1, `collection spans multiple brands (${brands.size})`);

  console.log("\n--- Collection preview ---");
  console.log(run.collection?.title);
  products.forEach((p, i) =>
    console.log(`${i + 1}. [${p.evaluation.composite}] ${p.title} — ${p.brand} — $${p.price} — ${p.evaluation.collectionRole}`)
  );

  if (process.exitCode === 1) {
    console.error("\nSMOKE TEST FAILED");
  } else {
    console.log("\nALL SMOKE CHECKS PASSED");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
