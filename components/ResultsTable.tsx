"use client";

import { useCallback, useEffect, useState } from "react";
import { DuplicateBadge, LineTypeBadge, ValidBadge } from "./badges";

interface Row {
  id: number;
  original_number: string;
  cleaned_number: string;
  is_valid: boolean;
  is_duplicate: boolean;
  line_type: string | null;
  state: string | null;
  city: string | null;
}

const LINE_TYPES = [
  { value: "", label: "All line types" },
  { value: "cellular", label: "Cellular / Mobile" },
  { value: "landline", label: "Landline" },
  { value: "voip", label: "VoIP" },
  { value: "unknown", label: "Unknown" },
];

export default function ResultsTable({ uploadId }: { uploadId: string | null }) {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [lineType, setLineType] = useState("");
  const [state, setState] = useState("");
  const [states, setStates] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const fetchRows = useCallback(async () => {
    if (!uploadId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ uploadId, page: String(page), pageSize: String(pageSize) });
      if (lineType) params.set("lineType", lineType);
      if (state) params.set("state", state);
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/results?${params}`);
      const data = await res.json();
      if (res.ok) {
        setRows(data.rows);
        setTotal(data.total);
      }
    } finally {
      setLoading(false);
    }
  }, [uploadId, page, pageSize, lineType, state, search]);

  // load distinct states for the filter dropdown whenever the upload changes
  useEffect(() => {
    setPage(1);
    setState("");
    setStates([]);
    if (!uploadId) {
      setRows([]);
      setTotal(0);
      return;
    }
    fetch(`/api/status?uploadId=${uploadId}&statesOnly=1`)
      .then((r) => r.json())
      .then((d) => setStates(d.states ?? []))
      .catch(() => {});
  }, [uploadId]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  if (!uploadId) {
    return (
      <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-center text-sm text-slate-500">
        Results will appear here after you process a file.
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={lineType}
          onChange={(e) => { setLineType(e.target.value); setPage(1); }}
          className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm outline-none focus:border-emerald-500"
        >
          {LINE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <select
          value={state}
          onChange={(e) => { setState(e.target.value); setPage(1); }}
          className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm outline-none focus:border-emerald-500"
        >
          <option value="">All states</option>
          {states.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search numbers…"
          className="w-52 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm outline-none placeholder:text-slate-600 focus:border-emerald-500"
        />
        <span className="ml-auto text-xs text-slate-500">
          {total.toLocaleString()} row{total === 1 ? "" : "s"} {loading && "· loading…"}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2 pr-4 font-medium">Original</th>
              <th className="py-2 pr-4 font-medium">Cleaned</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">Duplicate</th>
              <th className="py-2 pr-4 font-medium">Line type</th>
              <th className="py-2 pr-4 font-medium">State</th>
              <th className="py-2 pr-4 font-medium">City</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                <td className="py-2 pr-4">{r.original_number}</td>
                <td className="py-2 pr-4 tabular-nums text-slate-400">{r.cleaned_number || "—"}</td>
                <td className="py-2 pr-4"><ValidBadge isValid={r.is_valid} /></td>
                <td className="py-2 pr-4"><DuplicateBadge isDuplicate={r.is_duplicate} /></td>
                <td className="py-2 pr-4"><LineTypeBadge lineType={r.line_type} /></td>
                <td className="py-2 pr-4">{r.state ?? "—"}</td>
                <td className="py-2 pr-4 text-slate-400">{r.city ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-slate-500">
                  No rows match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="rounded-lg border border-slate-700 px-3 py-1.5 transition hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ← Prev
        </button>
        <span className="text-xs text-slate-500">
          Page {page} of {totalPages.toLocaleString()}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
          className="rounded-lg border border-slate-700 px-3 py-1.5 transition hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </section>
  );
}
