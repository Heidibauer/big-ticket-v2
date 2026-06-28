// Category gate. Discovery searches for the LOOK ("colorful, floral, patterned")
// and can pull in things that match the style but are the WRONG category: wall
// art, prints, posters, decals, fridge skins/wraps, stickers, digital downloads,
// lampshades-only, etc. This gate drops that noise so a "patterned toaster" hunt
// returns toasters, not toaster-themed wall art.

import type { ProductCandidate, DiscoveryBrief } from "@/lib/types";

// Phrases that signal a product is NOT a real physical item in the category:
// decor add-ons, art, downloads, accessories that merely depict the category.
const NON_PRODUCT_SIGNALS = [
  "wall art", "wall print", "art print", "poster", "canvas print", "giclee", "giclée",
  "digital download", "printable", "instant download", "svg", "png file", "clip art",
  "decal", "sticker", "skin", "wrap", "vinyl", "magnet", "mural", "wallpaper",
  "lampshade", "shade only", "replacement shade", "cover only", "slipcover",
  "coloring", "colouring", "greeting card", "postcard", "tea towel", "dish towel",
  "cushion cover", "pillow cover", "ornament", "figurine", "cross stitch", "embroidery",
  "pattern pdf", "sewing pattern", "template", "mockup", "bundle of", "print bundle",
  "set of prints", "watercolour print", "watercolor print",
];

function norm(s: string): string {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

// Returns true if the product should be KEPT (is plausibly the real category).
export function passesCategoryGate(p: ProductCandidate, brief: DiscoveryBrief): boolean {
  const title = norm(p.title);
  const hay = `${title} ${norm(p.snippet || "")}`;

  // 1. Drop obvious non-product noise.
  if (NON_PRODUCT_SIGNALS.some((sig) => hay.includes(sig))) return false;

  // 2. The category noun should appear in the title (or a close singular/plural).
  //    e.g. brief "toasters" -> title must contain "toaster".
  const catWords = norm(brief.category)
    .split(" ")
    .map((w) => w.replace(/s$/, "")) // crude singularization
    .filter((w) => w.length > 2);
  if (catWords.length === 0) return true; // no usable category word; don't over-filter
  // Require at least one category word to be present in the title.
  const inTitle = catWords.some((w) => title.includes(w));
  return inTitle;
}
