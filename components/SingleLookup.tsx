"use client";

import { useState } from "react";
import { LineTypeBadge, ValidBadge } from "./badges";

interface LookupResult {
  original: string;
  formatted: string;
  isValid: boolean;
  lineType: string | null;
  state: string | null;
  city: string | null;
  disclaimer: string;
}

export default function SingleLookup() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function lookup() {
    if (!input.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ number: input }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lookup failed");
      setResult(data);
    } catch (e: any) {
      setError(e.message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-300">Single Number Lookup</h2>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && lookup()}
          placeholder="Paste a phone number, e.g. (415) 555-0134"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none placeholder:text-slate-600 focus:border-emerald-500"
        />
        <button
          onClick={lookup}
          disabled={loading || !input.trim()}
          className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "Looking up…" : "Lookup"}
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}

      {result && (
        <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-lg font-semibold tabular-nums">{result.formatted}</span>
            <ValidBadge isValid={result.isValid} />
            <LineTypeBadge lineType={result.lineType} />
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-slate-500">State</dt>
              <dd className="font-medium">{result.state ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">City</dt>
              <dd className="font-medium">{result.city ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Cleaned digits</dt>
              <dd className="font-medium tabular-nums">{result.cleaned || "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Original input</dt>
              <dd className="font-medium">{result.original}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-slate-500">{result.disclaimer}</p>
        </div>
      )}
    </section>
  );
}
