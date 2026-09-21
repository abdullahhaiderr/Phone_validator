/**
 * POST /api/finalize — body: { uploadId }
 * Runs once after the last batch. The finalize_upload() SQL function flags
 * duplicates (all but the first occurrence of each cleaned number) and
 * computes every dashboard count in a single transaction, then marks the
 * upload 'completed'.
 */
import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { uploadId } = await req.json();
    if (!uploadId) return NextResponse.json({ error: "uploadId is required" }, { status: 400 });

    const supabase = getServiceClient();
    const { error } = await supabase.rpc("finalize_upload", { p_upload_id: uploadId });
    if (error) throw new Error(error.message);

    const { data } = await supabase.from("uploads").select("*").eq("id", uploadId).single();
    return NextResponse.json({ upload: data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Finalize failed" }, { status: 500 });
  }
}
