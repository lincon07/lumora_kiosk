import { createClient, type SupabaseClient } from "@supabase/supabase-js"

// Credentials are surfaced as VITE_SUPABASE_* by vite.config.ts (mapped from the
// NEXT_PUBLIC_SUPABASE_* / SUPABASE_* env the integration provides).
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** True when Supabase is configured — used to pick the active API adapter. */
export const isSupabaseConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY)

// A single shared client. Supabase Auth uses bearer tokens in the Authorization
// header (not cookies), which is exactly why it works inside the Tauri iOS
// webview where the `tauri://localhost` origin previously broke cookie auth.
export const supabase: SupabaseClient = createClient(SUPABASE_URL ?? "", SUPABASE_ANON_KEY ?? "", {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
