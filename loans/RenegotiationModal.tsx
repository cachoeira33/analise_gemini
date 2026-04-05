'use client'

import { useState, useMemo } from 'react'
import {
  X, Loader2, AlertTriangle, RefreshCw, BadgePercent,
  Calendar, Hash, MessageCircle, Check, Clock,
} from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { useAuthUser } from '@/components/providers/AuthUserProvider'
import { useTranslation } from '@/hooks/useTranslation'
import { cn } from '@/lib/utils'

interface Installment {
  id: string
  installment_number: number
  due_date: string
  expected_amount: number
  paid_amount: number
  status: 'pending' | 'partial' | 'paid' | 'overdue' | 'cancelled'
}

interface LoanConfig {
  late_fee_fixed: number
  late_fee_daily_pct: number
  late_fee_flat_daily: number
  is_interest_frozen?: boolean
  currency?: string
  frequency?: string
}

interface Settlement {
  originalRemaining: number
  totalFixed: number
  totalMora: number
  totalFlatMora: number
  totalPenalties: number
  total: number
}

const fmt = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const todayISO = () => new Date().toISOString().split('T')[0]

// ── Settlement engine — retroactive: uses asOfDate instead of today ───────────
function calcSettlement(
  insts: Installment[],
  config: LoanConfig,
  asOfDate?: string,   // ISO YYYY-MM-DD
): Settlement {
  const ref = new Date((asOfDate ?? todayISO()) + 'T00:00:00')
  const MS_PER_DAY = 86_400_000

  let originalRemaining = 0, totalFixed = 0, totalMora = 0, totalFlatMora = 0

  for (const inst of insts) {
    if (inst.status === 'paid' || inst.status === 'cancelled') continue
    const remaining = Math.max(0, Number(inst.expected_amount) - Number(inst.paid_amount))
    if (remaining === 0) continue

    originalRemaining += remaining

    if (!config.is_interest_frozen) {
      const due = new Date(inst.due_date + 'T00:00:00')
      const daysOverdue = Math.max(0, Math.floor((ref.getTime() - due.getTime()) / MS_PER_DAY))
      if (daysOverdue > 0) {
        totalFixed    += Number(config.late_fee_fixed) || 0
        totalMora     += remaining * ((Number(config.late_fee_daily_pct) || 0) / 100) * daysOverdue
        totalFlatMora += (Number(config.late_fee_flat_daily) || 0) * daysOverdue
      }
    }
  }

  const totalPenalties = totalFixed + totalMora + totalFlatMora
  return {
    originalRemaining,
    totalFixed,
    totalMora,
    totalFlatMora,
    totalPenalties,
    total: originalRemaining + totalPenalties,
  }
}

// ── Generate N due dates from a starting date, spaced by frequency ────────────
function buildDueDates(firstISO: string, n: number, frequency: string): string[] {
  if (!firstISO || n <= 0) return []
  const dates: string[] = []
  const base = new Date(firstISO + 'T00:00:00')
  for (let i = 0; i < n; i++) {
    const d = new Date(base)
    switch (frequency) {
      case 'daily':    d.setDate(base.getDate() + i); break
      case 'weekly':   d.setDate(base.getDate() + i * 7); break
      case 'biweekly': d.setDate(base.getDate() + i * 14); break
      case 'monthly':
      default:
        d.setMonth(base.getMonth() + i)
        break
    }
    dates.push(d.toISOString().split('T')[0])
  }
  return dates
}

const defaultFirstDueDate = () => {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().split('T')[0]
}

export function RenegotiationModal({
  loanId,
  customerName,
  customerPhone,
  installments,
  loanConfig,
  onClose,
  onComplete,
}: {
  loanId: string
  customerName: string
  customerPhone?: string | null
  installments: Installment[]
  loanConfig: LoanConfig
  onClose: () => void
  onComplete: () => void
}) {
  const sb = useMemo(() => createClient(), [])
  const { businessId } = useTenant()
  const { user } = useAuthUser()
  const { t } = useTranslation()

  // ── Renegotiation state ─────────────────────────────────────────────────────
  const [forgivePenalties,     setForgivePenalties]     = useState(false)
  const [newInstallmentsCount, setNewInstallmentsCount] = useState('1')
  const [newInterestRate,      setNewInterestRate]      = useState('0')
  const [firstDueDate,         setFirstDueDate]         = useState(defaultFirstDueDate)
  // Issue B: lender can change frequency for the new schedule
  const [newFrequency,         setNewFrequency]         = useState(loanConfig.frequency ?? 'monthly')
  // Issue C: retroactive date — settlement is computed as of this date
  const [renegoDate,           setRenegoDate]           = useState(todayISO)
  const [saving,               setSaving]               = useState(false)
  const [proposalCopied,       setProposalCopied]       = useState(false)

  const ccySymbol = loanConfig.currency ?? 'BRL'

  const activeInstallments = installments.filter(
    i => i.status === 'pending' || i.status === 'partial' || i.status === 'overdue'
  )

  // Settlement recomputed as of the chosen renegotiation date (Issue C)
  const settlement = useMemo(
    () => calcSettlement(installments, loanConfig, renegoDate),
    [installments, loanConfig, renegoDate]
  )

  // ── Derived values ──────────────────────────────────────────────────────────
  const settlementBase = useMemo(
    () => settlement.originalRemaining + (forgivePenalties ? 0 : settlement.totalPenalties),
    [settlement, forgivePenalties]
  )

  const n    = Math.max(1, parseInt(newInstallmentsCount) || 1)
  const rate = Math.max(0, parseFloat(newInterestRate) || 0)

  // ── ISSUE A: Flat rate on total base — interest = base × rate% (regardless of n) ──
  // Old (WRONG): base × (1 + rate/100 × n)  → rate compounds with installments
  // New (CORRECT): base × (1 + rate/100)    → rate applied once to the total base
  const totalInterest     = settlementBase * (rate / 100)
  const newTotal          = settlementBase + totalInterest
  const perInstallmentAmt = newTotal / n

  // ── WhatsApp proposal text ──────────────────────────────────────────────────
  const buildProposalText = () => {
    const sym = ccySymbol
    const lines = [
      `*${t('loans.proposal_whatsapp_header')} — ${customerName}*`,
      '',
      `${t('loans.renegotiate_total_owed')}: ${sym}${fmt(settlement.total)}`,
      forgivePenalties && settlement.totalPenalties > 0
        ? `${t('loans.renegotiate_forgive_penalties')}: −${sym}${fmt(settlement.totalPenalties)}`
        : null,
      '',
      `*${t('loans.renegotiate_new_schedule')}*`,
      `${t('loans.renegotiate_base_amount')}: ${sym}${fmt(settlementBase)}`,
      rate > 0
        ? `${t('loans.renegotiate_new_rate')} (${rate}% ${t('loans.proposal_flat_label')}): +${sym}${fmt(totalInterest)}`
        : null,
      `*${t('loans.renegotiate_total_new')}: ${sym}${fmt(newTotal)}*`,
      `${n}× ${sym}${fmt(perInstallmentAmt)} · ${t(`loans.freq_${newFrequency}`)}`,
      `${t('loans.renegotiate_starting')} ${firstDueDate}`,
      '',
      t('loans.proposal_whatsapp_footer'),
    ]
    return lines.filter(l => l !== null).join('\n')
  }

  const handleSendWhatsApp = () => {
    const text = buildProposalText()
    if (customerPhone) {
      // Normalise phone: strip all non-digits
      const digits = customerPhone.replace(/\D/g, '')
      const waUrl  = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
      window.open(waUrl, '_blank', 'noopener,noreferrer')
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(text)
        .then(() => {
          setProposalCopied(true)
          toast.success(t('loans.proposal_copied'))
          setTimeout(() => setProposalCopied(false), 3000)
        })
        .catch(() => toast.error('Clipboard unavailable'))
    }
  }

  // ── Accept & Restructure (DB mutation) ─────────────────────────────────────
  const handleAcceptAndRestructure = async () => {
    if (settlementBase <= 0)  return toast.error(t('loans.error_invalid_amount'))
    if (!firstDueDate)        return toast.error(t('loans.error_invalid_edit'))
    if (!businessId || !user) return

    setSaving(true)

    try {
      // 1. Cancel all active installments
      const activeIds = activeInstallments.map(i => i.id)
      if (activeIds.length > 0) {
        const { error: cancelErr } = await sb
          .from('loan_installments')
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .update({ status: 'cancelled' } as any)
          .in('id', activeIds)
        if (cancelErr) throw cancelErr
      }

      // 2. Build due-date sequence using the new frequency
      const dueDates = buildDueDates(firstDueDate, n, newFrequency)
      const maxNum   = installments.reduce((acc, i) => Math.max(acc, i.installment_number), 0)
      const rows = dueDates.map((dd, idx) => ({
        loan_id:            loanId,
        installment_number: maxNum + 1 + idx,
        due_date:           dd,
        expected_amount:    Math.round(perInstallmentAmt * 100) / 100,
        paid_amount:        0,
        status:             'pending',
      }))

      const { error: insertErr } = await sb.from('loan_installments').insert(rows)
      if (insertErr) throw insertErr

      // 3. Audit log — records the retroactive renegotiation date
      const { error: auditErr } = await sb.from('audit_logs').insert({
        business_id: businessId,
        user_id:     user.id,
        action:      'RENEGOTIATE',
        entity_type: 'loan',
        entity_id:   loanId,
        old_values: {
          cancelled_installments: activeIds.length,
          total_owed_before:      settlement.total,
          settlement_as_of:       renegoDate,
        },
        new_values: {
          new_installments:       n,
          new_interest_rate:      rate,
          new_frequency:          newFrequency,
          new_due_date_first:     firstDueDate,
          per_installment_amount: Math.round(perInstallmentAmt * 100) / 100,
          total_new:              Math.round(newTotal * 100) / 100,
          forgave_penalties:      forgivePenalties,
          renegotiation_date:     renegoDate,
          customer:               customerName,
        },
      })
      if (auditErr) console.error('Audit log failed:', auditErr.message)

      toast.success(t('loans.renegotiate_success').replace('{n}', String(activeIds.length)))
      onComplete()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Renegotiation failed')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-popover ring-1 ring-border rounded-2xl shadow-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border shrink-0">
          <div>
            <h3 className="text-lg font-bold text-foreground">{t('loans.renegotiate_title')}</h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {customerName || t('loans.customer_anonymous')}
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Warning */}
          <div className="flex items-start gap-3 rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
              {t('loans.renegotiate_subtitle')}
              {' '}<strong>{activeInstallments.length}</strong> {t('loans.renegotiate_cancel_notice')}
            </p>
          </div>

          {/* ── Issue C: Renegotiation Date (retroactive) ── */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-1.5">
              <Clock className="h-4 w-4 text-muted-foreground" />
              {t('loans.renegotiate_date_label')}
              <span className="text-[10px] text-muted-foreground font-normal ml-1">
                ({t('loans.renegotiate_date_hint')})
              </span>
            </label>
            <input
              type="date"
              value={renegoDate}
              onChange={e => setRenegoDate(e.target.value || todayISO())}
              max={todayISO()}
              className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Settlement summary (reflects renegoDate) */}
          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-2">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-3">
              {t('loans.renegotiate_total_owed')}
              {renegoDate !== todayISO() && (
                <span className="ml-2 text-amber-500 normal-case">{t('loans.as_of')} {renegoDate}</span>
              )}
            </p>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('loans.acerto_original')}</span>
              <span className="font-semibold text-foreground">{ccySymbol}{fmt(settlement.originalRemaining)}</span>
            </div>
            {settlement.totalFixed > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('loans.acerto_fixed_fees')}</span>
                <span className={cn('font-semibold', forgivePenalties ? 'line-through text-muted-foreground' : 'text-rose-500')}>
                  +{ccySymbol}{fmt(settlement.totalFixed)}
                </span>
              </div>
            )}
            {settlement.totalFlatMora > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('loans.acerto_flat_mora')}</span>
                <span className={cn('font-semibold', forgivePenalties ? 'line-through text-muted-foreground' : 'text-rose-500')}>
                  +{ccySymbol}{fmt(settlement.totalFlatMora)}
                </span>
              </div>
            )}
            {settlement.totalMora > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('loans.acerto_mora')}</span>
                <span className={cn('font-semibold', forgivePenalties ? 'line-through text-muted-foreground' : 'text-rose-500')}>
                  +{ccySymbol}{fmt(settlement.totalMora)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-sm pt-2 border-t border-border">
              <span className="font-bold text-foreground">{t('loans.acerto_total')}</span>
              <span className="font-bold text-amber-600 text-base">{ccySymbol}{fmt(settlement.total)}</span>
            </div>
          </div>

          {/* ── Toggle: Forgive Penalties ── */}
          {settlement.totalPenalties > 0 && (
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/10 px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors">
              <div>
                <p className="text-sm font-medium text-foreground">{t('loans.renegotiate_forgive_penalties')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {ccySymbol}{fmt(settlement.totalPenalties)} {t('loans.renegotiate_forgive_desc')}
                </p>
              </div>
              <div
                className={cn(
                  'relative w-10 h-5 rounded-full transition-colors shrink-0',
                  forgivePenalties ? 'bg-emerald-500' : 'bg-muted-foreground/30'
                )}
                onClick={() => setForgivePenalties(v => !v)}
              >
                <span className={cn(
                  'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                  forgivePenalties && 'translate-x-5'
                )} />
              </div>
            </label>
          )}

          {/* ── Number of New Installments ── */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-1.5">
              <Hash className="h-4 w-4 text-muted-foreground" />
              {t('loans.renegotiate_installments_count')}
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range" min="1" max="60" step="1"
                value={n}
                onChange={e => setNewInstallmentsCount(e.target.value)}
                className="flex-1 accent-primary"
              />
              <span className="w-10 text-center text-sm font-bold text-foreground">{n}</span>
            </div>
          </div>

          {/* ── Issue A: New Interest Rate — FLAT rate on total base ── */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-1.5">
              <BadgePercent className="h-4 w-4 text-muted-foreground" />
              {t('loans.renegotiate_new_rate')}
            </label>
            <div className="relative">
              <input
                type="number" step="0.01" min="0" max="100"
                value={newInterestRate}
                onChange={e => setNewInterestRate(e.target.value)}
                className="w-full rounded-lg border border-border bg-muted/30 pr-8 pl-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
            </div>
            {/* Flat rate explanation hint */}
            <p className="text-[10px] text-muted-foreground mt-1">
              {t('loans.renegotiate_rate_flat_hint', { base: `${ccySymbol}${fmt(settlementBase)}`, interest: `${ccySymbol}${fmt(totalInterest)}` })}
            </p>
          </div>

          {/* ── Issue B: New Frequency dropdown ── */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              {t('loans.frequency_label')}
            </label>
            <select
              value={newFrequency}
              onChange={e => setNewFrequency(e.target.value)}
              className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="daily">{t('loans.frequency_daily')}</option>
              <option value="weekly">{t('loans.frequency_weekly')}</option>
              <option value="biweekly">{t('loans.frequency_biweekly')}</option>
              <option value="monthly">{t('loans.frequency_monthly')}</option>
            </select>
          </div>

          {/* ── First Due Date ── */}
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-foreground mb-1.5">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              {t('loans.renegotiate_first_due')}
            </label>
            <input
              type="date"
              value={firstDueDate}
              onChange={e => setFirstDueDate(e.target.value)}
              className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* ── New schedule preview ── */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-primary/70 mb-2">
              {t('loans.renegotiate_new_schedule')}
            </p>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('loans.renegotiate_base_amount')}</span>
              <span className="font-semibold text-foreground">{ccySymbol}{fmt(settlementBase)}</span>
            </div>
            {rate > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t('loans.renegotiate_interest_total')} ({rate}%)</span>
                <span className="font-semibold text-rose-500">+{ccySymbol}{fmt(totalInterest)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm pt-2 border-t border-border">
              <span className="font-bold text-foreground">{t('loans.renegotiate_per_installment')}</span>
              <span className="font-bold text-primary text-base">{ccySymbol}{fmt(perInstallmentAmt)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t('loans.renegotiate_total_new')}</span>
              <span className="font-semibold text-foreground">{ccySymbol}{fmt(newTotal)}</span>
            </div>
            <p className="text-[11px] text-muted-foreground pt-1">
              {n}× · {t(`loans.freq_${newFrequency}`)} · {t('loans.renegotiate_starting')} {firstDueDate}
            </p>
          </div>

        </div>

        {/* Footer — dual-button flow (Task 2) */}
        <div className="px-6 py-4 border-t border-border shrink-0 space-y-2">
          {/* Row 1: Cancel + Send Proposal */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors border border-border"
            >
              {t('loans.cancel_btn')}
            </button>
            <button
              onClick={handleSendWhatsApp}
              disabled={settlementBase <= 0}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 transition-colors disabled:opacity-40"
            >
              {proposalCopied
                ? <><Check className="h-4 w-4" />{t('loans.proposal_copied_short')}</>
                : <><MessageCircle className="h-4 w-4" />{t('loans.proposal_send_whatsapp')}</>
              }
            </button>
          </div>
          {/* Row 2: Accept & Restructure (primary action — lender clicks only when customer agrees) */}
          <button
            onClick={handleAcceptAndRestructure}
            disabled={saving || activeInstallments.length === 0 || settlementBase <= 0}
            className="w-full btn-primary gap-2 px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {saving
              ? <><Loader2 className="h-4 w-4 animate-spin" />{t('loans.renegotiate_saving')}</>
              : <><RefreshCw className="h-4 w-4" />{t('loans.renegotiate_accept_restructure')}</>
            }
          </button>
          <p className="text-[10px] text-muted-foreground text-center">
            {t('loans.renegotiate_accept_hint')}
          </p>
        </div>

      </div>
    </div>
  )
}
