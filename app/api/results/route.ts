/**
 * GET /api/results?uploadId=&page=1&pageSize=25&lineType=&state=&search=
 * Paginated results for the table — never renders 200k rows at once.
 */
import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { cleanPhone } from "@/lib/phone";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const uploadId = url.searchParams.get("uploadId");
  if (!uploadId) return NextResponse.json({ error: "uploadId is required" }, { status: 400 });

  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "25", 10)));
  const lineType = url.searchParams.get("lineType");   // '' | cellular | landline | voip | unknown
  const state = url.searchParams.get("state");
  const search = (url.searchParams.get("search") ?? "").trim();

  const supabase = getServiceClient();
  const build = () => {
    let q = supabase.from("phone_results").select("id, original_number, cleaned_number, is_valid, is_duplicate, line_type, state, city", { count: "exact" }).eq("upload_id", uploadId);
    if (lineType) q = q.eq("line_type", lineType);
    if (state) q = q.eq("state", state);
    if (search) {
      const digits = cleanPhone(search);
      q = q.or(`original_number.ilike.%${search}%,cleaned_number.eq.${digits}`);
    }
    return q;
  };

  const from = (page - 1) * pageSize;
  const { data, count, error } = await build().order("id", { ascending: true }).range(from, from + pageSize - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rows: data ?? [], total: count ?? 0, page, pageSize });
}
