/**
 * phone.ts — cleaning + NANP validation helpers.
 * Pure functions, safe to use in both browser and server code.
 */

/** Strip everything except digits, then drop a leading US country code "1". */
export function cleanPhone(raw: string): string {
  if (!raw) return "";
  let digits = String(raw).replace(/\D/g, "");
  // 11 digits starting with 1 → US number with country code, drop the 1
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits;
}

/**
 * True only for a valid 10-digit NANP number:
 *   NPA:  [2-9]xx        (area code cannot start with 0/1)
 *   NXX:  [2-9]xx        (exchange cannot start with 0/1)
 */
export function isValidNanp(digits: string): boolean {
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(digits);
}

/** "(415) 555-0134" — cosmetic formatting for display. */
export function formatNanp(digits: string): string {
  if (!isValidNanp(digits)) return digits;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
