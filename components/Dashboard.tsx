"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { detectPhoneColumn, rowLooksLikeHeader } from "@/lib/detectPhoneColumn";
import StatCards, { Stats } from "./StatCards";
import ResultsTable from "./ResultsTable";
import SingleLookup from "./SingleLookup";
import ExportButtons from "./ExportButtons";

const BATCH_SIZE = 2000; // rows per /api/process-batch call — safe within Vercel time limits

type Phase = "idle" | "processing" | "completed" | "failed";

interface UploadStatus {
  id: string;
  filename: string;
  total_rows: number;
  processed_rows: number;
  status: string;
  valid_count: number;
  invalid_count: number;
  duplicate_count: number;
  cellular_count: number;
  landline_count: number;
  voip_count: number;
  unknown_count: number;
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `${url} failed`);
  return data;
}

/** Parse CSV (papaparse) or Excel (SheetJS) into a grid of rows. */
async function parseFile(file: File): Promise<unknown[][]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv" || ext === "txt") {
    const text = await file.text();
    const res = Papa.parse<unknown[]>(text, { skipEmptyLines: true });
    return res.data;
  }
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf);
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
}

export default function Dashboard() {
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0); // 0..1
  const [status, setStatus] = useState<UploadStatus | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stats: Stats = {
    total: status?.total_rows ?? 0,
    valid: status?.valid_count ?? 0,
    invalid: status?.invalid_count ?? 0,
    duplicates: status?.duplicate_count ?? 0,
    cellular: status?.cellular_count ?? 0,
    landline: status?.landline_count ?? 0,
    voip: status?.voip_count ?? 0,
    unknown: status?.unknown_count ?? 0,
  };

  // Poll the server while processing so the progress line stays live
  useEffect(() => {
    if (!uploadId || phase !== "processing") return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/status?uploadId=${uploadId}`);
        const data = await res.json();
        if (data.upload) setStatus(data.upload);
      } catch {
        /* ignore transient poll errors */
      }
    }, 1500);
    return () => clearInterval(t);
  }, [uploadId, phase]);

  const startProcessing = useCallback(async () => {
    if (!file) return;
    setPhase("processing");
    setError(null);
    setProgress(0);
    setStatus(null);
    let id: string | null = null;
    try {
      const grid = await parseFile(file);
      if (!grid.length) throw new Error("The file appears to be empty.");

      const col = detectPhoneColumn(grid as unknown[][]);
      if (col < 0) {
        throw new Error(
          "Could not find a phone-number column. Use a header like 'phone', 'number', 'mobile' or 'contact'."
        );
      }

      const hasHeader = rowLooksLikeHeader(grid[0], col);
      const values = (hasHeader ? grid.slice(1) : grid)
        .map((r) => String((r as unknown[])[col] ?? "").trim())
        .filter((v) => v !== "");
      if (!values.length) throw new Error("No phone values found in that column.");

      const { uploadId } = await postJson("/api/upload", { filename: file.name, totalRows: values.length });
      id = uploadId;
      setUploadId(uploadId);

      // send batches sequentially — each call is small enough to never time out
      for (let i = 0; i < values.length; i += BATCH_SIZE) {
        await postJson("/api/process-batch", { uploadId, rows: values.slice(i, i + BATCH_SIZE) });
        setProgress(Math.min(1, (i + BATCH_SIZE) / values.length));
      }

      const { upload } = await postJson("/api/finalize", { uploadId });
      setStatus(upload);
      setProgress(1);
      setPhase("completed");
    } catch (e: any) {
      setError(e.message ?? "Processing failed");
      setPhase("failed");
    }
  }, [file]);

  const clear = useCallback(() => {
    setFile(null);
    setPhase("idle");
    setError(null);
    setUploadId(null);
    setProgress(0);
    setStatus(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const busy = phase === "processing";

  return (
    <div className="space-y-6">
      {/* ── Top bar: Attach / Start / Clear ─────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.txt"
          className="hidden"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPhase("idle");
            setError(null);
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-medium transition hover:border-slate-400 disabled:opacity-40"
        >
          📎 Attach File
        </button>
        <span className="min-w-0 flex-1 truncate text-sm text-slate-400">
          {file ? file.name : "No file selected"} {file && `· ${(file.size / 1024).toFixed(0)} KB`}
        </span>
        <button
          onClick={startProcessing}
          disabled={!file || busy}
          className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Processing…" : "Start Processing"}
        </button>
        <button
          onClick={clear}
          disabled={busy}
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-rose-500 hover:text-rose-400 disabled:opacity-40"
        >
          Clear
        </button>
      </div>

      {/* ── Status / progress line ──────────────────────────────────── */}
      {(busy || phase === "completed" || phase === "failed") && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="truncate">
              {busy ? "⏳ Processing" : phase === "completed" ? "✅ Completed" : "❌ Failed"}:{" "}
              <span className="font-medium text-slate-200">{file?.name}</span>
              {status && (
                <span className="ml-2 text-slate-500">
                  {status.processed_rows.toLocaleString()} / {status.total_rows.toLocaleString()} rows
                </span>
              )}
            </span>
            <span className="tabular-nums text-slate-400">{Math.round(progress * 100)}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
        </div>
      )}

      {/* ── Stat cards ──────────────────────────────────────────────── */}
      <StatCards stats={stats} />

      {/* ── Exports ─────────────────────────────────────────────────── */}
      <ExportButtons uploadId={uploadId} />

      {/* ── Single number lookup ────────────────────────────────────── */}
      <SingleLookup />

      {/* ── Results table ───────────────────────────────────────────── */}
      <ResultsTable uploadId={uploadId} />
    </div>
  );
}
