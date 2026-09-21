export interface Stats {
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  cellular: number;
  landline: number;
  voip: number;
  unknown: number;
}

export default function StatCards({ stats }: { stats: Stats }) {
  const cards: { label: string; value: number; color: string }[] = [
    { label: "Total", value: stats.total, color: "text-slate-100" },
    { label: "Valid", value: stats.valid, color: "text-emerald-400" },
    { label: "Invalid", value: stats.invalid, color: "text-rose-400" },
    { label: "Duplicates", value: stats.duplicates, color: "text-amber-400" },
    { label: "Cellular / Mobile", value: stats.cellular, color: "text-emerald-400" },
    { label: "Landline", value: stats.landline, color: "text-sky-400" },
    { label: "VoIP", value: stats.voip, color: "text-violet-400" },
    { label: "Unknown", value: stats.unknown, color: "text-slate-400" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
      {cards.map((c) => (
        <div key={c.label} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
          <div className="text-xs text-slate-500">{c.label}</div>
          <div className={`mt-1 text-2xl font-bold tabular-nums ${c.color}`}>{c.value.toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}
