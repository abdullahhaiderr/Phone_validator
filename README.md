# US Phone Number Validator & Classifier Dashboard

Upload a CSV or Excel file full of US phone numbers and get, for every row:

- ✅ **Valid / Invalid** — strict 10-digit NANP validation (after cleaning)
- 🔁 **Duplicate detection** within the file
- 📱 **Line type** — Cellular/Mobile, Landline, VoIP, or Unknown
- 🗺️ **State + city** — from the area code (where the number was originally assigned)

Plus a **Single Number Lookup** box for one-off checks — no file needed.

**No paid API is required.** Everything runs on free, public reference data (see
[Data sources](#data-sources)) and fits on Vercel's + Supabase's free tiers.

---

## How it works (the 30-second version)

```
Browser                          Vercel API routes                     Supabase (Postgres)
───────                          ─────────────────                     ────────────────────
1. Parse CSV/Excel  ──────────▶  POST /api/upload        ──────────▶  create uploads row
   (papaparse / xlsx)            (create upload record)

2. For each batch    ─────────▶  POST /api/process-batch ──────────▶  bulk-lookup NPA-NXX + area
   of 2,000 rows                 (clean, validate,                 code in reference tables,
                                 classify, insert rows)             insert phone_results rows

3. After last batch  ─────────▶  POST /api/finalize      ──────────▶  mark duplicates + count
                                                                 everything in ONE transaction

4. Poll /api/status ◀─────────   return progress + stats
   + /api/results     ◀────────  paginated table rows
```

Because files are processed in many small batches (never one giant request), a
200,000-row file works fine within Vercel serverless time limits.

---

## Project structure

```
├── app/
│   ├── layout.tsx / page.tsx / globals.css   # App Router shell + dark theme
│   └── api/
│       ├── upload/route.ts          # create the upload record
│       ├── process-batch/route.ts   # classify + insert one batch (≤5k rows)
│       ├── finalize/route.ts        # mark duplicates, compute all counts
│       ├── status/route.ts          # polling: progress + stat counts + distinct states
│       ├── results/route.ts         # paginated/filtered table data
│       ├── lookup/route.ts          # single-number lookup
│       └── export/route.ts          # CSV export (all or per line type)
├── components/
│   ├── Dashboard.tsx                # orchestrates upload → batches → finalize
│   ├── StatCards.tsx                # Total / Valid / Invalid / Duplicates / Cellular / …
│   ├── ResultsTable.tsx             # paginated table with filters
│   ├── SingleLookup.tsx             # one-number lookup box
│   ├── ExportButtons.tsx            # download all / cellular / landline / voip CSVs
│   └── badges.tsx                   # shared status badges
├── lib/
│   ├── phone.ts                     # cleaning + NANP validation
│   ├── classifyLineType.ts          # pluggable line-type classification (+ Twilio stub)
│   ├── stateLookup.ts               # area code → state/city
│   ├── detectPhoneColumn.ts         # auto-detect the phone column in any sheet
│   ├── processRows.ts               # the batch-processing engine
│   └── supabase.ts                  # server-only service-role client
├── scripts/
│   └── import-reference-data.js     # one-time import of the free reference datasets
├── supabase/
│   └── migrations/0001_init.sql     # tables, indexes, duplicate/count SQL functions
├── .env.example                     # all required environment variables
└── README.md
```

---

## Setup

### 1. Prerequisites

- Node.js 18+ (`node -v`)
- A free [Supabase](https://supabase.com) account
- A free [Vercel](https://vercel.com) account
- A free [GitHub](https://github.com) account

### 2. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project** → pick the free tier.
2. Wait for it to finish provisioning, then open **Project Settings → API** and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** (click *Reveal*) → `SUPABASE_SERVICE_ROLE_KEY` — keep this one secret!

### 3. Run the database migration

In the Supabase dashboard, open **SQL Editor → New query**, paste the entire
contents of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql),
and click **Run**. This creates all four tables, the performance indexes, and
the two helper functions.

### 4. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in the three values from step 2.

### 5. Install dependencies and import the reference data

```bash
npm install
npm run import-data
```

This downloads the free datasets and upserts them into `area_code_state` and
`npa_nxx_line_type` (takes a few minutes; safe to re-run any time to refresh).
If a download URL moves, put the file on disk and point the script at it:

```bash
AREA_CODE_CSV=./us-area-code-cities.csv TEL_CARRIER_DATA=./data.json npm run import-data
```

### 6. Run locally

```bash
npm run dev
```

Open http://localhost:3000, attach a CSV/Excel file, and hit **Start Processing**.

### 7. Deploy to Vercel + GitHub

1. Push this folder to a new GitHub repository:

   ```bash
   git init
   git add .
   git commit -m "US phone validator dashboard"
   git branch -M main
   git remote add origin https://github.com/YOUR-USER/YOUR-REPO.git
   git push -u origin main
   ```

   > ⚠️ **Before committing**, make sure `.env.local` exists and `.gitignore`
   > covers it (it does) — the service-role key must never reach GitHub.

2. In [Vercel](https://vercel.com) → **Add New → Project** → import your GitHub repo.
3. In **Project → Settings → Environment Variables**, add the same three variables
   from `.env.example`.
4. Click **Deploy**. Done — the app is live.

> The import script (step 5) only needs to run **once**, against Supabase directly —
> it doesn't matter whether you run it before or after deploying to Vercel.

---

## Data sources

| Table | Source | What it gives you |
|---|---|---|
| `area_code_state` | [ravisorg/Area-Code-Geolocation-Database](https://github.com/ravisorg/Area-Code-Geolocation-Database) (free, public domain compilation) | area code → state, city |
| `npa_nxx_line_type` | [tel-carrier-db](https://git.daplie.com/coolaj86/tel-carrier-db) (GitHub mirror: [coolaj86/tel-carrier-db](https://github.com/coolaj86/tel-carrier-db), Apache-2.0) | first-6-digit block → carrier category (WIRELESS / RBOC / CLEC / …) |

Carrier-type labels are mapped like this (see `lib/classifyLineType.ts`):

| Source label contains | Classified as |
|---|---|
| `WIRELESS`, `WIRELESS PROV` | **Cellular/Mobile** |
| `RBOC`, `LEC`, `ILEC`, `WIRELINE`, `TELCO`, `RURAL` | **Landline** |
| `CLEC`, `RESELLER`, `VOIP` | **VoIP** (best effort) |
| anything else / not found | **Unknown** |

## Accuracy disclaimer (read this!)

- Line-type results are a **block-level estimate from free public data**, not a
  live carrier lookup. A number ported between carriers keeps its *original*
  block classification.
- **VoIP is the hardest** category to get right for free — VoIP providers often
  receive blocks originally classified as CLEC/landline, and many CLECs are
  ordinary landline resellers. Treat VoIP/Unknown results as low-confidence.
- An area code shows where a number was **originally assigned**, not where the
  person currently lives. Numbers port across the country all the time.
- The classification module (`lib/classifyLineType.ts`) is deliberately
  pluggable: add a paid fallback (e.g. Twilio Lookup) later for
  `unknown` numbers only, without rewriting anything else.

## Security notes

- The browser **never** talks to Supabase directly; all DB access goes through
  API routes using the service-role key server-side. No Row Level Security
  setup is required for this app to work.
- There is **no user authentication** — anyone with the URL can use the app.
  If you need to restrict access, put it behind Vercel's
  [deployment protection](https://vercel.com/docs/security/deployment-protection)
  (password protection is free) or add Supabase Auth + RLS later.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Missing … env vars" | `.env.local` (locally) or Vercel env vars aren't set — check names match `.env.example` exactly |
| Everything imports as Unknown | You skipped `npm run import-data`, or it failed — re-run it and watch for errors |
| Upload is slow on huge files | Normal — 200k rows = ~100 sequential batch calls. Progress is shown live |
| Export times out | Vercel hobby allows 60 s per function; `export` already sets `maxDuration = 60`. Filter to a line type to shrink the file |
| "Could not download …" during import | The upstream data URL moved. Download the file manually and pass it via `AREA_CODE_CSV=` / `TEL_CARRIER_DATA=` |
