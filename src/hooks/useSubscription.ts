'use client'

// Next.js exposes process.env at runtime but @types/node may not be listed
// as a dep — this declaration satisfies TypeScript without installing the package.
declare const process: { env: Record<string, string | undefined> }

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useAuthUser } from '@/components/providers/AuthUserProvider'

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid'
  | 'paused'

export interface SubscriptionState {
  planKey: 'freemium' | 'starter' | 'professional' | 'enterprise'
  status: SubscriptionStatus | null
  // Account shape
  accountType: 'personal' | 'business' | null
  // Limits
  maxBusinesses: number    // 0 = personal (no business), -1 = unlimited
  maxUsers: number
  maxTransactionsMonthly: number    // -1 = unlimited
  // Feature flags (mirrored from subscriptions table booleans)
  forecastingEnabled: boolean
  kanbanEnabled: boolean
  hiringSimulatorEnabled: boolean
  whiteLabelEnabled: boolean
  shiftControlEnabled: boolean
  // ── Plan-tier boolean helpers (derived, not stored in DB) ──────────────────
  isFree:       boolean
  isStarter:    boolean
  isPro:        boolean
  isEnterprise: boolean
  // Business / feature access flags
  canAccessBusiness:  boolean   // plan !== freemium
  canAccessKanban:    boolean   // plan !== freemium OR kanban addon owned
  hasUnlimitedAddons: boolean   // enterprise only
  // Usage limits object (mirrors PLAN_DEFINITIONS)
  usageLimits: {
    invoicesMonthly:    number   // 0=none, -1=unlimited
    signaturesMonthly:  number
  }
  // Dates
  trialEnd: string | null
  currentPeriodEnd: string | null
  // Referral bonus
  bonusDaysRemaining: number    // 0 if no active referral trial
  // Add-ons
  activeAddons: string[]
  // Ad system: 1.0 = full ads, 0.5 = half, 0 = no ads
  adDensity: number
  // Meta
  isLoading: boolean
  error: string | null
}

// ── Plan defaults ────────────────────────────────────────────────────────────

const FREEMIUM_DEFAULTS: Omit<SubscriptionState, 'isLoading' | 'error'> = {
  planKey: 'freemium',
  status: 'active',
  accountType: null,
  maxBusinesses: 1,
  maxUsers: 1,
  maxTransactionsMonthly: 120,       // 120/mo on free tier
  forecastingEnabled: false,
  kanbanEnabled: false,
  hiringSimulatorEnabled: false,
  whiteLabelEnabled: false,
  shiftControlEnabled: false,
  isFree: true, isStarter: false, isPro: false, isEnterprise: false,
  canAccessBusiness: false, canAccessKanban: false, hasUnlimitedAddons: false,
  usageLimits: { invoicesMonthly: 0, signaturesMonthly: 0 },
  trialEnd: null,
  currentPeriodEnd: null,
  bonusDaysRemaining: 0,
  activeAddons: [],
  adDensity: 1.0,       // full ads on free tier
}

const STARTER_DEFAULTS: Omit<SubscriptionState, 'isLoading' | 'error'> = {
  ...FREEMIUM_DEFAULTS,
  planKey: 'starter',
  maxBusinesses: 1,
  maxTransactionsMonthly: -1,        // unlimited entries for lifetime starter
  kanbanEnabled: true,
  isFree: false, isStarter: true, isPro: false, isEnterprise: false,
  canAccessBusiness: true, canAccessKanban: true, hasUnlimitedAddons: false,
  usageLimits: { invoicesMonthly: 3, signaturesMonthly: 3 },
  adDensity: 0.5,       // 50% ads on starter
}

const PRO_DEFAULTS: Omit<SubscriptionState, 'isLoading' | 'error'> = {
  planKey: 'professional',
  status: 'active',
  accountType: null,
  maxBusinesses: 3,
  maxUsers: 3,
  maxTransactionsMonthly: -1,
  forecastingEnabled: true,
  kanbanEnabled: true,
  hiringSimulatorEnabled: false,
  whiteLabelEnabled: false,
  shiftControlEnabled: false,
  isFree: false, isStarter: false, isPro: true, isEnterprise: false,
  canAccessBusiness: true, canAccessKanban: true, hasUnlimitedAddons: false,
  usageLimits: { invoicesMonthly: -1, signaturesMonthly: 10 },
  trialEnd: null,
  currentPeriodEnd: null,
  bonusDaysRemaining: 0,
  activeAddons: [],
  adDensity: 0,         // no ads on paid plans
}

const ENTERPRISE_DEFAULTS: Omit<SubscriptionState, 'isLoading' | 'error'> = {
  planKey: 'enterprise',
  status: 'active',
  accountType: null,
  maxBusinesses: -1,
  maxUsers: -1,
  maxTransactionsMonthly: -1,
  forecastingEnabled: true,
  kanbanEnabled: true,
  hiringSimulatorEnabled: true,
  whiteLabelEnabled: true,
  shiftControlEnabled: true,
  isFree: false, isStarter: false, isPro: false, isEnterprise: true,
  canAccessBusiness: true, canAccessKanban: true, hasUnlimitedAddons: true,
  usageLimits: { invoicesMonthly: -1, signaturesMonthly: -1 },
  trialEnd: null,
  currentPeriodEnd: null,
  bonusDaysRemaining: 0,
  activeAddons: [],
  adDensity: 0,
}

// God Mode: master admin & superadmin always get a fully-unlocked enterprise
// subscription regardless of what is stored in the DB.
const GOD_MODE_DEFAULTS: Omit<SubscriptionState, 'isLoading' | 'error'> = {
  planKey: 'enterprise',
  status: 'active',
  accountType: null,
  maxBusinesses: -1,
  maxUsers: -1,
  maxTransactionsMonthly: -1,
  forecastingEnabled: true,
  kanbanEnabled: true,
  hiringSimulatorEnabled: true,
  whiteLabelEnabled: true,
  isFree: false, isStarter: false, isPro: false, isEnterprise: true,
  canAccessBusiness: true, canAccessKanban: true, hasUnlimitedAddons: true,
  usageLimits: { invoicesMonthly: -1, signaturesMonthly: -1 },
  shiftControlEnabled: true,
  trialEnd: null,
  currentPeriodEnd: null,
  bonusDaysRemaining: 0,
  activeAddons: ['lending', 'accounting', 'real-estate', 'stealth-auditor', 'whatsapp'],
  adDensity: 0,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Read at module scope — avoids `process` not found inside async closures
const MASTER_ADMIN_EMAIL = process.env.NEXT_PUBLIC_MASTER_ADMIN_EMAIL

function makeClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

/** Remaining days until a referral-granted enterprise trial expires. */
function calcBonusDays(referralEnterpriseUntil: string | null | undefined): number {
  if (!referralEnterpriseUntil) return 0
  return Math.max(0, Math.ceil(
    (new Date(referralEnterpriseUntil).getTime() - Date.now()) / 86_400_000,
  ))
}

/** Ad density based on plan tier. */
function calcAdDensity(planKey: string): number {
  if (planKey === 'professional' || planKey === 'enterprise') return 0
  if (planKey === 'starter') return 0.5
  return 1.0   // freemium
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useSubscription(): SubscriptionState {
  const { user, isAuthLoading } = useAuthUser()
  const [state, setState] = useState<SubscriptionState>({
    ...FREEMIUM_DEFAULTS,
    isLoading: true,
    error: null,
  })

  useEffect(() => {
    if (isAuthLoading || !user?.id) return

    let cancelled = false
    const supabase = makeClient()
    const userId = user.id   // capture before async boundary
    const userEmail = user.email

    async function load() {
      try {
        // ── God Mode tier 1: master admin email — bypasses all DB checks ────
        const masterEmail = (process as NodeJS.Process).env.NEXT_PUBLIC_MASTER_ADMIN_EMAIL
        if (masterEmail && userEmail === masterEmail) {
          if (!cancelled) setState({ ...GOD_MODE_DEFAULTS, isLoading: false, error: null })
          return
        }

        // ── Resolve account_id from account_members ──────────────────────
        const { data: members } = await supabase
          .from('account_members')
          .select('account_id')
          .eq('user_id', userId)
          .eq('is_active', true)
          .limit(1)

        const accountId = members?.[0]?.account_id

        if (!accountId) {
          // No account yet (first login race); leave freemium defaults
          if (!cancelled) setState(s => ({ ...s, isLoading: false }))
          return
        }

        // ── God Mode tier 2: superadmin flag in profiles ─────────────────
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_superadmin')
          .eq('id', userId)
          .maybeSingle()

        if (profile?.is_superadmin) {
          if (!cancelled) setState({ ...GOD_MODE_DEFAULTS, isLoading: false, error: null })
          return
        }

        // ── Fetch account metadata + active subscription in parallel ─────
        // Both queries only need accountId, so they can fire simultaneously.
        const [accountRes, subRes] = await Promise.all([
          supabase
            .from('accounts')
            .select('account_type, referral_enterprise_until, subscription_plan')
            .eq('id', accountId)
            .maybeSingle(),
          supabase
            .from('subscriptions')
            .select(`
              plan_key, status,
              max_businesses, max_users, max_transactions_monthly,
              forecasting_enabled, kanban_enabled,
              hiring_simulator_enabled, white_label_enabled,
              shift_control_enabled,
              trial_end, current_period_end,
              metadata
            `)
            .eq('account_id', accountId)
            .in('status', ['active', 'trialing', 'past_due'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ])

        const account = accountRes.data
        const sub     = subRes.data
        const subError = subRes.error

        const accountType        = (account?.account_type ?? null) as 'personal' | 'business' | null
        const bonusDaysRemaining = calcBonusDays(account?.referral_enterprise_until)
        const isPersonal         = accountType === 'personal'

        if (subError || !sub) {
          // No active subscription row — use accounts.subscription_plan as fast-path
          // fallback so users whose plan was written by the Stripe webhook still get
          // the correct feature gates immediately.
          const planFromAccount = (account?.subscription_plan ?? 'freemium') as string

          if (!cancelled) {
            if (planFromAccount === 'enterprise') {
              setState({ ...ENTERPRISE_DEFAULTS, accountType, bonusDaysRemaining, isLoading: false, error: null })
            } else if (planFromAccount === 'professional') {
              setState({ ...PRO_DEFAULTS, accountType, bonusDaysRemaining, isLoading: false, error: null })
            } else if (planFromAccount === 'starter') {
              setState({ ...STARTER_DEFAULTS, accountType, bonusDaysRemaining, isLoading: false, error: null })
            } else {
              setState({
                ...FREEMIUM_DEFAULTS,
                accountType,
                maxBusinesses: isPersonal ? 0 : FREEMIUM_DEFAULTS.maxBusinesses,
                bonusDaysRemaining,
                isLoading: false,
                error: null,
              })
            }
          }
          return
        }

        // ── Build state from subscription row ────────────────────────────
        const planKey = sub.plan_key as SubscriptionState['planKey']

        if (!cancelled) {
          const activeAddons: string[] = (sub.metadata as Record<string, unknown>)?.active_addons as string[] ?? []
          const isFree       = planKey === 'freemium'
          const isStarter    = planKey === 'starter'
          const isPro        = planKey === 'professional'
          const isEnterprise = planKey === 'enterprise'
          setState({
            planKey,
            status: sub.status as SubscriptionStatus,
            accountType,
            // Personal accounts cannot own businesses regardless of plan.
            // Guard against legacy DB rows where max_businesses = 0 for a
            // non-personal user (should be at least 1).
            maxBusinesses: isPersonal ? 0 : (sub.max_businesses === 0 ? 1 : sub.max_businesses),
            maxUsers: sub.max_users,
            maxTransactionsMonthly: sub.max_transactions_monthly,
            forecastingEnabled: sub.forecasting_enabled,
            kanbanEnabled: sub.kanban_enabled,
            hiringSimulatorEnabled: sub.hiring_simulator_enabled,
            whiteLabelEnabled: sub.white_label_enabled,
            shiftControlEnabled: sub.shift_control_enabled ?? false,
            isFree,
            isStarter,
            isPro,
            isEnterprise,
            canAccessBusiness:  !isFree && !isPersonal,
            canAccessKanban:    !isFree || activeAddons.includes('kanban'),
            hasUnlimitedAddons: isEnterprise,
            usageLimits: {
              invoicesMonthly:   isFree ? 0 : isStarter ? 3 : -1,
              signaturesMonthly: isFree ? 0 : isStarter ? 3 : isPro ? 10 : -1,
            },
            trialEnd: sub.trial_end,
            currentPeriodEnd: sub.current_period_end,
            bonusDaysRemaining,
            activeAddons,
            adDensity: calcAdDensity(planKey),
            isLoading: false,
            error: null,
          })
        }
      } catch (err) {
        console.error('[useSubscription] Error loading subscription:', err)
        if (!cancelled) setState(s => ({ ...s, isLoading: false, error: 'Failed to load subscription' }))
      }
    }

    load()
    return () => { cancelled = true }
  }, [isAuthLoading, user])

  return state
}

// ── Convenience helpers ───────────────────────────────────────────────────────

export function canUseForecasting(s: SubscriptionState): boolean { return s.forecastingEnabled }
export function canUseKanban(s: SubscriptionState): boolean { return s.kanbanEnabled || s.activeAddons.includes('kanban') }
// Hiring Simulator: enterprise plan OR professional_accounting add-on only
export function canUseHiringSimulator(s: SubscriptionState): boolean {
  return s.hiringSimulatorEnabled || s.activeAddons.includes('accounting')
}
export function canUseWhiteLabel(s: SubscriptionState): boolean { return s.whiteLabelEnabled }
export function canUseShiftControl(s: SubscriptionState): boolean { return s.shiftControlEnabled }
export function isOnPaidPlan(s: SubscriptionState): boolean { return s.planKey !== 'freemium' }
export function isTrialing(s: SubscriptionState): boolean { return s.status === 'trialing' }
export function isPastDue(s: SubscriptionState): boolean { return s.status === 'past_due' }
export function isPersonalAccount(s: SubscriptionState): boolean { return s.accountType === 'personal' }
export function hasReferralBonus(s: SubscriptionState): boolean { return s.bonusDaysRemaining > 0 }
/** True when user can access an add-on for free (Enterprise) or has it in activeAddons */
export function canAccessAddon(s: SubscriptionState, addonId: string): boolean {
  return s.hasUnlimitedAddons || s.activeAddons.includes(addonId)
}
