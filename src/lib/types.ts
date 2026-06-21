// Shared vocabulary for the Big Ticket discovery system.
// Everything the agents produce and the UI renders flows through these shapes.

export interface DiscoveryBrief {
  category: string; // e.g. "coffee makers", "sofas", "air purifiers"
  audience: string; // persona, e.g. "first-time homebuyer, single woman, 30-45"
  style: string; // aesthetic direction, e.g. "warm minimalist", "mid-century"
  budgetMin: number;
  budgetMax: number;
  notes?: string; // freeform extra intent from the operator
}

// A subcategory / angle the Theme Strategist surfaces before we discover products.
export interface Theme {
  id: string;
  title: string; // e.g. "Compact espresso for small kitchens"
  rationale: string; // why this theme is worth pursuing
  intent: string; // the consumer problem being solved
  searchQueries: string[]; // concrete queries used to find products
  trendSignal: "rising" | "evergreen" | "niche" | "fading";
}

// Raw-ish product candidate after discovery + enrichment, before judgment.
export interface ProductCandidate {
  id: string;
  title: string;
  brand: string | null;
  retailer: string | null;
  url: string;
  imageUrl: string | null;
  price: number | null;
  currency: string;
  rating: number | null; // 0-5
  reviewCount: number | null;
  snippet: string | null; // description / context gathered during enrichment
  specs: Record<string, string>;
  themeId: string;
  source: "serper-shopping" | "serper-organic" | "tavily" | "fixture";
}

// The judgment layer. Each axis is 0-100. The composite is a weighted fusion
// of LLM taste scores and hard signals.
export interface Evaluation {
  productId: string;
  scores: {
    aesthetics: number; // does it look like something people are proud to own
    value: number; // price-to-quality, fairness vs alternatives
    quality: number; // build, materials, durability signals
    desirability: number; // emotional pull, aspiration, "save-worthy"
    trendFit: number; // alignment with current + timeless design direction
    credibility: number; // retailer + review trust
  };
  signalScores: {
    reviewStrength: number; // derived from rating + volume
    priceFit: number; // fit within the brief's budget band
    dataCompleteness: number; // how much we actually know about it
  };
  composite: number; // 0-100 final desirability
  verdict: "recommend" | "consider" | "pass";
  rationale: string; // why this deserves (or doesn't deserve) recommendation
  redFlags: string[];
  collectionRole: string; // its job in a collection, e.g. "the splurge", "the value pick"
}

export interface EvaluatedProduct extends ProductCandidate {
  evaluation: Evaluation;
}

// The final curated output: a collection, not a list.
export interface Collection {
  title: string;
  editorialAngle: string; // the editor's POV on this set
  products: EvaluatedProduct[];
  diversityNotes: string; // how the set spans price / brand / style
}

export type RunStatus = "queued" | "discovering" | "evaluating" | "curating" | "done" | "error";

export interface RunStep {
  at: string; // ISO timestamp
  label: string;
  detail?: string;
}

export interface Run {
  id: string;
  brief: DiscoveryBrief;
  status: RunStatus;
  steps: RunStep[];
  themes: Theme[];
  collection: Collection | null;
  error?: string;
  createdAt: string;
  mode: "live" | "mock";
}

export interface Feedback {
  id: string;
  runId: string;
  productId: string;
  productTitle: string;
  signal: "love" | "pass";
  note?: string;
  brief: Pick<DiscoveryBrief, "category" | "audience" | "style">;
  createdAt: string;
}
