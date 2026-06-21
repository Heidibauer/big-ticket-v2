# Big Ticket — Intelligent Product Discovery

An AI buyer, merchandiser, trend analyst, and curator in one. Give it a brief
(category, audience, style, budget) and it discovers real products from credible
retailers, evaluates them with taste and hard signals, and returns a curated
**collection** ranked by genuine desirability, with a reason for every pick.

It is not a scraper or a content generator. It is a judgment engine.

---

## Quick start

```bash
npm install
cp .env.example .env        # add your keys (optional for a first run)
npm run dev                 # http://localhost:3000
```

With **no keys**, it runs in mock mode end-to-end so you can see the pipeline and
scoring work. Add keys to go live.

```bash
npm run smoke               # end-to-end pipeline + scoring test, no keys needed
```

---

## What it does, step by step

1. **Theme Strategist** reasons about the brief like a merchandiser planning a
   collection: which subcategories and consumer intents are worth pursuing, and
   what to actually search for.
2. **Discovery** fans out across Serper (Google Shopping + organic) and Tavily
   (search + page extraction), merges sources, removes duplicates, and enriches
   the thin candidates with real page content.
3. **Evaluator** scores every product on six taste axes and writes a concrete
   rationale, informed by your past feedback so its judgment compounds.
4. **Hybrid scoring** fuses those taste scores with deterministic hard signals
   (review strength, price fit, retailer credibility, data completeness) into one
   transparent composite. Thin records are pulled toward neutral so nothing tops
   the ranking on vibes alone.
5. **Curator** ranks by composite desirability, enforces diversity across brand /
   price / style, drops passes and near-duplicates, and writes the editorial frame.
6. **Feedback loop:** Love / Pass on any product. Those signals are stored and fed
   back into the evaluator on future runs for the same category and audience.

## Why hybrid scoring (the design choice you asked about)

Pure LLM scoring drifts and can't be audited. Pure signal scoring can't see
aesthetics or desirability, which is the whole point of Big Ticket. The hybrid
fuses them: taste catches what numbers can't, signals keep taste honest, and a
confidence discount scales how much we trust each judgment by how much we actually
know about the product. Every score is inspectable in the UI, and the weights live
in one file (`src/lib/scoring/fusion.ts`) so you can tune the system's priorities.

The "taste" itself is encoded in `src/lib/agents/taste.ts` from Big Ticket's brand
voice: the maximizer mindset, anti-manipulation stance, specificity over vague
claims, and timelessness over hype.

---

## Deploy to Vercel

1. Push this folder to a Git repo.
2. Import it in Vercel (it auto-detects Next.js).
3. Add environment variables (Project Settings → Environment Variables):
   - `ANTHROPIC_API_KEY` — required for real evaluation
   - `ANTHROPIC_MODEL` — optional, defaults to `claude-sonnet-4-6`
   - `SERPER_API_KEY` and/or `TAVILY_API_KEY` — required for real discovery
   - `DATABASE_URL` — a Neon / Vercel Postgres connection string. Without it the
     app uses in-memory storage (fine for trials, lost on redeploy).
   - `DISCOVERY_MODE` — `auto` (default), `live`, or `mock`.
4. Deploy. The run route is configured with `maxDuration = 300` for long agent runs.

### Database

With `DATABASE_URL` set, tables are created automatically on first request
(`runs`, `feedback`). Use Vercel Postgres or [Neon](https://neon.tech) (free tier).

---

## Architecture

```
Brief ─▶ Theme Strategist ─▶ Discovery (Serper + Tavily) ─▶ Evaluator ─▶ Fusion ─▶ Curator ─▶ Collection
                                                                  ▲
                                                          past feedback (memory)
```

```
src/
  app/                     Next.js App Router (UI + API routes)
    api/runs/create        start a run (runs the pipeline)
    api/runs/[id]          poll a run (live progress)
    api/feedback           Love / Pass signals
    run/[id]               live run + collection view
  lib/
    agents/                themes, evaluator, curator, orchestrator, taste, llm
    discovery/             serper, tavily, retailers, orchestrator, mode
    scoring/               signals (hard) + fusion (hybrid composite)
    db/                    Postgres-or-memory storage + feedback retrieval
  data/fixtures.ts         realistic mock products for keyless runs
```

## Tuning the system's judgment

- **What it values:** axis weights in `src/lib/scoring/fusion.ts`.
- **Its taste:** the rubric in `src/lib/agents/taste.ts`.
- **Retailer trust:** tiers in `src/lib/discovery/retailers.ts`.
- **How it learns:** Love / Pass feedback, retrieved per-brief in `src/lib/db/index.ts`.

## Honest limitations (today)

- Discovery quality is bounded by what Serper/Tavily surface; very new or niche DTC
  brands may be under-represented. Add adapters in `src/lib/discovery/`.
- Image URLs come from Shopping results and aren't always present.
- The feedback loop is retrieval-based (few-shot), not a fine-tune. It improves
  judgment within a category quickly but is not a trained model.
```
