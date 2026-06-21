// Thin Claude client. Centralizes model choice, JSON extraction, and retries so
// every agent calls one helper. Provider-swappable: change this file only.

import Anthropic from "@anthropic-ai/sdk";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client)
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      // Bounded retries + per-request timeout so a slow/flaky call can't hang
      // the whole pipeline. 60s is comfortably under the function limit and a
      // single evaluation batch never needs longer.
      maxRetries: 2,
      timeout: 60000,
    });
  return client;
}

export function llmAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

// Ask Claude and parse a single JSON object/array from the reply.
export async function askJSON<T>(opts: {
  system: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
}): Promise<T> {
  const c = getClient();
  if (!c) throw new Error("ANTHROPIC_API_KEY not set");

  const msg = await c.messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 2000,
    temperature: opts.temperature ?? 0.4,
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
  });

  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  return extractJSON<T>(text);
}

export function extractJSON<T>(text: string): T {
  // Strip code fences and grab the first balanced JSON value.
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const firstObj = cleaned.indexOf("{");
  const firstArr = cleaned.indexOf("[");
  let start = -1;
  if (firstObj === -1) start = firstArr;
  else if (firstArr === -1) start = firstObj;
  else start = Math.min(firstObj, firstArr);
  if (start === -1) throw new Error("No JSON found in LLM reply");

  const open = cleaned[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
    } else {
      if (ch === '"') inStr = true;
      else if (ch === open) depth++;
      else if (ch === close) {
        depth--;
        if (depth === 0) {
          const slice = cleaned.slice(start, i + 1);
          return JSON.parse(slice) as T;
        }
      }
    }
  }
  throw new Error("Unbalanced JSON in LLM reply");
}
