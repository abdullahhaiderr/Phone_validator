/**
 * stateLookup.ts — area code (NPA) → state/city lookup.
 *
 * Data lives in the `area_code_state` Supabase table, imported from the free
 * ravisorg "Area-Code-Geolocation-Database":
 *   https://github.com/ravisorg/Area-Code-Geolocation-Database
 *
 * ⚠ An area code only tells you where a number was ORIGINALLY assigned.
 * Numbers can be ported anywhere, so a "TX" number may now belong to someone
 * in New York. We surface the first city we have on record for each code.
 */
export interface AreaCodeInfo {
  state: string;
  city: string;
  country?: string;
}

/** Pick a display city when an area code maps to several (first row wins). */
export function pickAreaCodeInfo(rows: AreaCodeInfo[] | null | undefined): AreaCodeInfo | null {
  return rows && rows.length ? rows[0] : null;
}
