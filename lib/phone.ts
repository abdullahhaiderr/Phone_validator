/**
 * phone.ts — cleaning + NANP validation helpers.
 * Pure functions, safe to use in both browser and server code.
 */

import { parsePhoneNumberFromString } from "libphonenumber-js/max";

/** Parse an entire phone cell; do not concatenate unrelated digits or extensions. */
export function cleanPhone(raw: string): string {
  if (!raw) return "";
  let value = String(raw).trim();
  // Spreadsheet text markers and exact integer/scientific exports.
  value = value.replace(/^'/, "");
  if (/^\d+(?:\.\d+)?e\+?\d+$/i.test(value) || /^\d+\.0+$/.test(value)) {
    const numeric = Number(value);
    if (!Number.isSafeInteger(numeric)) return "";
    value = String(numeric);
  }
  if (value.startsWith("001")) value = "+" + value.slice(2);
  const parsed = parsePhoneNumberFromString(value, { defaultCountry: "US", extract: false });
  if (!parsed || parsed.countryCallingCode !== "1") return "";
  return String(parsed.nationalNumber);
}

/**
 * True only for a valid 10-digit NANP number:
 *   NPA:  [2-9]xx        (area code cannot start with 0/1)
 *   NXX:  [2-9]xx        (exchange cannot start with 0/1)
 */
export function isValidNanp(digits: string): boolean {
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return false;
  // N11 service codes and the reserved fictional 555-0100..0199 range.
  if (digits.slice(1, 3) === "11" || digits.slice(4, 6) === "11") return false;
  if (digits.slice(3, 6) === "555" && /^01\d{2}$/.test(digits.slice(6))) return false;
  const parsed = parsePhoneNumberFromString("+1" + digits);
  // This app is US-only. Canada and other +1 countries aren't US numbers.
  return !!parsed?.isValid() && parsed.country === "US";
}

/** "(415) 555-0134" — cosmetic formatting for display. */
export function formatNanp(digits: string): string {
  if (!isValidNanp(digits)) return digits;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
