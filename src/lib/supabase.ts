// ---------------------------------------------------------------------------
// supabase.ts — kept only so any remaining import does not break the build.
//
// All active data flow has been moved to the local Express server (local-api.ts).
// This module no longer creates a live Supabase client; it exports a no-op stub
// so legacy imports compile without runtime errors.
// ---------------------------------------------------------------------------

/** Always false — Supabase is no longer the active backend. */
export const isSupabaseConfigured = false

/** No-op stub — never called in the local-server build. */
export const supabase = {
  auth: {
    getUser: async () => ({ data: { user: null }, error: null }),
    getSession: async () => ({ data: { session: null }, error: null }),
    signUp: async () => ({ data: {}, error: { message: "Supabase is not configured." } }),
    signInWithPassword: async () => ({ data: {}, error: { message: "Supabase is not configured." } }),
    signInWithOAuth: async () => ({ data: {}, error: { message: "Supabase is not configured." } }),
    signOut: async () => ({ error: null }),
    onAuthStateChange: (_cb: unknown) => ({ data: { subscription: { unsubscribe: () => {} } } }),
  },
  from: (_table: string) => ({
    select: (..._args: unknown[]) => ({ eq: () => ({ data: null, error: null }), data: null, error: null }),
    insert: (_row: unknown) => ({ select: () => ({ data: null, error: null }) }),
    update: (_row: unknown) => ({ eq: () => ({ select: () => ({ data: null, error: null }) }) }),
    upsert: (_row: unknown) => ({ select: () => ({ data: null, error: null }) }),
    delete: () => ({ eq: () => ({ data: null, error: null }) }),
    single: () => ({ data: null, error: null }),
  }),
  rpc: (_fn: string, _args?: unknown) =>
    Promise.resolve({ data: null, error: { message: "Supabase is not configured.", code: "disabled" } }),
  channel: (_name: string) => ({
    on: () => ({ subscribe: () => ({}) }),
    subscribe: () => ({}),
  }),
  removeChannel: (_ch: unknown) => Promise.resolve(),
  storage: {
    from: (_bucket: string) => ({
      remove: (_paths: string[]) => Promise.resolve({ error: null }),
      upload: (_path: string, _file: unknown) => Promise.resolve({ data: null, error: null }),
      getPublicUrl: (_path: string) => ({ data: { publicUrl: "" } }),
    }),
  },
} as const
