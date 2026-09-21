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

export interface ProcessedRow {
  original_number: string;
  cleaned_number: string;
  is_valid: boolean;
  is_duplicate: boolean; // always false here — finalize_upload() flags dups at the end
  line_type: LineType | null; // null for invalid numbers
  state: string | null;
  city: string | null;
}

/** When a block has several rows, prefer the "most important" classification. */
const LINE_TYPE_PRIORITY: Record<LineType, number> = {
  cellular: 0, // main use case → win ties
  landline: 1,
  voip: 2,
  unknown: 3,
};

const IN_CHUNK = 500; // stay under PostgREST's default URL-length limits

async function loadLineTypes(npaNxxList: string[]): Promise<Map<string, LineType>> {
  const supabase = getServiceClient();
  const map = new Map<string, LineType>();
  for (let i = 0; i < npaNxxList.length; i += IN_CHUNK) {
    const { data, error } = await supabase
      .from("npa_nxx_line_type")
      .select("npa_nxx, line_type")
      .in("npa_nxx", npaNxxList.slice(i, i + IN_CHUNK));
    if (error) throw new Error(`npa_nxx_line_type lookup failed: ${error.message}`);
    for (const row of data ?? []) {
      const existing = map.get(row.npa_nxx);
      const incoming = row.line_type as LineType;
      // keep highest-priority classification if the block appears more than once
      if (!existing || LINE_TYPE_PRIORITY[incoming] < LINE_TYPE_PRIORITY[existing]) {
        map.set(row.npa_nxx, incoming);
      }
    }
  }
  return map;
}

async function loadAreaCodes(npaList: string[]): Promise<Map<string, { state: string; city: string }>> {
  const supabase = getServiceClient();
  const map = new Map<string, { state: string; city: string }>();
  for (let i = 0; i < npaList.length; i += IN_CHUNK) {
    const { data, error } = await supabase
      .from("area_code_state")
      .select("area_code, state, city")
      .in("area_code", npaList.slice(i, i + IN_CHUNK));
    if (error) throw new Error(`area_code_state lookup failed: ${error.message}`);
    for (const row of data ?? []) {
      if (!map.has(row.area_code)) map.set(row.area_code, { state: row.state, city: row.city });
    }
  }
  return map;
}

/** Process a batch of raw phone-number strings (≤ a few thousand per call). */
export async function processRows(rawRows: string[]): Promise<ProcessedRow[]> {
  const cleaned = rawRows.map((r) => cleanPhone(String(r ?? "")));
  const validDigits = cleaned.filter(isValidNanp);

  const npaNxxList = [...new Set(validDigits.map((d) => d.slice(0, 6)))];
  const npaList = [...new Set(validDigits.map((d) => d.slice(0, 3)))];

  const [lineTypeMap, areaMap] = await Promise.all([
    npaNxxList.length ? loadLineTypes(npaNxxList) : Promise.resolve(new Map<string, LineType>()),
    npaList.length ? loadAreaCodes(npaList) : Promise.resolve(new Map<string, { state: string; city: string }>()),
  ]);

  return rawRows.map((raw, i) => {
    const digits = cleaned[i];
    const valid = isValidNanp(digits);
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
