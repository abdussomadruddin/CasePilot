import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const defaultSupabaseUrl = "https://kfyqyxiycvdknlcpjmts.supabase.co";
const defaultSupabaseKey = "sb_publishable_Fs_FX9W23A3AbS-T8szB1g_pW_pNDui";
const oldSupabaseUrl = "https://rfqwyhafvfvafiqrcmxa.supabase.co";

let browserClient: SupabaseClient | null = null;

export function hasSupabaseConfig() {
  return true;
}

export function getSupabaseClient() {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const useDefaultProject = !configuredUrl || configuredUrl === oldSupabaseUrl;
  const supabaseUrl = useDefaultProject ? defaultSupabaseUrl : configuredUrl;
  const supabaseKey = useDefaultProject
    ? defaultSupabaseKey
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || defaultSupabaseKey;

  if (!browserClient) {
    browserClient = createClient(supabaseUrl, supabaseKey);
  }

  return browserClient;
}
