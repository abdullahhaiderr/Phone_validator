/**
 * classifyLineType.ts — pluggable line-type classification module.
 *
 * ⚠ IMPORTANT ACCURACY DISCLAIMER
 * ─────────────────────────────────────────────────────────────────────────
 * The free classification method is BLOCK-LEVEL, not a live carrier lookup:
 * we take the first 6 digits of the number (NPA-NXX = area code + exchange)
 * and look up which carrier category that block was originally assigned to
 * in free public data (tel-carrier-db / NANPA). This is an approximation:
 *
 *   • A landline number ported to a cell carrier (or vice versa) will be
 *     classified by its ORIGINAL block assignment.
 *   • VoIP is the hardest category to classify for free: VoIP providers
 *     very often receive blocks originally classified as CLEC/landline, and
 *     many CLECs are plain landline resellers. We map CLEC/reseller types to
 *     "voip" as a best effort, so treat voip results as low-confidence.
 *
 * For numbers you absolutely must get right, add a paid fallback such as
 * Twilio Lookup (line_type_intelligence) — see `TwilioLineTypeProvider`
 * below for the intended swap-in point.
 */

export type LineType = "cellular" | "landline" | "voip" | "unknown";

/**
 * Map a raw carrier-type label from tel-carrier-db (WIRELESS, WIRELESS PROV,
 * RBOC, CLEC, LEC, IXC, RESELLER, …) to one of our three categories.
 *
 * NOTE: keep this in sync with scripts/import-reference-data.js.
 */
export function mapCarrierTypeToLineType(raw: string | null | undefined): LineType {
  if (!raw) return "unknown";
  const t = raw.toUpperCase();
  // Order matters: check CLEC/VOIP before the generic "LEC" branch.
  if (t.includes("WIRELESS")) return "cellular"; // WIRELESS, WIRELESS PROV, …
  if (t.includes("VOIP")) return "voip";
  if (t.includes("CLEC") || t.includes("RESELLER")) return "voip"; // best effort
  if (
    t.includes("RBOC") ||
    t.includes("ILEC") ||
    t.includes("LEC") ||
    t.includes("WIRELINE") ||
    t.includes("TELCO") ||
    t.includes("RURAL")
  ) {
    return "landline";
  }
  return "unknown";
}

/** Pluggable provider interface — the rest of the app only talks to this. */
export interface LineTypeProvider {
  classify(npaNxx: string): Promise<LineType>;
}

/**
 * Default provider: looks the block up in the `npa_nxx_line_type` Supabase
 * table (populated by scripts/import-reference-data.js). Unknown blocks and
 * lookup failures return "unknown" — we never guess.
 */
export class DatabaseLineTypeProvider implements LineTypeProvider {
  private cache = new Map<string, LineType>();

  constructor(private query: (npaNxxList: string[]) => Promise<Map<string, LineType>>) {}

  async classifyMany(npaNxxList: string[]): Promise<Map<string, LineType>> {
    const missing = [...new Set(npaNxxList)].filter((k) => !this.cache.has(k));
    if (missing.length) {
      const fetched = await this.query(missing);
      for (const k of missing) this.cache.set(k, fetched.get(k) ?? "unknown");
    }
    return this.cache;
  }

  async classify(npaNxx: string): Promise<LineType> {
    await this.classifyMany([npaNxx]);
    return this.cache.get(npaNxx) ?? "unknown";
  }
}

/**
 * OPTIONAL PAID FALLBACK (not wired up by default).
 *
 * Example of how you would add Twilio Lookup without touching the rest of
 * the app — set TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN, enable the toggle in
 * processRows.ts, and only numbers classified "unknown" would be billed:
 *
 *   import twilio from "twilio";
 *   export class TwilioLineTypeProvider implements LineTypeProvider {
 *     private client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
 *     async classify(npaNxx: string): Promise<LineType> {
 *       // NOTE: Twilio looks up full numbers, not blocks — you'd classify a
 *       // representative number per block, or switch the interface to full numbers.
 *       return "unknown";
 *     }
 *   }
 */
