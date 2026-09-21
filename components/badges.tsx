/** Small coloured status badges shared across the dashboard. */
export function LineTypeBadge({ lineType }: { lineType: string | null }) {
  if (!lineType) return <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">—</span>;
  const styles: Record<string, string> = {
    cellular: "bg-emerald-500/15 text-emerald-400",
    landline: "bg-sky-500/15 text-sky-400",
    voip: "bg-violet-500/15 text-violet-400",
    unknown: "bg-slate-500/15 text-slate-400",
  };
  const label: Record<string, string> = {
    cellular: "Cellular / Mobile",
    landline: "Landline",
    voip: "VoIP",
    unknown: "Unknown",
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${styles[lineType] ?? styles.unknown}`}>
      {label[lineType] ?? lineType}
    </span>
  );
}

export function ValidBadge({ isValid }: { isValid: boolean }) {
  return isValid ? (
    <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">Valid</span>
  ) : (
    <span className="rounded bg-rose-500/15 px-2 py-0.5 text-xs font-medium text-rose-400">Invalid</span>
  );
}

export function DuplicateBadge({ isDuplicate }: { isDuplicate: boolean }) {
  if (!isDuplicate) return <span className="text-xs text-slate-600">—</span>;
  return (
    <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400">Duplicate</span>
  );
}
