/**
 * GET /api/export?uploadId=&lineType=all|cellular|landline|voip|unknown
 * Streams a CSV of the results (optionally filtered by line type).
 * Fetches the upload in 10k-row chunks so 200k-row files don't blow memory.
 */
import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // allow up to 60s on Vercel (hobby allows 60)

const CSV_HEADER = "original_number,cleaned_number,valid,duplicate,line_type,state,city";

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const uploadId = url.searchParams.get("uploadId");
  if (!uploadId) return NextResponse.json({ error: "uploadId is required" }, { status: 400 });
  const lineType = url.searchParams.get("lineType") ?? "all";
  if (!["all", "cellular", "landline", "voip", "unknown"].includes(lineType)) {
    return NextResponse.json({ error: "invalid lineType" }, { status: 400 });
  }

  const supabase = getServiceClient();
  const lines: string[] = [CSV_HEADER];
  let lastId = 0;
  const CHUNK = 10000;

  // safety valve so a pathological upload can't run forever inside one call
  while (lines.length < 500000) {
    let q = supabase
      .from("phone_results")
      .select("id, original_number, cleaned_number, is_valid, is_duplicate, line_type, state, city")
      .eq("upload_id", uploadId)
      .gt("id", lastId)
      .order("id", { ascending: true })
      .limit(CHUNK);
    if (lineType !== "all") q = q.eq("line_type", lineType);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) break;

    for (const r of data) {
      lines.push(
        [r.original_number, r.cleaned_number, r.is_valid, r.is_duplicate, r.line_type ?? "", r.state ?? "", r.city ?? ""]
          .map(csvEscape)
          .join(",")
      );
    }
    lastId = data[data.length - 1].id;
    if (data.length < CHUNK) break;
  }

  const csv = lines.join("\n");
  const filename = `${lineType === "all" ? "all-results" : lineType}-${uploadId}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
