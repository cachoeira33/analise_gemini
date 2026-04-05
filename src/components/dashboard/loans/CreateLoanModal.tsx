'use client'

import { useState, useMemo, useEffect } from 'react'
import { X, Loader2, HelpCircle, CalendarDays, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { useTranslation } from '@/hooks/useTranslation'
import { parseWhatsAppMessage } from '@/lib/whatsapp/dispatcher'
import { cn } from '@/lib/utils'
import { useAuthUser } from '@/components/providers/AuthUserProvider'

const DEFAULT_TEMPLATE = 'Hello {{customer_name}}, your loan of {{loan_amount}} has been registered!'

interface Customer {
  id: string
  name: string
  phone: string | null
}

interface TeamMember {
  user_id: string
  role: string
  profiles: { full_name: string | null; avatar_url: string | null } | null
}

const EMPTY_FORM = {
  customer_id: '',
  collector_id: '',
  principal_amount: '',
  interest_rate: '',
  interest_type: 'compound' as 'simple' | 'compound',
  total_installments: '',
  frequency: 'monthly' as 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom',
  start_date: new Date().toISOString().split('T')[0],
  custom_due_date: '',
  grace_period_days: '',
  currency: 'BRL',
  late_fee_fixed: '',
  late_fee_daily_pct: '',
  late_fee_flat_daily: '',
}

// ── Tooltip ───────────────────────────────────────────────────────────────────
function Tooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex items-center ml-1 align-middle">
      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
      <span className="pointer-events-none absolute bottom-full left-1/2 z-[100] mb-2 w-56 -translate-x-1/2 rounded-lg border border-border bg-popover px-3 py-2 text-[11px] leading-relaxed text-muted-foreground shadow-lg opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        {text}
      </span>
    </span>
  )
}

// ── Schedule Date Calculator (mirrors RPC INTERVAL logic exactly) ─────────────
// biweekly = 15 days (quinzenal); monthly = calendar month via setMonth
// graceDays: "first payment in N days" — the first installment lands at
// startDate + graceDays, then subsequent at regular frequency intervals.
function getScheduleDates(startDate: string, frequency: string, n: number, graceDays = 0, customEndDate = ''): Date[] {
  if (!startDate || n <= 0 || n > 366) return []
  const base = new Date(startDate + 'T00:00:00')
  if (isNaN(base.getTime())) return []

  // Grace: shift so first installment = startDate + graceDays (strictly days)
  if (graceDays > 0) base.setDate(base.getDate() + Number(graceDays))

  // Custom frequency: generate a single balloon payment on the customEndDate
  if (frequency === 'custom') {
    if (!customEndDate) return []
    const end = new Date(customEndDate + 'T00:00:00')
    if (isNaN(end.getTime())) return []
    return [end]
  }

  const dates: Date[] = []
  // When grace > 0: first installment at base (= start + grace), i.e. offset = 0
  // When no grace: first installment at base + 1*interval (traditional), i.e. offset = 1
  const offset = graceDays > 0 ? 0 : 1
  for (let i = 0; i < n; i++) {
    const idx = i + offset
    let d: Date
    switch (frequency) {
      case 'daily':
        d = new Date(base)
        d.setDate(base.getDate() + idx)
        break
      case 'weekly':
        d = new Date(base)
        d.setDate(base.getDate() + idx * 7)
        break
      case 'biweekly':
        d = new Date(base)
        d.setDate(base.getDate() + idx * 15)
        break
      default: // monthly — calendar-accurate, mirrors INTERVAL '1 month'
        d = new Date(base.getFullYear(), base.getMonth() + idx, base.getDate())
        break
    }
    dates.push(d)
  }
  return dates
}

const PREVIEW_CAP = 10  // max rows shown before "+ N more"
const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function CreateLoanModal({
  onClose,
  onCreated,
  editLoanId,
}: {
  onClose: () => void
  onCreated: () => void
  editLoanId?: string | null
}) {
  const sb = useMemo(() => createClient(), [])
  const { businessId, businessName, accountId } = useTenant()
  const { t } = useTranslation()
  const { user } = useAuthUser()

  const isEditMode = !!editLoanId

  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [loadingEdit, setLoadingEdit] = useState(isEditMode)

  const [customers, setCustomers] = useState<Customer[]>([])
  const [loadingCustomers, setLoadingCustomers] = useState(true)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])

  // ── WhatsApp toggles ──────────────────────────────────────────────────────
  const [sendWhatsApp, setSendWhatsApp] = useState(false)
  const [useDefaultTemplate, setUseDefaultTemplate] = useState(true)
  const [customMessage, setCustomMessage] = useState('')
  const [defaultTemplate, setDefaultTemplate] = useState(DEFAULT_TEMPLATE)

  useEffect(() => {
    if (!businessId) return
    sb.from('customers').select('id, name, phone').eq('business_id', businessId).order('name')
      .then(({ data }) => { if (data) setCustomers(data as Customer[]); setLoadingCustomers(false) })

    // Fetch team members for assignments
    sb.from('business_members')
      .select('user_id, role, profiles(full_name, avatar_url)')
      .eq('business_id', businessId)
      .then(({ data }) => { if (data) setTeamMembers(data as any) })
  }, [businessId, sb])

  // Fetch the account's default WhatsApp loan template
  useEffect(() => {
    if (!accountId) return
    sb.from('accounts')
      .select('whatsapp_loan_template')
      .eq('id', accountId)
      .single()
      .then(({ data }) => {
        if (data?.whatsapp_loan_template) setDefaultTemplate(data.whatsapp_loan_template)
      })
  }, [accountId, sb])

  // ── Pre-populate form when editing an existing loan ────────────────────────
  useEffect(() => {
    if (!editLoanId) return
    setLoadingEdit(true)
    sb.from('loans')
      .select('customer_id, collector_id, principal_amount, interest_rate, interest_type, total_installments, frequency, start_date, custom_due_date, grace_period_days, currency, late_fee_fixed, late_fee_daily_pct, late_fee_flat_daily')
      .eq('id', editLoanId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setForm({
            customer_id: (data.customer_id as string) ?? '',
            collector_id: (data.collector_id as string) ?? '',
            principal_amount: String(data.principal_amount ?? ''),
            interest_rate: String(data.interest_rate ?? ''),
            interest_type: (data.interest_type as 'simple' | 'compound') ?? 'compound',
            total_installments: String(data.total_installments ?? ''),
            frequency: (data.frequency as typeof EMPTY_FORM['frequency']) ?? 'monthly',
            start_date: (data.start_date as string) ?? new Date().toISOString().split('T')[0],
            custom_due_date: (data.custom_due_date as string) ?? '',
            grace_period_days: String(data.grace_period_days ?? ''),
            currency: (data.currency as string) ?? 'BRL',
            late_fee_fixed: String(data.late_fee_fixed ?? ''),
            late_fee_daily_pct: String(data.late_fee_daily_pct ?? ''),
            late_fee_flat_daily: String(data.late_fee_flat_daily ?? ''),
          })
          setTermsAccepted(true)  // pre-accept for edits
        }
        setLoadingEdit(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editLoanId])

  // ── Financial Simulator ────────────────────────────────────────────────────
  const p = parseFloat(form.principal_amount) || 0
  const r = parseFloat(form.interest_rate) / 100 || 0
  const n = parseInt(form.total_installments, 10) || 0

  let simPmt = 0, simTotal = 0, simInterest = 0
  if (p > 0 && n > 0 && r >= 0) {
    if (form.interest_type === 'compound') {
      if (r === 0) { simTotal = p; simPmt = p / n }
      else {
        const factor = Math.pow(1 + r, n)
        simPmt = (p * r * factor) / (factor - 1)
        simTotal = simPmt * n
      }
    } else {
      // FLAT RATE (street lending): Total = P * (1 + rate), PMT = Total / n
      // Test: 500 * (1 + 0.50) / 4 = 187.50 ✓
      simTotal = p * (1 + r)
      simPmt = simTotal / n
    }
    simInterest = simTotal - p
  }

  // ── Live Schedule Preview (mirrors RPC exactly) ────────────────────────────
  const graceDays = parseInt(form.grace_period_days, 10) || 0
  const schedDates = useMemo(
    () => getScheduleDates(form.start_date, form.frequency, form.frequency === 'custom' ? 1 : n, graceDays, form.custom_due_date),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form.start_date, form.frequency, n, graceDays, form.custom_due_date]
  )

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!businessId) return
    if (!form.principal_amount || !form.total_installments || !form.interest_rate) {
      return toast.error(t('loans.error_create'))
    }
    if (form.frequency === 'custom' && !form.custom_due_date) {
      return toast.error(t('loans.frequency_custom_due_date') + ' é obrigatório')
    }
    setSaving(true)
    try {
      // Grace period: "first payment in N days". We want the RPC's
      // inst #1 (= start_date + 1*interval) to land at originalStart + graceDays.
      // So we offset start_date back by one interval: effectiveStart + 1*interval = original + grace.
      let effectiveStartDate = form.start_date
      if (graceDays > 0) {
        const d = new Date(form.start_date + 'T00:00:00')
        d.setDate(d.getDate() + Number(graceDays))
        // Subtract one frequency interval so RPC's (start + 1*interval) = original + grace
        switch (form.frequency) {
          case 'daily': d.setDate(d.getDate() - 1); break
          case 'weekly': d.setDate(d.getDate() - 7); break
          case 'biweekly': d.setDate(d.getDate() - 15); break
          default: d.setMonth(d.getMonth() - 1); break // monthly
        }
        effectiveStartDate = d.toISOString().split('T')[0]
      }

      const { data: loan, error: loanErr } = await sb
        .from('loans')
        .insert({
          business_id: businessId,
          customer_id: form.customer_id || null,
          collector_id: form.collector_id || null,
          principal_amount: p,
          interest_rate: parseFloat(form.interest_rate) || 0,
          interest_type: form.interest_type,
          total_installments: n,
          frequency: form.frequency,
          start_date: effectiveStartDate,
          late_fee_fixed: parseFloat(form.late_fee_fixed) || 0,
          late_fee_daily_pct: parseFloat(form.late_fee_daily_pct) || 0,
          late_fee_flat_daily: parseFloat(form.late_fee_flat_daily) || 0,
          currency: form.currency || 'BRL',
          custom_due_date: form.frequency === 'custom' && form.custom_due_date ? form.custom_due_date : null,
          status: 'active',
        })
        .select()
        .single()

      if (loanErr) throw loanErr

      const { error: rpcErr } = await sb.rpc('generate_loan_installments', { p_loan_id: loan.id })
      if (rpcErr) throw rpcErr

      toast.success(t('loans.created'))

      // Best-effort: sync loan disbursement as an expense transaction
      if (accountId && user?.id) {
        const custName = customers.find(c => c.id === form.customer_id)?.name ?? null
        void Promise.resolve(sb.from('transactions').insert({
          account_id: accountId,
          business_id: businessId!,
          amount: p,
          type: 'expense' as const,
          description: custName ? `Loan disbursement — ${custName}` : 'Loan disbursement',
          currency: form.currency || 'BRL',
          customer_id: form.customer_id || null,
          created_by: user.id,
          kanban_status: 'paid' as const,
          purchase_date: effectiveStartDate,
          metadata: { loan_id: loan.id, source: 'loan_disbursement' },
        })).catch(() => {/* non-blocking */ })
      }

      // Fire-and-forget audit log (non-blocking)
      fetch('/api/loans/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_type: 'LOAN_CREATED',
          loan_id: loan.id,
          business_id: businessId,
        }),
      }).catch(() => { /* best-effort */ })

      // ── WhatsApp notification — awaited to prevent browser abort ───────
      console.log('[UI] WhatsApp Toggle State:', sendWhatsApp)
      if (sendWhatsApp) {
        const selectedCustomer = customers.find(c => c.id === form.customer_id)
        const phone = selectedCustomer?.phone ?? ''

        if (phone) {
          const rawTemplate = useDefaultTemplate ? defaultTemplate : customMessage
          const customerName = selectedCustomer?.name ?? ''
          const loanAmountStr = `${p.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
          const parsedMessage = parseWhatsAppMessage(rawTemplate, customerName, loanAmountStr)

          console.log('[UI] Sending WhatsApp Payload:', parsedMessage)

          try {
            const res = await fetch('/api/whatsapp/send', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ phone, message: parsedMessage, businessId, businessName }),
            })
            const json = await res.json()
            if (json.ok) toast.success(t('loans.whatsapp.send_success'))
            else toast.warning(t('loans.whatsapp.send_failed'))
          } catch {
            toast.warning(t('loans.whatsapp.send_failed'))
          }
        }
      }

      onCreated()
      onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('loans.error_create'))
      setSaving(false)
    }
  }

  // ── Update existing loan ───────────────────────────────────────────────────
  async function handleUpdate() {
    if (!editLoanId || !businessId) return
    setSaving(true)
    try {
      const { error: updateErr } = await sb.from('loans').update({
        customer_id: form.customer_id || null,
        collector_id: form.collector_id || null,
        principal_amount: p,
        interest_rate: parseFloat(form.interest_rate) || 0,
        interest_type: form.interest_type,
        total_installments: n,
        frequency: form.frequency,
        start_date: form.start_date,
        late_fee_fixed: parseFloat(form.late_fee_fixed) || 0,
        late_fee_daily_pct: parseFloat(form.late_fee_daily_pct) || 0,
        late_fee_flat_daily: parseFloat(form.late_fee_flat_daily) || 0,
        currency: form.currency || 'BRL',
        custom_due_date: form.frequency === 'custom' && form.custom_due_date ? form.custom_due_date : null,
      }).eq('id', editLoanId)

      if (updateErr) throw updateErr

      // Cancel all pending installments and regenerate with new schedule
      await sb.from('loan_installments')
        .update({ status: 'cancelled' })
        .eq('loan_id', editLoanId)
        .in('status', ['pending'])

      const { error: rpcErr } = await sb.rpc('generate_loan_installments', { p_loan_id: editLoanId })
      if (rpcErr) throw rpcErr

      if (user && businessId) {
        await sb.from('audit_logs').insert({
          business_id: businessId, user_id: user.id,
          action: 'LOAN_EDITED', entity_type: 'loan', entity_id: editLoanId,
          new_values: { interest_rate: form.interest_rate, frequency: form.frequency, principal_amount: p },
        })
      }

      toast.success(t('loans.edit_loan_success'))
      onCreated()
      onClose()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('loans.error_create'))
      setSaving(false)
    }
  }

  const inputCls = "w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-popover ring-1 ring-border rounded-2xl shadow-2xl p-6 relative max-h-[90vh] overflow-y-auto flex flex-col md:flex-row gap-6">
        <button onClick={onClose} className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors z-10">
          <X className="h-5 w-5" />
        </button>

        {/* ── Form ── */}
        <div className="flex-1 space-y-4">
          <h3 className="text-lg font-bold text-foreground mb-2">
            {isEditMode ? t('loans.modal_edit_title') : t('loans.modal_create_title')}
          </h3>

          {/* Edit mode warning */}
          {isEditMode && (
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/8 px-3 py-2.5 mb-3">
              <span className="text-amber-500 shrink-0 mt-0.5">⚠</span>
              <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
                {t('loans.edit_loan_warning')}
              </p>
            </div>
          )}

          {loadingEdit && (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          )}

          {/* Customer & Collector */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">{t('loans.customer_label')}</label>
              <select value={form.customer_id} onChange={e => setForm(f => ({ ...f, customer_id: e.target.value }))} className={inputCls} disabled={loadingCustomers}>
                <option value="">-- {t('loans.customer_anonymous')} --</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">{t('loans.collector_label')}</label>
              <select value={form.collector_id} onChange={e => setForm(f => ({ ...f, collector_id: e.target.value }))} className={inputCls}>
                <option value="">-- {t('loans.unassigned_collector') || 'Unassigned'} --</option>
                {teamMembers.map(m => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.profiles?.full_name || 'Unknown User'} ({m.role})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Principal + Rate */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">{t('loans.principal_label')} *</label>
              <input type="number" step="0.01" min="0" required value={form.principal_amount}
                onChange={e => setForm(f => ({ ...f, principal_amount: e.target.value }))}
                placeholder={t('loans.principal_placeholder')} className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">{t('loans.rate_label')} *</label>
              <input type="number" step="0.01" min="0" required value={form.interest_rate}
                onChange={e => setForm(f => ({ ...f, interest_rate: e.target.value }))}
                placeholder={t('loans.rate_placeholder')} className={inputCls} />
            </div>
          </div>

          {/* ── Number of Installments (no more "Duration / Months" confusion) + Interest Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">{t('loans.duration_label')} *</label>
              <input type="number" step="1" min="1" required
                value={form.frequency === 'custom' ? '1' : form.total_installments}
                disabled={form.frequency === 'custom'}
                onChange={e => setForm(f => ({ ...f, total_installments: e.target.value }))}
                placeholder={t('loans.duration_placeholder')} className={cn(inputCls, form.frequency === 'custom' && "opacity-50 cursor-not-allowed")} />
            </div>
            <div>
              <label className="flex items-center text-sm font-medium text-foreground mb-1.5">
                {t('loans.type_label')} *
                <Tooltip text={form.interest_type === 'compound'
                  ? t('loans.tooltip_compound_interest')
                  : t('loans.tooltip_simple_interest')} />
              </label>
              <select value={form.interest_type}
                onChange={e => setForm(f => ({ ...f, interest_type: e.target.value as 'simple' | 'compound' }))}
                className={inputCls}>
                <option value="compound">{t('loans.type_compound')}</option>
                <option value="simple">{t('loans.type_simple')}</option>
              </select>
            </div>
          </div>

          {/* ── Frequency + Start Date — placed together for schedule clarity */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">{t('loans.frequency_label')} *</label>
              <select value={form.frequency}
                onChange={e => setForm(f => ({ ...f, frequency: e.target.value as typeof form.frequency, custom_due_date: '' }))}
                className={inputCls}>
                <option value="daily">{t('loans.frequency_daily')}</option>
                <option value="weekly">{t('loans.frequency_weekly')}</option>
                <option value="biweekly">{t('loans.frequency_biweekly')}</option>
                <option value="monthly">{t('loans.frequency_monthly')}</option>
                <option value="custom">{t('loans.frequency_custom')}</option>
              </select>
            </div>
            <div>
              <label className="flex items-center gap-1 text-sm font-medium text-foreground mb-1.5">
                <CalendarDays className="h-3.5 w-3.5 text-muted-foreground/60" />
                {t('loans.start_date_label')} *
              </label>
              <input type="date" required value={form.start_date}
                onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                className={inputCls} />
            </div>
          </div>

          {/* ── Custom Due Date (shown only when frequency = custom) ── */}
          {form.frequency === 'custom' && (
            <div>
              <label className="flex items-center gap-1 text-sm font-medium text-foreground mb-1.5">
                <CalendarDays className="h-3.5 w-3.5 text-rose-500/80" />
                {t('loans.frequency_custom_due_date')} *
                <Tooltip text={t('loans.tooltip_custom_due_date')} />
              </label>
              <input
                type="date"
                required
                value={form.custom_due_date}
                min={form.start_date}
                onChange={e => setForm(f => ({ ...f, custom_due_date: e.target.value }))}
                className={inputCls}
              />
            </div>
          )}

          {/* ── Currency ── */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              {t('loans.currency_label')}
            </label>
            <select
              value={form.currency}
              onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
              className={inputCls}
            >
              <option value="BRL">BRL — Real Brasileiro (R$)</option>
              <option value="USD">USD — US Dollar ($)</option>
              <option value="PYG">PYG — Guaraní Paraguayo (₲)</option>
              <option value="GBP">GBP — British Pound (£)</option>
              <option value="EUR">EUR — Euro (€)</option>
            </select>
          </div>

          {/* ── Grace Period ── */}
          <div>
            <label className="flex items-center text-sm font-medium text-foreground mb-1.5">
              {t('loans.grace_period_label')}
              <Tooltip text={t('loans.tooltip_grace_period')} />
            </label>
            <input
              type="number"
              step="1"
              min="0"
              value={form.grace_period_days}
              onChange={e => setForm(f => ({ ...f, grace_period_days: e.target.value }))}
              placeholder={t('loans.grace_period_placeholder')}
              className={inputCls}
            />
          </div>

          {/* ── Late Fee Configuration ── */}
          <div className="pt-4 border-t border-border mt-2">
            <h4 className="text-sm font-semibold text-foreground mb-3">{t('loans.late_fee_config_title')}</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Fixed Penalty (Multa) */}
              <div>
                <label className="flex items-center text-[13px] font-medium text-foreground mb-1">
                  {t('loans.late_fee_fixed_label')}
                  <Tooltip text={t('loans.tooltip_fixed_fee')} />
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <input type="number" step="0.01" min="0" value={form.late_fee_fixed}
                    onChange={e => setForm(f => ({ ...f, late_fee_fixed: e.target.value }))}
                    placeholder="0.00"
                    className={`${inputCls} pl-7`} />
                </div>
              </div>

              {/* Daily % (Mora) */}
              <div>
                <label className="flex items-center text-[13px] font-medium text-foreground mb-1">
                  {t('loans.late_fee_daily_pct_label')}
                  <Tooltip text={t('loans.tooltip_daily_pct')} />
                </label>
                <div className="relative">
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                  <input type="number" step="0.01" min="0" value={form.late_fee_daily_pct}
                    onChange={e => setForm(f => ({ ...f, late_fee_daily_pct: e.target.value }))}
                    placeholder="0.00"
                    className={`${inputCls} pr-7`} />
                </div>
              </div>

              {/* Flat Daily Late Fee */}
              <div>
                <label className="flex items-center text-[13px] font-medium text-foreground mb-1">
                  {t('loans.late_fee_flat_daily_label')}
                  <Tooltip text={t('loans.tooltip_flat_daily_fee')} />
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                  <input type="number" step="0.01" min="0" value={form.late_fee_flat_daily}
                    onChange={e => setForm(f => ({ ...f, late_fee_flat_daily: e.target.value }))}
                    placeholder="0.00"
                    className={`${inputCls} pl-7`} />
                </div>
              </div>
            </div>
          </div>

          {/* ── WhatsApp Notification ── */}
          <div className="pt-4 border-t border-border mt-2 space-y-3">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-emerald-500" />
              {t('loans.whatsapp.section_title')}
            </h4>

            {/* Toggle 1: Send notification */}
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={sendWhatsApp}
                onChange={e => setSendWhatsApp(e.target.checked)}
                className="h-4 w-4 rounded border border-border bg-background accent-emerald-500 cursor-pointer"
              />
              <span className="text-sm text-foreground">{t('loans.whatsapp.toggle_send')}</span>
            </label>

            {sendWhatsApp && (
              <div className="pl-6 space-y-3">
                {/* No phone warning */}
                {form.customer_id && !customers.find(c => c.id === form.customer_id)?.phone && (
                  <p className="text-xs text-amber-400 flex items-center gap-1.5">
                    <MessageCircle className="h-3.5 w-3.5 shrink-0" />
                    {t('loans.whatsapp.no_phone_warning')}
                  </p>
                )}

                {/* Toggle 2: Use default template */}
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useDefaultTemplate}
                    onChange={e => setUseDefaultTemplate(e.target.checked)}
                    className="h-4 w-4 rounded border border-border bg-background accent-indigo-500 cursor-pointer"
                  />
                  <span className="text-sm text-foreground">{t('loans.whatsapp.toggle_default')}</span>
                </label>

                {useDefaultTemplate ? (
                  /* Read-only preview of default template */
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">{t('loans.whatsapp.preview_label')}</p>
                    <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap">
                      {defaultTemplate}
                    </div>
                  </div>
                ) : (
                  /* Custom one-off message */
                  <div>
                    <label className="block text-xs font-medium text-foreground mb-1">
                      {t('loans.whatsapp.textarea_label')}
                    </label>
                    <textarea
                      rows={3}
                      value={customMessage}
                      onChange={e => setCustomMessage(e.target.value)}
                      placeholder={t('loans.whatsapp.textarea_placeholder')}
                      className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground/70">
                      {t('loans.whatsapp.variables_hint')}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Terms Checkbox */}
          <div className="pt-2">
            <label className="flex items-start gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={e => setTermsAccepted(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border border-border bg-background accent-indigo-500 cursor-pointer"
              />
              <span className="text-[11px] text-muted-foreground leading-relaxed group-hover:text-foreground transition-colors">
                {t('loans.terms_confirm')} {' '}
                <a href="/terms" target="_blank" rel="noreferrer" className="underline text-indigo-400 hover:text-indigo-300">
                  {t('loans.terms_link')}
                </a>.
              </span>
            </label>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-4 border-t border-border mt-6">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors border border-border">
              {t('loans.cancel_btn')}
            </button>
            <button onClick={isEditMode ? handleUpdate : handleSave} disabled={saving || !p || !n || !termsAccepted}
              className="flex-1 btn-primary gap-2 px-4 py-2 text-sm">
              {saving ? <><Loader2 className="h-4 w-4 animate-spin" />{t('loans.saving')}</> : isEditMode ? t('loans.edit_loan_save_btn') : t('loans.save_btn')}
            </button>
          </div>
        </div>

        {/* ── Simulator + Schedule Preview ── */}
        <div className="w-full md:w-64 bg-primary/5 border border-primary/20 rounded-xl p-5 flex flex-col gap-5 pt-10 md:pt-5">
          <h4 className="text-sm font-bold text-primary uppercase tracking-wider">{t('loans.sim_title')}</h4>

          {/* Financial summary */}
          <div className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-1">{t('loans.sim_monthly')}</p>
              <p className="text-3xl font-bold text-foreground">${fmt(simPmt)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-1">{t('loans.sim_total')}</p>
              <p className="text-xl font-semibold text-foreground">${fmt(simTotal)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium mb-1">{t('loans.sim_total_interest')}</p>
              <p className="text-lg font-medium text-rose-500">+${fmt(simInterest)}</p>
            </div>
          </div>

          {/* ── Live Schedule Preview ───────────────────────────────────────── */}
          <div className="border-t border-primary/10 pt-4">
            <p className="text-xs font-bold text-primary uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              {t('loans.schedule_preview_title')}
            </p>

            {schedDates.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/60 italic leading-relaxed">
                {t('loans.schedule_preview_empty')}
              </p>
            ) : (
              <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
                {schedDates.slice(0, PREVIEW_CAP).map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px] py-0.5">
                    <span className="text-muted-foreground font-medium shrink-0 w-6">#{i + 1}</span>
                    <span className="font-semibold text-foreground">
                      {d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                    <span className="text-primary font-bold shrink-0">${fmt(simPmt)}</span>
                  </div>
                ))}
                {schedDates.length > PREVIEW_CAP && (
                  <p className="text-[10px] text-muted-foreground/70 text-center pt-1.5">
                    +{schedDates.length - PREVIEW_CAP} {t('loans.schedule_preview_more')}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Formula note */}
          <div className="mt-auto pt-3 border-t border-primary/10">
            <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
              {form.interest_type === 'compound'
                ? t('loans.amortization_french')
                : t('loans.amortization_flat')}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
