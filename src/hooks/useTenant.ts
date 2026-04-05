'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuthUser } from '@/components/providers/AuthUserProvider'

export type AccountType = 'freemium' | 'starter' | 'professional' | 'enterprise'
export type MemberRole  = 'owner' | 'manager' | 'employee'

export interface TenantState {
  accountId:    string | null
  businessId:   string | null
  businessName: string | null
  accountType:  AccountType | null
  currency:     string
  memberRole:   MemberRole | null   // role within the active business
  activeAddons: string[]
  proSlotsUsed: number              // count of is_pro_perk=true active addons
  isLoading:    boolean
}

export function useTenant(): TenantState {
  const { user, isAuthLoading } = useAuthUser()

  const [state, setState] = useState<TenantState>({
    accountId:    null,
    businessId:   null,
    businessName: null,
    accountType:  null,
    currency:     'USD',
    memberRole:   null,
    activeAddons: [],
    proSlotsUsed: 0,
    isLoading:    true,
  })

  useEffect(() => {
    // Wait for auth context to resolve before doing anything
    if (isAuthLoading) return

    // No authenticated user — stop loading immediately
    if (!user) {
      setState(s => ({ ...s, isLoading: false }))
      return
    }

    const userId = user.id   // capture before async boundary — TypeScript narrowing
    let cancelled = false
    const supabase = createClient()

    async function load() {
      // 1. Ensure user is provisioned
      await fetch('/api/setup', { method: 'POST' })

      // 2. Fetch account_id (user already resolved from AuthUserProvider)
      const { data: members } = await supabase
        .from('account_members')
        .select('account_id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .limit(1)

      const accId = members?.[0]?.account_id

      // 3. Fetch account_type (read from subscription_plan for unified state)
      let acctType: AccountType = 'freemium'
      if (accId) {
        const { data: account } = await supabase
          .from('accounts')
          .select('subscription_plan, referral_enterprise_until')
          .eq('id', accId)
          .single()

        const rawType = account?.subscription_plan as string
        if (rawType === 'enterprise')   acctType = 'enterprise'
        else if (rawType === 'professional') acctType = 'professional'
        else if (rawType === 'starter') acctType = 'starter'
        else acctType = 'freemium'

        // Referral trial override — grants enterprise for 14 days
        if (
          account?.referral_enterprise_until &&
          new Date(account.referral_enterprise_until) > new Date()
        ) {
          acctType = 'enterprise'
        }
      }

      // 4. Fetch owned businesses (via account)
      const ownedRes = accId
        ? await supabase
            .from('businesses')
            .select('id, currency, name')
            .eq('account_id', accId)
            .eq('status', 'active')
        : { data: null }

      const ownedIds = new Set((ownedRes.data ?? []).map(b => b.id))
      const ownedBiz = (ownedRes.data ?? []).map(b => ({
        id:       b.id,
        currency: (b.currency as string) ?? 'USD',
        name:     (b.name as string | null) ?? null,
        role:     'owner' as MemberRole,
      }))

      // 5. Fetch employee businesses (via business_members, excluding already-owned)
      type EmpRow = { business_id: string; role: string; businesses: { id: string; currency: string; name: string | null } | null }
      const { data: empRows } = await supabase
        .from('business_members')
        .select('business_id, role, businesses!inner(id, currency, name)')
        .eq('user_id', userId)

      const empBiz = ((empRows ?? []) as unknown as EmpRow[])
        .filter(m => m.businesses !== null && !ownedIds.has(m.business_id))
        .map(m => ({
          id:       m.businesses!.id,
          currency: m.businesses!.currency ?? 'USD',
          name:     m.businesses!.name ?? null,
          role:     m.role as MemberRole,
        }))

      // 6. All accessible businesses
      const allBiz = [...ownedBiz, ...empBiz]

      // 7. Honour localStorage selection; fall back to first
      const stored   = typeof window !== 'undefined' ? localStorage.getItem('selectedBusinessId') : null
      const validIds = allBiz.map(b => b.id)
      const busId    = (stored && validIds.includes(stored)) ? stored : (allBiz[0]?.id ?? null)
      const active   = allBiz.find(b => b.id === busId)

      // 6.5. Fetch addons for the active business
      let activeAddons: string[] = []
      let proSlotsUsed = 0
      if (busId) {
        const { data: addons } = await supabase
          .from('business_addons')
          .select('addon_id, expires_at, is_pro_perk')
          .eq('business_id', busId)

        if (addons) {
          const now = new Date()
          const active = addons.filter(a => !a.expires_at || new Date(a.expires_at) > now)
          activeAddons = active.map(a => a.addon_id)
          proSlotsUsed = active.filter(a => a.is_pro_perk === true).length
        }
      }

      if (!cancelled) {
        setState({
          accountId:    accId ?? null,
          businessId:   busId ?? null,
          businessName: active?.name ?? null,
          accountType:  acctType,
          currency:     active?.currency ?? 'USD',
          memberRole:   active?.role ?? null,
          activeAddons,
          proSlotsUsed,
          isLoading:    false,
        })
      }
    }

    load()
    return () => { cancelled = true }
  }, [isAuthLoading, user])

  return state
}
