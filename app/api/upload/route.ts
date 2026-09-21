/**
 * POST /api/upload — body: { filename, totalRows }
 * Creates the upload record and returns its id. The frontend then sends
 * batches to /api/process-batch and finishes with /api/finalize.
 */
import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { filename, totalRows } = await req.json();
    if (!filename || typeof totalRows !== "number" || totalRows < 0) {
      return NextResponse.json({ error: "filename and totalRows are required" }, { status: 400 });
    }
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from("uploads")
      .insert({ filename: String(filename).slice(0, 255), total_rows: totalRows })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ uploadId: data.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Upload failed" }, { status: 500 });
  }
}
