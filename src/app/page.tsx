"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/Logo";

const PRESETS = [
  { label: "🎨 Colorful patterned toasters", category: "toasters", audience: "design-loving home cook, 28-45", style: "bright, colorful, bold prints and patterns, florals, animals, anything but plain", budgetMin: 40, budgetMax: 300 },
  { label: "☕ Warm minimalist coffee makers", category: "coffee makers", audience: "first-time homebuyer, single woman, 30-45", style: "warm minimalist", budgetMin: 80, budgetMax: 450 },
  { label: "🛋️ Mid-century sofas", category: "sofas", audience: "first-time homebuyer couple, 28-38", style: "mid-century modern", budgetMin: 800, budgetMax: 2500 },
  { label: "🌿 Sculptural table lamps", category: "table lamps", audience: "interior designer curating for clients", style: "sculptural, editorial", budgetMin: 120, budgetMax: 700 },
];

export default function Home() {
  const router = useRouter();
  const [form, setForm] = useState({ ...PRESETS[0] });
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function start() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/runs/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: form.category, audience: form.audience, style: form.style,
          budgetMin: form.budgetMin, budgetMax: form.budgetMax, notes: notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start run");
      router.push(`/run/${data.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <div className="brand" style={{ marginBottom: 22 }}>
        <Logo height={34} />
      </div>

      <div className="hero fade-up">
        <div className="tagline">Buy once. Buy well.</div>
        <h1>Discover pieces you&apos;ll love.</h1>
        <p>Tell us what you have in mind. We&apos;ll search the best retailers, weigh every detail, and hand you a beautifully curated edit, the kind you&apos;ll actually want to save.</p>
      </div>

      <div className="panel fade-up" style={{ marginTop: 22, animationDelay: "0.05s" }}>
        <div className="grid2">
          <div className="field">
            <label>What are you shopping for?</label>
            <input value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. toasters" />
          </div>
          <div className="field">
            <label>Who&apos;s it for?</label>
            <input value={form.audience} onChange={(e) => set("audience", e.target.value)} placeholder="who is this for" />
          </div>
        </div>
        <div className="field">
          <label>The vibe / must-haves</label>
          <input value={form.style} onChange={(e) => set("style", e.target.value)} placeholder="e.g. bright, colorful, patterned" />
        </div>
        <div className="grid2">
          <div className="field">
            <label>Budget min ($)</label>
            <input type="number" value={form.budgetMin} onChange={(e) => set("budgetMin", Number(e.target.value))} />
          </div>
          <div className="field">
            <label>Budget max ($)</label>
            <input type="number" value={form.budgetMax} onChange={(e) => set("budgetMax", Number(e.target.value))} />
          </div>
        </div>
        <div className="field">
          <label>Anything else? (optional)</label>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="the more specific, the better the results" />
        </div>

        {err && <div className="banner" style={{ marginBottom: 14 }}>{err}</div>}

        <div className="between">
          <button className="btn" onClick={start} disabled={loading}>
            {loading ? <><span className="spinner" /> Curating your edit…</> : <>Curate my edit</>}
          </button>
          <a className="muted small" href="/runs" style={{ fontWeight: 700 }}>Past edits →</a>
        </div>
      </div>

      <div style={{ marginTop: 26 }}>
        <div className="muted small" style={{ marginBottom: 12, fontWeight: 700 }}>Start with an idea</div>
        <div className="row">
          {PRESETS.map((p) => (
            <button key={p.label} className="chip" onClick={() => { setForm({ ...p }); setNotes(""); }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
