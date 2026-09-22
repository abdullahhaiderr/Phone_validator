import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanPhone, isValidNanp } from "../lib/phone";
import { mapCarrierTypeToLineType, DatabaseLineTypeProvider } from "../lib/classifyLineType";
import { rowLooksLikeHeader } from "../lib/detectPhoneColumn";
const { parseAreaCodes, normalizeTelCarrierData } = require("../scripts/reference-parsers");

test("normalizes country code, Excel integer text and extensions without joining digits", () => {
  for (const s of ["+1 (202) 456-1111", "2024561111.0", "2.024561111E9", "2024561111 ext. 23", "0012024561111"])
    assert.equal(cleanPhone(s), "2024561111", s);
  assert.equal(cleanPhone("abc2024561111"), "");
  assert.equal(cleanPhone("+442079460018"), "");
  assert.equal(rowLooksLikeHeader(["2.024561111E9"], 0), false);
  assert.equal(rowLooksLikeHeader(["Phone number"], 0), true);
});

test("validates numbering plan instead of treating every NANP-shaped number as US", () => {
  assert.equal(isValidNanp("2024561111"), true);
  for (const n of ["3422345678", "4312345678", "4155550134", "2029111234", "1234567890"])
    assert.equal(isValidNanp(n), false, n);
  assert.equal(isValidNanp("8002345678"), true);
});

test("does not infer VoIP from CLEC or reseller business labels", () => {
  for (const s of ["CLEC", "RESELLER", "unknown", "", null]) assert.equal(mapCarrierTypeToLineType(s), "unknown");
  for (const s of ["mobile", "cellular", "WIRELESS PROV"]) assert.equal(mapCarrierTypeToLineType(s), "cellular");
  assert.equal(mapCarrierTypeToLineType("fixed_line"), "landline");
  assert.equal(mapCarrierTypeToLineType("non-fixed-voip"), "voip");
});

test("parses quoted headerless area CSV without dropping the first row", () => {
  const rows = parseAreaCodes('201,Bayonne,"New Jersey",US,0,0\n201,"City, District","New Jersey",US,0,0\n201,Bayonne,"New Jersey",US,0,0');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].state, "NJ");
  assert.equal(rows[1].city, "City, District");
  assert.throws(() => parseAreaCodes("bad,data"));
});

test("rejects empty carrier imports and normalizes dashed prefixes", () => {
  assert.throws(() => normalizeTelCarrierData({ error: "missing data" }));
  assert.deepEqual(normalizeTelCarrierData([{ npa_nxx: "202-456", line_type: "landline" }]), { "202456": "landline" });
});

test("lookup errors propagate and are not cached as unknown", async () => {
  let attempts = 0;
  const p = new DatabaseLineTypeProvider(async () => {
    if (++attempts === 1) throw new Error("database unavailable");
    return new Map([["202456", "landline"]]);
  });
  await assert.rejects(p.classify("202456"));
  assert.equal(await p.classify("202456"), "landline");
});
