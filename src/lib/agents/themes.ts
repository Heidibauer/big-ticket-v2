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

You are the Theme Strategist. The operator has given a SPECIFIC brief, and the
single most important job is to honor the EXACT look and requirements they asked
for. If they ask for "bright patterned floral toasters," every theme must chase
patterned/printed/colorful toasters, NOT generic good toasters.

Rules:
- Read the category, style, and notes literally. Extract the concrete visual or
  functional requirements (e.g. "prints, patterns, florals, jungle, animals,
  bright multicolor"). These are MUST-HAVES, not suggestions.
- Build themes around DIFFERENT families of that requirement so the final set has
  real variety (e.g. for patterned products: "Floral & botanical prints",
  "Animal & jungle motifs", "Bold geometric color-block").
- Write search queries that a shopper would type to find products matching the
  requirement EXACTLY. Use the operator's own descriptive words. Include
  specialty makers/retailers known for that look when relevant (e.g. for
  patterned/printed home goods: Anthropologie, MacKenzie-Childs, Smeg x Dolce &
  Gabbana, Drew Barrymore Beautiful, Etsy, Williams Sonoma, West Elm).
- Never default to generic queries like "best <category>" when the brief asks
  for a specific look. "best toaster" would surface plain toasters and is wrong here.`;

  const requirement = [brief.style, brief.notes].filter(Boolean).join(". ");
  const prompt = `Brief:
- Category: ${brief.category}
- Audience: ${brief.audience}
- Style / required look: ${brief.style}
- Budget: $${brief.budgetMin}-$${brief.budgetMax}
- Notes / extra requirements: ${brief.notes || "(none)"}

The required look/requirement to honor exactly: "${requirement || brief.category}"

Return ${count} themes as JSON:
{"themes":[{"title":"short theme name tied to the required look","rationale":"why this theme matches the requirement (1-2 sentences, specific)","intent":"what the operator is actually trying to find","searchQueries":["3-4 concrete shopping queries that would surface products MATCHING THE REQUIRED LOOK, using the operator's own words and specialty retailers; include the category and the look descriptors together"],"trendSignal":"rising|evergreen|niche|fading"}]}

Every query must combine the category with the required look (e.g. "floral print toaster", "patterned colorful toaster Anthropologie"). No generic "best <category>" queries. No commentary outside JSON.`;

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
