import { test } from "node:test";
import assert from "node:assert/strict";
import { ReferenceCache } from "../lib/referenceCache";
import { processRows } from "../lib/processRows";
const { normalizeTelCarrierData } = require("../scripts/reference-parsers");
const { mapCarrierTypeToLineType } = require("../lib/carrierTypes");

test("decodes upstream compressed data, rejects missing metadata and keeps conflicts unknown", () => {
  const data = { list: { "202": [[456,0,0,0,0,0], [457,0,0,0,0,1], [458,0,0,0,0,0], [458,0,0,0,0,1]] } };
  assert.throws(() => normalizeTelCarrierData(data));
  const decoded = normalizeTelCarrierData(data, { types: ["PCS", "IND. TELCO"] });
  assert.equal(mapCarrierTypeToLineType(decoded["202456"]), "cellular");
  assert.equal(mapCarrierTypeToLineType(decoded["202457"]), "landline");
  assert.equal(decoded["202458"], "unknown");
});

test("reference cache bounds memory and expires stale data", () => {
  const cache = new ReferenceCache<string>(2);
  cache.set("a", "a"); cache.set("b", "b"); cache.set("c", "c");
  assert.equal(cache.get("a"), undefined);
  assert.equal(cache.get("c"), "c");
  const expired = new ReferenceCache<string>(2, -1);
  expired.set("a", "a");
  assert.equal(expired.get("a"), undefined);
});

test("20,000 rows retain originals and reuse reference queries across batches", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://reference-test.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-not-a-real-key";
  const originalFetch = globalThis.fetch;
  let queries = 0;
  globalThis.fetch = async (input) => {
    queries++;
    const url = new URL(String(input));
    const data = url.pathname.endsWith("npa_nxx_line_type")
      ? [{ npa_nxx: "202456", line_type: "landline", source: "test" }]
      : url.searchParams.get("offset") === "0"
        ? [{ area_code: "202", state: "DC", city: "Washington" }] : [];
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
  };
  try {
    const input = Array.from({ length: 20000 }, (_, i) => i % 2 ? "+1 (202) 456-1111" : "invalid");
    const output = [];
    for (let i = 0; i < input.length; i += 2000) output.push(...await processRows(input.slice(i, i + 2000)));
    assert.equal(output.length, 20000);
    assert.deepEqual(output.map(r => r.original_number), input);
    assert.equal(output.filter(r => r.line_type === "landline").length, 10000);
    assert.equal(output.filter(r => !r.is_valid).length, 10000);
    assert.equal(queries, 3);
  } finally { globalThis.fetch = originalFetch; }
});
