import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Lazy Supabase admin client
// ---------------------------------------------------------------------------
// IMPORTANT: Never create a module-level singleton here.
// Process.env.SUPABASE_SERVICE_ROLE_KEY is only guaranteed to be populated at
// request time, not at module import time (Next.js standalone build).
// Always call getSupabaseAdmin() inside your request handler.
// ---------------------------------------------------------------------------

let _client: SupabaseClient | null = null

/**
 * Returns the service-role Supabase client.
 * Initialised lazily on first call so env vars are read at request time,
 * not at module import / build time.
 *
 * Throws clearly if the required env vars are absent — errors surface inside
 * the handler where they are easy to diagnose, not during module evaluation.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (_client) return _client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) throw new Error('Missing env: NEXT_PUBLIC_SUPABASE_URL')
  if (!key) throw new Error('Missing env: SUPABASE_SERVICE_ROLE_KEY')

  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  return _client
}
