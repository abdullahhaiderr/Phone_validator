/**
 * Free NPA-NXX results describe original block assignments, not live carriers.
 * CLEC/reseller labels are ambiguous and must not be treated as proof of VoIP.
 */
export type LineType = "cellular" | "landline" | "voip" | "unknown";
export { mapCarrierTypeToLineType } from "./carrierTypes";

export interface LineTypeProvider {
  classify(npaNxx: string): Promise<LineType>;
}

export class DatabaseLineTypeProvider implements LineTypeProvider {
  private cache = new Map<string, LineType>();
  constructor(private query: (keys: string[]) => Promise<Map<string, LineType>>) {}

  async classifyMany(keys: string[]): Promise<Map<string, LineType>> {
    const missing = [...new Set(keys)].filter(k => !this.cache.has(k));
    if (missing.length) {
      const fetched = await this.query(missing);
      for (const key of missing) this.cache.set(key, fetched.get(key) ?? "unknown");
    }
    return this.cache;
  }

  async classify(key: string): Promise<LineType> {
    await this.classifyMany([key]);
    return this.cache.get(key) ?? "unknown";
  }
}

// A live provider must query each FULL NUMBER, never a representative per prefix.
