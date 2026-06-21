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

export async function strategizeThemes(brief: DiscoveryBrief, count = 10): Promise<Theme[]> {
  if (!llmAvailable()) return fallbackThemes(brief, count);

  const system = `${BIG_TICKET_TASTE}

You are a senior interior-design researcher and trend analyst planning a deep,
high-recall product search. Think like the research team at a top design
publication crossed with a retrieval engineer: decompose the brief into MANY
distinct angles so nothing relevant is missed, then we filter hard later.

Your single most important job is to honor the EXACT look and requirements the
operator asked for. If they ask for "bright patterned floral toasters," every
angle must chase patterned/printed/colorful toasters, never generic good ones.

Decompose the brief along several dimensions to maximize coverage:
1. REQUIREMENT FAMILIES — different flavors of the requested look (e.g. for
   patterned: floral/botanical, animal/jungle, geometric/color-block, abstract
   art prints, themed/novelty, vintage/retro motifs).
2. SPECIALTY SOURCES — makers/retailers known for that look. For patterned or
   design-forward home goods: Anthropologie, MacKenzie-Childs, Williams Sonoma,
   West Elm, Drew Barrymore Beautiful, Smeg collaborations, Etsy, Wayfair,
   Crate & Barrel, Lenox, Cath Kidston, Anna Sui collabs. Pick the right ones
   for THIS category.
3. TREND ANGLES — what's currently rising in this space (e.g. "dopamine decor",
   "grandmillennial", "maximalist kitchen", seasonal collections). Use real,
   current design-trend language.
4. PRICE TIERS — entry, mid, splurge within the budget band.

Rules:
- Read category, style, and notes literally; treat the look as a MUST-HAVE.
- Every search query must combine the category WITH the requested look, using the
  operator's own descriptive words plus the specialty source or trend.
- Never write generic "best <category>" queries; they surface plain products.
- Aim for breadth: distinct angles that together cover the whole space.`;

  const requirement = [brief.style, brief.notes].filter(Boolean).join(". ");
  const prompt = `Brief:
- Category: ${brief.category}
- Audience: ${brief.audience}
- Style / required look: ${brief.style}
- Budget: $${brief.budgetMin}-$${brief.budgetMax}
- Notes / extra requirements: ${brief.notes || "(none)"}

The required look/requirement to honor exactly: "${requirement || brief.category}"

Return ${count} DISTINCT themes as JSON (cover different requirement families,
specialty sources, trend angles, and price tiers so together they map the whole space):
{"themes":[{"title":"short theme name tied to the required look","rationale":"why this theme matches the requirement (1-2 sentences, specific)","intent":"what the operator is actually trying to find","searchQueries":["2-3 concrete shopping queries that would surface products MATCHING THE REQUIRED LOOK, using the operator's own words plus a specialty retailer or trend term; include the category and the look descriptors together"],"trendSignal":"rising|evergreen|niche|fading"}]}

Every query must combine the category with the required look (e.g. "floral print toaster", "patterned colorful toaster Anthropologie", "maximalist toaster West Elm"). No generic "best <category>" queries. Make the ${count} themes genuinely different from each other. No commentary outside JSON.`;

  try {
    const out = await askJSON<{ themes: RawTheme[] }>({ system, prompt, maxTokens: 3000, temperature: 0.7 });
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
  // The required look comes from style + notes. Every query combines the
  // category WITH this look so discovery chases the actual request, not a
  // generic version of the category.
  const look = [brief.style, brief.notes].filter(Boolean).join(" ").trim() || brief.style;
  const specialty = ["Anthropologie", "Williams Sonoma", "West Elm", "Etsy"];
  const seeds: Omit<Theme, "id">[] = [
    {
      title: `${look} ${c}`,
      rationale: `${c} that match the requested look: ${look}.`,
      intent: `Find ${c} with the exact ${look} aesthetic.`,
      searchQueries: [`${look} ${c}`, `${c} ${look}`, `${look} ${c} ${specialty[0]}`],
      trendSignal: "rising",
    },
    {
      title: `Bold patterned ${c}`,
      rationale: `Statement ${c} with prints, patterns, and color that stand out.`,
      intent: `Find ${c} that are visually striking, not plain.`,
      searchQueries: [`patterned ${c}`, `colorful printed ${c}`, `${look} ${c} ${specialty[1]}`],
      trendSignal: "rising",
    },
    {
      title: `Designer & specialty ${c}`,
      rationale: `${c} from makers known for distinctive, decorative designs.`,
      intent: `Surface the most design-forward ${c} available.`,
      searchQueries: [`designer ${c} ${look}`, `${c} ${specialty[3]}`, `unique ${look} ${c}`],
      trendSignal: "rising",
    },
    {
      title: `${look} ${c} under $${brief.budgetMax}`,
      rationale: `On-look ${c} that fit the budget.`,
      intent: `Match the look within the price band.`,
      searchQueries: [`${look} ${c} under $${brief.budgetMax}`, `affordable ${look} ${c}`, `${c} ${look} sale`],
      trendSignal: "evergreen",
    },
  ];
  return seeds.slice(0, count).map((t, i) => ({ ...t, id: `theme-${i}` }));
}
