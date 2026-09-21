/**
 * POST /api/process-batch — body: { uploadId, rows: string[] }
 * Processes one batch (client sends ~2,000 rows per call), inserts results,
 * and bumps the processed-rows counter. This is what keeps 200k-row files
 * inside Vercel's serverless time limits: many small calls instead of one
 * giant synchronous request.
 */
import { NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase";
import { processRows } from "@/lib/processRows";

export const dynamic = "force-dynamic";
const MAX_BATCH = 5000; // hard cap per call

export async function POST(req: Request) {
  try {
    const { uploadId, rows } = await req.json();
    if (!uploadId || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "uploadId and a non-empty rows array are required" }, { status: 400 });
    }
    const batch = rows.slice(0, MAX_BATCH).map((r) => String(r ?? ""));
    const supabase = getServiceClient();

    const processed = await processRows(batch);

    // insert in sub-chunks of 1,000 to keep each statement small
    for (let i = 0; i < processed.length; i += 1000) {
      const { error } = await supabase.from("phone_results").insert(processed.slice(i, i + 1000));
      if (error) throw new Error(error.message);
    }

    const { error: rpcError } = await supabase.rpc("increment_processed", {
      p_upload_id: uploadId,
      p_count: processed.length,
    });
    if (rpcError) throw new Error(rpcError.message);

    return NextResponse.json({ processed: processed.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Batch processing failed" }, { status: 500 });
  }
}
