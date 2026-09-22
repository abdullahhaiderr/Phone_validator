/**
 * processRows.ts — the heart of the pipeline.
 * Takes raw strings (one phone number each), cleans + validates them, then
 * classifies line type (NPA-NXX block) and state/city (area code) using the
 * reference tables in Supabase. All lookups are batched (`.in()` queries) so
 * a 2,000-row batch costs only a handful of DB round-trips.
 */
import { getServiceClient } from "./supabase";
import { cleanPhone, isValidNanp } from "./phone";
import type { LineType } from "./classifyLineType";
import { ReferenceCache } from "./referenceCache";

const lineCache = new ReferenceCache<LineType>();
type Area = { state: string | null; city: string | null };
const areaCache = new ReferenceCache<Area>(1000);

export interface ProcessedRow {
  original_number: string;
  cleaned_number: string;
  is_valid: boolean;
  is_duplicate: boolean; // always false here — finalize_upload() flags dups at the end
  line_type: LineType | null; // null for invalid numbers
  state: string | null;
  city: string | null;
}

const IN_CHUNK = 500; // stay under PostgREST's default URL-length limits

async function loadLineTypes(npaNxxList: string[]): Promise<Map<string, LineType>> {
  const supabase = getServiceClient();
  const map = new Map<string, LineType>();
  for (const key of npaNxxList) {
    const value = lineCache.get(key);
    if (value !== undefined) map.set(key, value);
  }
  const requested = npaNxxList;
  npaNxxList = requested.filter(key => !map.has(key));
  for (let i = 0; i < npaNxxList.length; i += IN_CHUNK) {
    const { data, error } = await supabase
      .from("npa_nxx_line_type")
      .select("npa_nxx, line_type, source")
      .in("npa_nxx", npaNxxList.slice(i, i + IN_CHUNK));
    if (error) throw new Error(`npa_nxx_line_type lookup failed: ${error.message}`);
    for (const row of data ?? []) {
      // Legacy importer guessed CLEC/reseller = VoIP and discarded the raw label.
      // Without provenance those rows cannot safely assert VoIP.
      const incoming: LineType = row.source === "tel-carrier-db" && row.line_type === "voip"
        ? "unknown" : row.line_type as LineType;
      map.set(row.npa_nxx, incoming);
    }
  }
  // Cache missing prefixes only after all database queries succeed.
  for (const key of npaNxxList) {
    const value = map.get(key) ?? "unknown";
    lineCache.set(key, value);
    map.set(key, value);
  }
  return map;
}

async function loadAreaCodes(npaList: string[]): Promise<Map<string, { state: string | null; city: string | null }>> {
  const cached = new Map<string, Area>();
  for (const key of npaList) {
    const value = areaCache.get(key);
    if (value !== undefined) cached.set(key, value);
  }
  npaList = npaList.filter(key => !cached.has(key));
  const supabase = getServiceClient();
  const groups = new Map<string, { states: Set<string>; cities: Set<string> }>();
  // Area codes have many city rows. Page explicitly rather than losing rows to
  // PostgREST's response cap, and never select an arbitrary city as a location.
  for (let i = 0; i < npaList.length; i += 20) {
    let offset = 0;
    while (true) {
      const { data, error } = await supabase.from("area_code_state")
        .select("area_code, state, city")
        .eq("country", "US")
        .in("area_code", npaList.slice(i, i + 20))
        .order("area_code").order("state").order("city")
        .range(offset, offset + 499);
      if (error) throw new Error(`area_code_state lookup failed: ${error.message}`);
      if (!data?.length) break;
      for (const row of data) {
        const group = groups.get(row.area_code) ?? { states: new Set<string>(), cities: new Set<string>() };
        group.states.add(row.state);
        group.cities.add(row.city);
        groups.set(row.area_code, group);
      }
      offset += data.length;
    }
  }
  const fetched = new Map<string, Area>([...groups].map(([key, value]) => [key, {
    state: value.states.size === 1 ? [...value.states][0] : null,
    city: value.cities.size === 1 ? [...value.cities][0] : null,
  }]));
  for (const key of npaList) {
    const value = fetched.get(key) ?? { state: null, city: null };
    areaCache.set(key, value);
    cached.set(key, value);
  }
  return cached;
}

/** Process a batch of raw phone-number strings (≤ a few thousand per call). */
export async function processRows(rawRows: string[]): Promise<ProcessedRow[]> {
  // Reuse work for repeated cells/numbers, preserving every uploaded row.
  const normalized = new Map<string, string>();
  const cleaned = rawRows.map(r => {
    const raw = String(r ?? "");
    if (!normalized.has(raw)) normalized.set(raw, cleanPhone(raw));
    return normalized.get(raw)!;
  });
  const validity = new Map([...new Set(cleaned)].map(d => [d, isValidNanp(d)]));
  const validDigits = [...validity].filter(([, valid]) => valid).map(([d]) => d);

  const npaNxxList = [...new Set(validDigits.map((d) => d.slice(0, 6)))];
  const npaList = [...new Set(validDigits.map((d) => d.slice(0, 3)))];

  const [lineTypeMap, areaMap] = await Promise.all([
    npaNxxList.length ? loadLineTypes(npaNxxList) : Promise.resolve(new Map<string, LineType>()),
    npaList.length ? loadAreaCodes(npaList) : Promise.resolve(new Map<string, { state: string | null; city: string | null }>()),
  ]);

  return rawRows.map((raw, i) => {
    const digits = cleaned[i];
    const valid = validity.get(digits)!;
    const area = valid ? areaMap.get(digits.slice(0, 3)) : undefined;
    return {
      original_number: String(raw ?? "").slice(0, 60),
      cleaned_number: digits,
      is_valid: valid,
      is_duplicate: false, // flagged later by finalize_upload()
      line_type: valid ? (lineTypeMap.get(digits.slice(0, 6)) ?? "unknown") : null,
      state: valid ? (area?.state ?? null) : null,
      city: valid ? (area?.city ?? null) : null,
    };
  });
}
