/**
 * supabase.ts — server-side Supabase client for the hub.
 *
 * Used to verify Supabase user JWTs and provision local user records
 * on first sign-in. Requires SUPABASE_URL + SUPABASE_ANON_KEY in server/.env.
 *
 * JWT verification uses SUPABASE_JWT_SECRET (HS256) so it works offline
 * after the first session provision. Get the secret from:
 * Supabase Dashboard → Settings → API → JWT Secret
 */

import { createClient } from "@supabase/supabase-js"
import jwt from "jsonwebtoken"

const SUPABASE_URL     = process.env.SUPABASE_URL      ?? ""
const SUPABASE_ANON    = process.env.SUPABASE_ANON_KEY ?? ""
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? ""

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: false },
})

export interface SupabaseTokenPayload {
  sub: string        // Supabase user UUID
  email?: string
  user_metadata?: { name?: string; full_name?: string }
  role?: string
  iat?: number
  exp?: number
}

/**
 * Verify a Supabase access token locally using the JWT secret (offline-capable).
 * Falls back to Supabase API call if no JWT secret is configured.
 */
export async function verifySupabaseToken(token: string): Promise<SupabaseTokenPayload | null> {
  if (SUPABASE_JWT_SECRET) {
    try {
      const payload = jwt.verify(token, SUPABASE_JWT_SECRET, {
        algorithms: ["HS256"],
      }) as SupabaseTokenPayload
      return payload
    } catch {
      return null
    }
  }

  // Fallback: hit the Supabase API (requires internet)
  try {
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) return null
    return {
      sub:   data.user.id,
      email: data.user.email,
      user_metadata: data.user.user_metadata as SupabaseTokenPayload["user_metadata"],
      role:  "authenticated",
    }
  } catch {
    return null
  }
}
