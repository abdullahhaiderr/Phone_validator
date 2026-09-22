#!/usr/bin/env node
/**
 * import-reference-data.js
 * ─────────────────────────────────────────────────────────────────────────
 * One-time (but safely re-runnable) import of the two FREE reference datasets:
 *
 *   1. Area code → state/city
 *      Source: "Area-Code-Geolocation-Database" by ravisorg
 *      https://github.com/ravisorg/Area-Code-Geolocation-Database
 *      File:    us-area-code-cities.csv  (fields: Area Code, City, State, Country, Lat, Lon)
 *
 *   2. NPA-NXX block → line type (cellular / landline / voip / unknown)
 *      Source: "tel-carrier-db" by coolaj86
 *      https://git.daplie.com/coolaj86/tel-carrier-db  (GitHub mirror: coolaj86/tel-carrier-db)
 *      File:    data.json  (carrier-type labels per NPA-NXX block)
 *
 * The script UPSERTS everything, so you can re-run it any time to refresh data.
 *
 * Usage:
 *   node scripts/import-reference-data.js              # import both datasets
 *   node scripts/import-reference-data.js --areas-only # only area codes
 *   node scripts/import-reference-data.js --nxx-only   # only NPA-NXX blocks
 *   AREA_CODE_CSV=./my.csv TEL_CARRIER_DATA=./my.json node scripts/import-reference-data.js
 *
 * Requires: node 18+ (uses global fetch), and .env.local with Supabase keys.
 */

const fs = require("fs");
const path = require("path");
const { parseAreaCodes, normalizeTelCarrierData } = require("./reference-parsers");
const { mapCarrierTypeToLineType } = require("../lib/carrierTypes");

/* ── tiny .env loader (no dotenv dependency) ─────────────────────────────── */
function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    const p = path.join(process.cwd(), f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

/* ── candidate download URLs ─────────────────────────────────────────────── */
const AREA_CODE_SOURCES = [
  process.env.AREA_CODE_CSV,
  "https://raw.githubusercontent.com/ravisorg/Area-Code-Geolocation-Database/master/us-area-code-cities.csv",
  "https://raw.githubusercontent.com/ravisorg/Area-Code-Geolocation-Database/main/us-area-code-cities.csv",
].filter(Boolean);

const TEL_CARRIER_SOURCES = [
  process.env.TEL_CARRIER_DATA,
  "https://raw.githubusercontent.com/coolaj86/tel-carrier-db/master/data.json",
  "https://raw.githubusercontent.com/coolaj86/tel-carrier-db/main/data.json",
  "https://git.daplie.com/coolaj86/tel-carrier-db/raw/branch/master/data.json",
].filter(Boolean);

/* ── download helpers ────────────────────────────────────────────────────── */
async function fetchText(urls, label) {
  for (const url of urls) {
    const isLocal = !/^https?:/.test(url);
    try {
      console.log(`  Trying ${isLocal ? url : url}`);
      if (isLocal) {
        if (!fs.existsSync(url)) throw new Error("file not found");
        return fs.readFileSync(url, "utf8");
      }
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      console.warn(`  ✗ ${url}: ${e.message}`);
    }
  }
  throw new Error(`Could not download ${label}. Set ${label === "area code CSV" ? "AREA_CODE_CSV" : "TEL_CARRIER_DATA"} to a local file path and re-run.`);
}

/* ── upsert in chunks ────────────────────────────────────────────────────── */
async function upsertChunked(table, rows, onConflict, chunkSize = 1000) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + chunkSize), { onConflict });
    if (error) throw new Error(`${table} upsert failed: ${error.message}`);
    process.stdout.write(`\r  ${table}: ${Math.min(i + chunkSize, rows.length)}/${rows.length}   `);
  }
  console.log("");
}

/* ═════════════════════════════════════════════════════════════════════════
   1. Area code → state/city
   CSV columns: Area Code, City Name, Province/State Name, Country Code, Lat, Lon
   ═════════════════════════════════════════════════════════════════════════ */
async function importAreaCodes() {
  console.log("\n[1/2] Importing area code → state/city …");
  const text = await fetchText(AREA_CODE_SOURCES, "area code CSV");
  const rows = parseAreaCodes(text);
  console.log(`  Parsed ${rows.length} area-code rows. Upserting …`);
  await upsertChunked("area_code_state", rows, "area_code,city,state");
  console.log("  ✓ area_code_state done");
}

/* ═════════════════════════════════════════════════════════════════════════
   2. NPA-NXX block → line type

   tel-carrier-db type labels look like:
     WIRELESS, WIRELESS PROV  → cellular
     RBOC, LEC, ILEC          → landline
     VOIP                    → voip
     CLEC, RESELLER           → unknown (business category is ambiguous)
     anything else / missing  → unknown

   NOTE: keep this mapping in sync with lib/classifyLineType.ts
   ═════════════════════════════════════════════════════════════════════════ */
async function importNpaNxx() {
  console.log("\n[2/2] Importing NPA-NXX → line type …");
  const text = await fetchText(TEL_CARRIER_SOURCES, "tel-carrier-db data");
  const normalized = normalizeTelCarrierData(JSON.parse(text));
  const entries = Object.entries(normalized);
  console.log(`  Parsed ${entries.length} NPA-NXX blocks. Upserting …`);
  const rows = entries.map(([npaNxx, rawType]) => ({
    npa_nxx: npaNxx,
    line_type: mapCarrierTypeToLineType(rawType),
    source: "tel-carrier-db:explicit-label-v2",
    last_updated: new Date().toISOString(),
  }));
  if (!rows.some(row => row.line_type !== "unknown")) {
    throw new Error("Dataset has no recognized line-type labels; refusing to overwrite reference data");
  }
  await upsertChunked("npa_nxx_line_type", rows, "npa_nxx");
  console.log("  ✓ npa_nxx_line_type done");
}

/* ── main ────────────────────────────────────────────────────────────────── */
(async () => {
  const args = process.argv.slice(2);
  const areasOnly = args.includes("--areas-only");
  const nxxOnly = args.includes("--nxx-only");
  try {
    if (!nxxOnly) await importAreaCodes();
    if (!areasOnly) await importNpaNxx();
    console.log("\n✅ Reference data import complete. Re-run this script any time to refresh.");
  } catch (e) {
    console.error("\n❌ Import failed:", e.message);
    process.exit(1);
  }
})();
