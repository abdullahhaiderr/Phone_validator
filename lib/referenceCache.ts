/** Bounded, short-lived cache of public reference data, never uploaded numbers. */
export class ReferenceCache<T> {
  private entries = new Map<string, { value: T; expires: number }>();
  constructor(private maxEntries = 10000, private ttlMs = 5 * 60 * 1000) {}
  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }
  set(key: string, value: T) {
    this.entries.delete(key);
    this.entries.set(key, { value, expires: Date.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value!);
  }
}
