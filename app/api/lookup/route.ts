/**
 * POST /api/lookup — body: { number: "..." }
 * Single-number on-demand lookup: same cleaning, validation, line-type and
 * state logic as bulk processing, no file required.
 */
import { NextResponse } from "next/server";
import { processRows } from "@/lib/processRows";
import { cleanPhone, formatNanp, isValidNanp } from "@/lib/phone";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { number } = await req.json();
    if (!number || !String(number).trim()) {
      return NextResponse.json({ error: "A phone number is required" }, { status: 400 });
    }

    const [result] = await processRows([String(number)]);
    const digits = cleanPhone(String(number));

    return NextResponse.json({
      original: String(number),
      cleaned: digits,
      formatted: isValidNanp(digits) ? formatNanp(digits) : digits,
      isValid: result.is_valid,
      lineType: result.line_type,
      state: result.state,
      city: result.city,
      disclaimer:
        "Line type is a block-level estimate from free public data, not a live carrier lookup. " +
        "State reflects the original area-code assignment; numbers can be ported.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Lookup failed" }, { status: 500 });
  }
}
