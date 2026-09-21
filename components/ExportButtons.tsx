"use client";

const EXPORTS = [
  { label: "Download All (CSV)", lineType: "all" },
  { label: "Cellular Only", lineType: "cellular" },
  { label: "Landline Only", lineType: "landline" },
  { label: "VoIP Only", lineType: "voip" },
  { label: "Unknown Only", lineType: "unknown" },
];

export default function ExportButtons({ uploadId }: { uploadId: string | null }) {
  return (
    <div className="flex flex-wrap gap-2">
      {EXPORTS.map((e) => (
        <a
          key={e.lineType}
          href={uploadId ? `/api/export?uploadId=${uploadId}&lineType=${e.lineType}` : undefined}
          aria-disabled={!uploadId}
          onClick={(ev) => {
            if (!uploadId) ev.preventDefault();
          }}
          className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${
            uploadId
              ? "border-slate-700 bg-slate-900 text-slate-200 hover:border-emerald-500 hover:text-emerald-400"
              : "cursor-not-allowed border-slate-800 bg-slate-900/50 text-slate-600"
          }`}
        >
          ⬇ {e.label}
        </a>
      ))}
    </div>
  );
}
