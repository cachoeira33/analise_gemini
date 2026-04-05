// =============================================================================
// FeatureGate
// src/components/billing/FeatureGate.tsx
//
// Wraps any content that requires a paid feature.
// Renders children if the feature is available; otherwise renders a paywall
// overlay or a redirect prompt.
//
// Usage:
//   <FeatureGate feature="hiringSimulator" subscription={sub}>
//     <HiringSimulatorPage />
//   </FeatureGate>
//
//   <FeatureGate feature="forecasting" subscription={sub} mode="blur">
//     <ForecastChart />
//   </FeatureGate>
// =============================================================================

'use client'

import React from 'react'
import Link from 'next/link'
import { Lock, Zap, TrendingUp, Users, MapPin, DollarSign, Receipt, Home, Eye, MessageSquare } from 'lucide-react'

import type { SubscriptionState } from '@/hooks/useSubscription'
import { useTranslation } from '@/hooks/useTranslation'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GatedFeature =
  | 'forecasting'
  | 'kanban'
  | 'hiringSimulator'
  | 'whiteLabel'
  | 'shiftControl'
  | 'lending'
  | 'accounting'
  | 'realEstate'
  | 'stealthAuditor'
  | 'whatsapp'

export type GateMode =
  | 'block'    // replace content with paywall card
  | 'blur'     // render blurred content with overlay
  | 'hide'     // render nothing

interface FeatureGateProps {
  feature: GatedFeature
  subscription: SubscriptionState
  children: React.ReactNode
  /** How to display the paywall. Default: 'block' */
  mode?: GateMode
  className?: string
}

// ---------------------------------------------------------------------------
// Feature metadata (for paywall copy)
// ---------------------------------------------------------------------------

interface FeatureMeta {
  label: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  requiredPlan: 'professional' | 'enterprise'
}

const FEATURE_META: Record<GatedFeature, FeatureMeta> = {
  forecasting: {
    label: 'Monte Carlo Forecasting',
    description: 'Run probabilistic revenue and cash flow simulations with p10–p90 confidence bands.',
    icon: TrendingUp,
    requiredPlan: 'professional',
  },
  kanban: {
    label: 'Financial Kanban',
    description: 'Manage transaction approvals and cash flow through a drag-and-drop Kanban board.',
    icon: Zap,
    requiredPlan: 'professional',
  },
  hiringSimulator: {
    label: 'Hiring Cost Simulator',
    description: 'Model the true employer cost of every hire — taxes, benefits, overhead — before committing.',
    icon: Users,
    requiredPlan: 'professional',
  },
  whiteLabel: {
    label: 'White Label',
    description: 'Remove MyVizo branding and present the platform under your own brand.',
    icon: Lock,
    requiredPlan: 'enterprise',
  },
  shiftControl: {
    label: 'Shift Control',
    description: 'Enforce scheduled working hours for employees and track GPS collection points.',
    icon: MapPin,
    requiredPlan: 'enterprise',
  },
  lending: {
    label: 'Street Lending',
    description: 'Dynamic rollovers and flat daily late fees for informal lending.',
    icon: DollarSign,
    requiredPlan: 'professional',
  },
  accounting: {
    label: 'Professional Accounting',
    description: 'P&L, balance sheets, and real-time ledger sync.',
    icon: Receipt,
    requiredPlan: 'professional',
  },
  realEstate: {
    label: 'Real Estate',
    description: 'Track properties, tenants, and rental income.',
    icon: Home,
    requiredPlan: 'professional',
  },
  stealthAuditor: {
    label: 'Stealth Auditor',
    description: 'Track collector locations silently via GPS.',
    icon: Eye,
    requiredPlan: 'professional',
  },
  whatsapp: {
    label: 'WhatsApp Automation',
    description: 'Automated billing reminders in WhatsApp.',
    icon: MessageSquare,
    requiredPlan: 'professional',
  },
}

// ---------------------------------------------------------------------------
// Access check
// ---------------------------------------------------------------------------

function isFeatureEnabled(feature: GatedFeature, sub: SubscriptionState): boolean {
  // Plan-key fallback: professional/enterprise subscriptions that are active or
  // trialing unlock professional-tier features even when Stripe metadata hasn't
  // written active_addons yet (common during trial onboarding).
  const planUnlocks = (minPlan: 'professional' | 'enterprise'): boolean => {
    const statusOk = ['active', 'trialing'].includes(sub.status ?? '')
    if (minPlan === 'enterprise') return statusOk && sub.planKey === 'enterprise'
    return statusOk && ['professional', 'enterprise'].includes(sub.planKey ?? '')
  }

  switch (feature) {
    case 'forecasting':     return sub.forecastingEnabled
    case 'kanban':          return sub.kanbanEnabled
    case 'hiringSimulator': return sub.hiringSimulatorEnabled
    case 'whiteLabel':      return sub.whiteLabelEnabled
    case 'shiftControl':    return sub.shiftControlEnabled
    case 'lending':         return sub.activeAddons.includes('lending')         || planUnlocks('professional')
    case 'accounting':      return sub.activeAddons.includes('accounting')      || planUnlocks('professional')
    case 'realEstate':      return sub.activeAddons.includes('real-estate')     || planUnlocks('professional')
    case 'stealthAuditor':  return sub.activeAddons.includes('stealth-auditor') || planUnlocks('professional')
    case 'whatsapp':        return sub.activeAddons.includes('whatsapp')        || planUnlocks('professional')
  }
}

// ---------------------------------------------------------------------------
// Paywall card
// ---------------------------------------------------------------------------

function PaywallCard({ feature, requiredPlan }: { feature: FeatureMeta; requiredPlan: string }) {
  const { t } = useTranslation()
  const Icon = feature.icon
  const planLabel = requiredPlan === 'enterprise'
    ? t('feature_gate.plan_enterprise')
    : t('feature_gate.plan_professional')

  return (
    <div className="flex flex-col items-center justify-center gap-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-8 py-12 text-center dark:border-slate-700 dark:bg-slate-900">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-violet-100 text-violet-600 dark:bg-violet-900 dark:text-violet-300">
        <Icon className="h-7 w-7" />
      </div>

      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          {feature.label}
        </h3>
        <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">
          {feature.description}
        </p>
      </div>

      <div className="flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-violet-700 dark:bg-violet-900/60 dark:text-violet-300">
        <Lock className="h-3 w-3" />
        {t('feature_gate.requires_plan').replace('{plan}', planLabel)}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          href="/dashboard/billing"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-violet-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"
        >
          <Zap className="h-4 w-4" />
          {t('feature_gate.upgrade_to').replace('{plan}', planLabel)}
        </Link>
        <Link
          href="/dashboard/billing"
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-transparent dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {t('feature_gate.view_plans')}
        </Link>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function FeatureGate({
  feature,
  subscription,
  children,
  mode = 'block',
  className,
}: FeatureGateProps) {
  // While loading, render children optimistically to avoid layout flash.
  // Once loaded, gates will apply.
  if (subscription.isLoading) {
    return <>{children}</>
  }

  const enabled = isFeatureEnabled(feature, subscription)
  if (enabled) return <>{children}</>

  const meta = FEATURE_META[feature]

  if (mode === 'hide') return null

  if (mode === 'blur') {
    return (
      <div className={cn('relative', className)}>
        {/* Blurred content */}
        <div className="pointer-events-none select-none blur-sm" aria-hidden>
          {children}
        </div>
        {/* Overlay */}
        <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-[2px] dark:bg-slate-950/60">
          <PaywallCard feature={meta} requiredPlan={meta.requiredPlan} />
        </div>
      </div>
    )
  }

  // Default: 'block'
  return (
    <div className={className}>
      <PaywallCard feature={meta} requiredPlan={meta.requiredPlan} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Inline gate (for small UI elements like buttons)
// ---------------------------------------------------------------------------

interface InlineGateProps {
  feature: GatedFeature
  subscription: SubscriptionState
  children: React.ReactNode
  /** What to render in place of children when gated. Default: locked tooltip button */
  fallback?: React.ReactNode
}

export function InlineFeatureGate({ feature, subscription, children, fallback }: InlineGateProps) {
  if (subscription.isLoading) return <>{children}</>

  const enabled = isFeatureEnabled(feature, subscription)
  if (enabled) return <>{children}</>

  if (fallback !== undefined) return <>{fallback}</>

  return (
    <Link
      href="/dashboard/billing"
      title={`Upgrade to unlock ${FEATURE_META[feature].label}`}
      className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:border-violet-300 hover:text-violet-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
    >
      <Lock className="h-3 w-3" />
      Upgrade
    </Link>
  )
}
