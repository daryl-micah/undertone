import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// No auth in this demo: all reads and writes happen on the server with the
// service role. The browser never talks to Postgres directly.

let client: SupabaseClient | null = null;

export function isConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function db(): SupabaseClient {
  if (!isConfigured()) {
    throw new Error("Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }
  client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  return client;
}

export function mediaUrl(storagePath: string) {
  return db().storage.from("media").getPublicUrl(storagePath).data.publicUrl;
}
