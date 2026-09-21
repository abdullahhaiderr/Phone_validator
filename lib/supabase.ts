/**
 * supabase.ts — server-only Supabase client (service role).
 * NEVER import this from a client component ("use client").
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let serviceClient: SupabaseClient | null = null;

const PROJECT_URL = "https://mjputemvqnycjnugahog.supabase.co";

function resolveSupabaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  if (raw && /^https?:\/\//i.test(raw)) {
    return raw.replace(/\/+$/, "");
  }

  return PROJECT_URL;
}

/** Service-role client: bypasses RLS, used by all API routes for reads/writes. */
export function getServiceClient(): SupabaseClient {
  if (!serviceClient) {
    const url = resolveSupabaseUrl();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

    if (!key) {
      throw new Error(
        "Missing SUPABASE_SERVICE_ROLE_KEY — check your Vercel environment variables."
      );
    }

    serviceClient = createClient(url, key, {
      auth: { persistSession: false },
    });
  }

  return serviceClient;
}
