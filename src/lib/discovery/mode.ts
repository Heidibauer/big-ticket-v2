export type RunMode = "live" | "mock";

export function resolveMode(): RunMode {
  const declared = (process.env.DISCOVERY_MODE || "auto").toLowerCase();
  const hasDiscovery = !!(
    process.env.SERPER_API_KEY ||
    process.env.TAVILY_API_KEY ||
    process.env.EXA_API_KEY
  );
  if (declared === "mock") return "mock";
  if (declared === "live") return "live";
  // auto
  return hasDiscovery ? "live" : "mock";
}

export function hasLLM(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}
