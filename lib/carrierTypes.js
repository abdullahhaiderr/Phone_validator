/** Carrier business categories are not proof of a subscriber's line technology. */
function mapCarrierTypeToLineType(raw) {
  const t = String(raw ?? "").trim().toUpperCase().replace(/[-_]/g, " ");
  if (/^(CELLULAR|MOBILE|WIRELESS)( PROV| PROVIDER)?$/.test(t) || t === "PCS" || t === "WIRELS RESELLER") return "cellular";
  if (/^(VOIP|FIXED VOIP|NON FIXED VOIP)$/.test(t)) return "voip";
  if (/CLEC|RESELLER/.test(t)) return "unknown";
  if (/^(LANDLINE|FIXED LINE|RBOC|ILEC|LEC|WIRELINE|TELCO|RURAL|IND\. TELCO)$/.test(t)) return "landline";
  return "unknown";
}
module.exports = { mapCarrierTypeToLineType };
