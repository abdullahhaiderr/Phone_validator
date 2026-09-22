const Papa = require("papaparse");
const STATES = Object.fromEntries(("Alabama:AL|Alaska:AK|Arizona:AZ|Arkansas:AR|California:CA|Colorado:CO|Connecticut:CT|Delaware:DE|District of Columbia:DC|Florida:FL|Georgia:GA|Hawaii:HI|Idaho:ID|Illinois:IL|Indiana:IN|Iowa:IA|Kansas:KS|Kentucky:KY|Louisiana:LA|Maine:ME|Maryland:MD|Massachusetts:MA|Michigan:MI|Minnesota:MN|Mississippi:MS|Missouri:MO|Montana:MT|Nebraska:NE|Nevada:NV|New Hampshire:NH|New Jersey:NJ|New Mexico:NM|New York:NY|North Carolina:NC|North Dakota:ND|Ohio:OH|Oklahoma:OK|Oregon:OR|Pennsylvania:PA|Rhode Island:RI|South Carolina:SC|South Dakota:SD|Tennessee:TN|Texas:TX|Utah:UT|Vermont:VT|Virginia:VA|Washington:WA|West Virginia:WV|Wisconsin:WI|Wyoming:WY").split("|").map(v => v.split(":")));

function parseAreaCodes(text) {
  const parsed = Papa.parse(text, { skipEmptyLines: "greedy" });
  if (parsed.errors.length) throw new Error("Malformed area-code CSV");
  const rows = new Map();
  for (const cells of parsed.data) {
    const [area_code, city, rawState, country] = cells.map(v => String(v).trim());
    const state = STATES[rawState] ?? rawState;
    if (!/^[2-9]\d{2}$/.test(area_code) || country !== "US" || !state || !city) continue;
    rows.set(JSON.stringify([area_code, city, state]), { area_code, city, state, country });
  }
  if (!rows.size) throw new Error("No usable US area-code rows; database unchanged");
  return [...rows.values()];
}

function normalizeTelCarrierData(json) {
  const out = {};
  const keyOf = v => String(v ?? "").replace(/[\s-]/g, "");
  const add = (key, type) => {
    key = keyOf(key);
    if (/^[2-9]\d{2}[2-9]\d{2}$/.test(key)) out[key] = type;
  };
  if (Array.isArray(json)) {
    for (const item of json) {
      if (!item || typeof item !== "object") continue;
      add(item.npa_nxx ?? item.npanxx ?? item.block ??
        (item.npa && item.nxx ? `${item.npa}${item.nxx}` : ""),
        item.type ?? item.category ?? item.carrier_type ?? item.line_type);
    }
  } else if (json && typeof json === "object") {
    for (const [key, value] of Object.entries(json)) {
      if (/^\d{6}$/.test(keyOf(key))) {
        add(key, typeof value === "string" ? value : value?.type ?? value?.category ?? value?.carrier_type ?? value?.line_type);
      } else if (value && typeof value === "object") {
        for (const inner of Object.keys(value)) add(inner, key);
      }
    }
  }
  if (!Object.keys(out).length) throw new Error("Unrecognized/empty carrier dataset; database unchanged");
  return out;
}
module.exports = { parseAreaCodes, normalizeTelCarrierData };
