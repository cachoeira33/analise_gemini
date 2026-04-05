'use client'

import { useEffect } from 'react'
import { differenceInCalendarDays, parseISO } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { useAuthUser } from '@/components/providers/AuthUserProvider'

// ─── Config ────────────────────────────────────────────────────────────────────

const ALERT_WINDOW_DAYS = 3   // Generate alerts for transactions due within this many days

// ─── Types ────────────────────────────────────────────────────────────────────

interface PendingTx {
  id:          string
  description: string
  amount:      number
  currency:    string
  due_date:    string
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
//
//  Runs once on mount and whenever businessId changes.
//  Queries pending/unpaid transactions with a due_date in the alert window,
//  then upserts notifications with ignoreDuplicates so re-runs are safe.

export function useGenerateAlerts(businessId: string | null) {
  const { user, isAuthLoading } = useAuthUser()

  useEffect(() => {
    if (isAuthLoading || !user || !businessId) return
    const userId = user.id   // capture before async boundary
    let cancelled = false

    async function generate() {
      const supabase = createClient()

      // 1. Find pending transactions with a due_date on or before the alert horizon
      const horizon = new Date()
      horizon.setDate(horizon.getDate() + ALERT_WINDOW_DAYS)

      const { data: txs } = await supabase
        .from('transactions')
        .select('id, description, amount, currency, due_date')
        .eq('business_id', businessId)
        .neq('kanban_status', 'paid')
        .not('due_date', 'is', null)
        .lte('due_date', horizon.toISOString())
        .order('due_date', { ascending: true })
        .limit(50)                                    // Safety cap — no runaway inserts

      if (!txs?.length || cancelled) return

      // 3. Build notification payloads
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const notifications = (txs as PendingTx[]).map((tx) => {
        const dueDate  = parseISO(tx.due_date)
        const daysLeft = differenceInCalendarDays(dueDate, today)

        let title: string
        let body:  string

        if (daysLeft < 0) {
          title = `Overdue: ${tx.description || 'Payment'}`
          body  = `This payment of ${tx.currency} ${Number(tx.amount).toFixed(2)} was due ${Math.abs(daysLeft)} day${Math.abs(daysLeft) !== 1 ? 's' : ''} ago.`
        } else if (daysLeft === 0) {
          title = `Due today: ${tx.description || 'Payment'}`
          body  = `Payment of ${tx.currency} ${Number(tx.amount).toFixed(2)} is due today.`
        } else {
          title = `Upcoming: ${tx.description || 'Payment'}`
          body  = `Payment of ${tx.currency} ${Number(tx.amount).toFixed(2)} is due in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}.`
        }

        return {
          user_id:            userId,
          ref_transaction_id: tx.id,
          title,
          body,
          is_read:            false,
        }
      })

      // 4. Upsert — conflict on (user_id, ref_transaction_id) → silently skip duplicates.
      //    This makes the hook completely idempotent: safe to call on every page load.
      if (!cancelled) {
        await supabase
          .from('notifications')
          .upsert(notifications, {
            onConflict:       'user_id,ref_transaction_id',
            ignoreDuplicates: true,
          })
      }
    }

    generate()
    return () => { cancelled = true }
  }, [isAuthLoading, user, businessId]) // eslint-disable-line react-hooks/exhaustive-deps
}
