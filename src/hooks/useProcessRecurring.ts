'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

// ─── Hook ─────────────────────────────────────────────────────────────────────
//
//  Calls the process_recurring_items Postgres RPC once per mount / businessId
//  change. All idempotency and race-condition safety lives in the RPC itself
//  (FOR UPDATE SKIP LOCKED). This hook is fire-and-forget — failures are silent
//  because a missed cycle will be caught on the next dashboard load.

export function useProcessRecurring(businessId: string | null) {
  useEffect(() => {
    if (!businessId) return

    async function run() {
      const supabase = createClient()
      const { error } = await supabase.rpc('process_recurring_items', {
        p_business_id: businessId,
      })
      // Always surface errors to the browser console — visible in DevTools
      // regardless of build mode. A missed cycle will retry on the next load.
      if (error) {
        console.error('[useProcessRecurring] RPC failed:', error.message, error)
      }
    }

    run()
  }, [businessId]) // eslint-disable-line react-hooks/exhaustive-deps
}
