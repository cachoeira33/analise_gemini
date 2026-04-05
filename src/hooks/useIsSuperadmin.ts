'use client'

import { useEffect, useState } from 'react'
import { createClient }       from '@/lib/supabase/client'
import { useAuthUser }        from '@/components/providers/AuthUserProvider'

/**
 * Returns whether the currently authenticated user has the is_superadmin flag
 * set to true in the profiles table.
 *
 * Usage: const { isSuperadmin, isLoading } = useIsSuperadmin()
 */
export function useIsSuperadmin() {
  const { user, isAuthLoading } = useAuthUser()
  const [isSuperadmin, setIsSuperadmin] = useState(false)
  const [isLoading,    setIsLoading]    = useState(true)

  useEffect(() => {
    if (isAuthLoading) return
    if (!user) {
      setIsSuperadmin(false)
      setIsLoading(false)
      return
    }

    const supabase = createClient()
    supabase
      .from('profiles')
      .select('is_superadmin')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        setIsSuperadmin(data?.is_superadmin === true)
        setIsLoading(false)
      })
  }, [isAuthLoading, user])

  return { isSuperadmin, isLoading }
}
