"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const PRESETS = [
  { category: "coffee makers", audience: "first-time homebuyer, single woman, 30-45", style: "warm minimalist", budgetMin: 80, budgetMax: 450 },
  { category: "sofas", audience: "first-time homebuyer couple, 28-38", style: "mid-century modern", budgetMin: 800, budgetMax: 2500 },
  { category: "air purifiers", audience: "new parent, 30-40", style: "clean scandinavian", budgetMin: 150, budgetMax: 600 },
  { category: "table lamps", audience: "interior designer curating for clients", style: "sculptural, editorial", budgetMin: 120, budgetMax: 700 },
];

export default function Home() {
  const router = useRouter();
  const [form, setForm] = useState(PRESETS[0]);
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
        body: JSON.stringify({ ...form, notes: notes || undefined }),
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
      <div className="brand">
        <div className="brand-mark">BT</div>
        <h1>Big Ticket — Product Discovery</h1>
      </div>
      <p className="subtitle">
        An AI buyer, merchandiser, and curator. Give it a brief. It finds products worth owning.
      </p>

      <div className="panel">
        <div className="grid2">
          <div className="field">
            <label>Category</label>
            <input value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. coffee makers" />
          </div>
          <div className="field">
            <label>Audience</label>
            <input value={form.audience} onChange={(e) => set("audience", e.target.value)} placeholder="who is this for" />
          </div>
        </div>
        <div className="grid2">
          <div className="field">
            <label>Style</label>
            <input value={form.style} onChange={(e) => set("style", e.target.value)} placeholder="e.g. warm minimalist" />
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
        </div>
        <div className="field">
          <label>Notes (optional intent)</label>
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="anything else the system should weigh" />
        </div>

        {err && <div className="banner" style={{ marginBottom: 14 }}>{err}</div>}

        <div className="between">
          <button className="btn" onClick={start} disabled={loading}>
            {loading ? <><span className="spinner" /> &nbsp;Running the agents…</> : "Discover products"}
          </button>
          <a className="muted small" href="/runs">Past runs →</a>
        </div>
      </div>

      <div style={{ marginTop: 22 }}>
        <div className="muted small" style={{ marginBottom: 10 }}>Quick briefs</div>
        <div className="row">
          {PRESETS.map((p) => (
            <button key={p.category} className="btn-ghost" onClick={() => setForm(p)}>
              {p.category}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
