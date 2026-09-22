import Dashboard from "@/components/Dashboard";

export default function Home() {
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">US Phone Number Validator</h1>
        <p className="mt-1 text-sm text-slate-400">
          Upload a CSV/Excel file to validate numbers, detect duplicates, classify line type
          (cellular / landline / VoIP) and look up the state — powered entirely by free public data.
        </p>
      </header>
      <Dashboard />
      <footer className="mt-10 border-t border-slate-800 pt-4 text-xs text-slate-500">
        Line-type classification is a block-level estimate from free public NPA-NXX data, not a live
        carrier lookup. Area codes show where a number was originally assigned; numbers can be ported.
        Valid means US numbering rules passed, not that the number is active. Unknown means the
        reference data cannot reliably identify the type. Ambiguous carrier categories are not
        treated as proof of VoIP. City is omitted where an area code covers multiple cities.
      </footer>
    </main>
  );
}
