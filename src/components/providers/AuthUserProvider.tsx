'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

interface AuthUserContextValue {
  user:          User | null
  isAuthLoading: boolean
}

const AuthUserContext = createContext<AuthUserContextValue>({
  user:          null,
  isAuthLoading: true,
})

export function AuthUserProvider({ children }: { children: React.ReactNode }) {
  const [user,          setUser]          = useState<User | null>(null)
  const [isAuthLoading, setIsAuthLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()

    // Step 1: Fast hydration from storage — eliminates the null flash.
    // getSession() reads the persisted token synchronously (no network round-trip)
    // so isAuthLoading flips to false within a single microtask tick.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) {
        setUser(session?.user ?? null)
        setIsAuthLoading(false)
      }
    })

    // Step 2: Subscribe to live auth changes — handles token refresh, sign-out,
    // OAuth callbacks, and cross-tab sessions. This will also re-fire INITIAL_SESSION
    // so any late-arriving token (e.g. after OAuth redirect) is always captured.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!cancelled) {
        setUser(session?.user ?? null)
        setIsAuthLoading(false)
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  return (
    <AuthUserContext.Provider value={{ user, isAuthLoading }}>
      {children}
    </AuthUserContext.Provider>
  )
}

export function useAuthUser(): AuthUserContextValue {
  return useContext(AuthUserContext)
}
