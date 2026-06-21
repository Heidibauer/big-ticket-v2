// Theme Strategist agent. Before discovering products, it reasons about the
// brief like a merchandiser planning a collection: what subcategories and
// consumer intents are worth pursuing, and what to actually search for.

import type { DiscoveryBrief, Theme } from "@/lib/types";
import { BIG_TICKET_TASTE } from "./taste";
import { askJSON, llmAvailable } from "./llm";

interface RawTheme {
  title: string;
  rationale: string;
  intent: string;
  searchQueries: string[];
  trendSignal: Theme["trendSignal"];
}

export async function strategizeThemes(brief: DiscoveryBrief, count = 4): Promise<Theme[]> {
  if (!llmAvailable()) return fallbackThemes(brief, count);

  const system = `${BIG_TICKET_TASTE}

You are the Theme Strategist. Given a brief, identify the strongest themes
(subcategories / angles) worth pursuing for a curated collection. Think about
what people are actually trying to solve, what they save to Pinterest, and what
they compare before buying. Favor angles with both desirability and range.`;

  const prompt = `Brief:
- Category: ${brief.category}
- Audience: ${brief.audience}
- Style: ${brief.style}
- Budget: $${brief.budgetMin}-$${brief.budgetMax}
- Notes: ${brief.notes || "(none)"}

Return ${count} themes as JSON:
{"themes":[{"title":"short theme name","rationale":"why this theme deserves pursuit (1-2 sentences, specific)","intent":"the consumer problem being solved","searchQueries":["3-4 concrete shopping queries that would surface real products for this theme, including price/style cues"],"trendSignal":"rising|evergreen|niche|fading"}]}

Make queries specific enough to find real products at credible retailers within the budget. No commentary outside JSON.`;

  try {
    const out = await askJSON<{ themes: RawTheme[] }>({ system, prompt, maxTokens: 1800, temperature: 0.6 });
    return out.themes.slice(0, count).map((t, i) => ({
      id: `theme-${i}`,
      title: t.title,
      rationale: t.rationale,
      intent: t.intent,
      searchQueries: t.searchQueries.slice(0, 4),
      trendSignal: t.trendSignal,
    }));
  } catch {
    return fallbackThemes(brief, count);
  }
}

function fallbackThemes(brief: DiscoveryBrief, count: number): Theme[] {
  const c = brief.category;
  const seeds: Omit<Theme, "id">[] = [
    {
      title: `${brief.style} ${c} that look high-end`,
      rationale: `Design-forward ${c} matched to a ${brief.style} aesthetic and pride of ownership.`,
      intent: `Find ${c} that look intentional, not generic.`,
      searchQueries: [`best ${brief.style} ${c}`, `${c} under $${brief.budgetMax}`, `${brief.style} ${c} design award`],
      trendSignal: "evergreen",
    },
    {
      title: `Best-value ${c} for the budget`,
      rationale: `Strong price-to-quality ${c} that punch above their price.`,
      intent: `Get the right ${c} without overpaying.`,
      searchQueries: [`best value ${c} $${brief.budgetMin}-${brief.budgetMax}`, `${c} best reviews`, `most reliable ${c}`],
      trendSignal: "evergreen",
    },
    {
      title: `The splurge ${c} worth it`,
      rationale: `Premium ${c} that justify the spend through build, warranty, and design.`,
      intent: `Decide if the upgrade is worth it.`,
      searchQueries: [`premium ${c}`, `${c} lifetime warranty`, `${c} hand made`],
      trendSignal: "evergreen",
    },
    {
      title: `Compact ${c} for small spaces`,
      rationale: `Space-conscious ${c} for first homes and apartments.`,
      intent: `Fit a quality ${c} into a small footprint.`,
      searchQueries: [`compact ${c} small kitchen`, `space saving ${c}`, `small ${c} ${brief.style}`],
      trendSignal: "rising",
    },
  ];
  return seeds.slice(0, count).map((t, i) => ({ ...t, id: `theme-${i}` }));
}
