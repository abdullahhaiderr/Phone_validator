/**
 * detectPhoneColumn.ts — figure out which column of an uploaded sheet holds
 * phone numbers. Pure client-safe logic (no server imports).
 *
 * Strategy:
 *   1. Header match: column header contains phone-ish keywords → strong signal
 *   2. Content match: most sample values clean to 10/11 digits → supporting signal
 * Returns the winning column index, or -1 if nothing looks like phone numbers.
 */

const HEADER_KEYWORDS = [
  "phone",
  "number",
  "contact",
  "mobile",
  "cell",
  "tel",
  "phonenumber",
  "phone_number",
  "msisdn",
];

export function rowLooksLikeHeader(row: unknown[] | undefined, col: number): boolean {
  if (!row) return false;
  const v = String(row[col] ?? "").trim();
  // A header cell usually contains letters; a phone number doesn't.
  return /[a-z]/i.test(v);
}

export function detectPhoneColumn(grid: unknown[][]): number {
  if (!grid.length) return -1;
  const sample = grid.slice(0, 201); // header + up to 200 data rows
  const width = Math.max(...sample.map((r) => r.length));

  let bestCol = -1;
  let bestScore = 0;

  for (let c = 0; c < width; c++) {
    let score = 0;

    // (1) header keyword match
    const header = String(sample[0]?.[c] ?? "").toLowerCase().trim();
    if (HEADER_KEYWORDS.some((k) => header.includes(k))) score += 3;

    // (2) content: fraction of values that look like phone numbers
    let phoneish = 0;
    let nonempty = 0;
    for (const row of sample.slice(1)) {
      const v = String(row[c] ?? "").trim();
      if (!v) continue;
      nonempty++;
      const digits = v.replace(/\D/g, "");
      if (digits.length === 10 || (digits.length === 11 && digits.startsWith("1"))) phoneish++;
    }
    if (nonempty) score += phoneish / nonempty;

    if (score > bestScore) {
      bestScore = score;
      bestCol = c;
    }
  }

  // Require at least some confidence before committing to a column
  return bestScore >= 0.5 ? bestCol : -1;
}
