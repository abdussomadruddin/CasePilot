import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const defaultSupabaseUrl = "https://rfqwyhafvfvafiqrcmxa.supabase.co";
const defaultSupabaseKey = "sb_publishable_or7DVUc_la79KiBz4kR5uw_EIGyN3-l";

let browserClient: SupabaseClient | null = null;

export function hasSupabaseConfig() {
  return true;
}

export function getSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || defaultSupabaseUrl;
  const supabaseKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || defaultSupabaseKey;

  if (!browserClient) {
    browserClient = createClient(supabaseUrl, supabaseKey);
  }

  return browserClient;
}
