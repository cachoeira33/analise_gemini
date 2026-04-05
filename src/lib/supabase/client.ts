import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    const missing = [
      !url && 'NEXT_PUBLIC_SUPABASE_URL',
      !key && 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    ].filter(Boolean).join(', ')
    throw new Error(
      `[Supabase] Missing env vars: ${missing}. ` +
      `Add them to .env.local (dev) or your VPS/Vercel environment variables (production).`
    )
  }

  return createBrowserClient(url, key, {
    cookieOptions: {
      name:     'sb-auth-token',
      lifetime: 60 * 60 * 24 * 7,  // 7 days
      domain:   '',                  // current origin (works in incognito)
      path:     '/',
      sameSite: 'lax',
    },
  })
}
