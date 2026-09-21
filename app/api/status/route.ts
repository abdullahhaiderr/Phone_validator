/**
 * GET /api/status?uploadId=xxx — polling endpoint for the progress bar
 * and the stat cards while processing is running / after completion.
 */
import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const uploadId = new URL(req.url).searchParams.get("uploadId");
  if (!uploadId) return NextResponse.json({ error: "uploadId is required" }, { status: 400 });

  const supabase = getServiceClient();
  const { data, error } = await supabase.from("uploads").select("*").eq("id", uploadId).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });

  // statesOnly=1 → just the distinct states present in this upload (for the filter dropdown)
  if (new URL(req.url).searchParams.get("statesOnly") === "1") {
    const { data: states } = await supabase
      .from("phone_results")
      .select("state")
      .eq("upload_id", uploadId)
      .not("state", "is", null)
      .limit(50000);
    const distinct = [...new Set((states ?? []).map((r: any) => r.state))].sort();
    return NextResponse.json({ states: distinct });
  }

  return NextResponse.json({ upload: data });
}
