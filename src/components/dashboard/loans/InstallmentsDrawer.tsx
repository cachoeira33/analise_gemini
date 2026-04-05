'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  X, Loader2, CheckCircle2, AlertCircle, Clock, RefreshCw,
  Pencil, Check, Calculator, RotateCcw, MessageCircle, ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { useTranslation } from '@/hooks/useTranslation'
import { cn } from '@/lib/utils'
import { usePreferencesStore } from '@/lib/stores/usePreferencesStore'
import { formatDateGlobal } from '@/lib/formatDate'
import { computeLoanFinancialBreakdown, getEffectivePaidAmount } from '@/lib/utils/loan-financials'
import { useAuthUser } from '@/components/providers/AuthUserProvider'
import { useSubscription } from '@/hooks/useSubscription'
import { RenegotiationModal } from './RenegotiationModal'

interface PaymentHistoryEntry {
  date: string   // YYYY-MM-DD
  amount: number
  penalty_paid?: number   // Added for penalty tracking
  method?: 'cash' | 'transfer' | 'asset' | 'renewal_fee'
  asset_description?: string
  asset_url?: string | null
  forgiven_principal?: number
  forgiven_penalty?: number
}

interface Installment {
  id: string
  installment_number: number
  due_date: string
  expected_amount: number
  paid_amount: number
  penalty_paid: number
  penalty_waived: number
  penalty_pending: number
  paid_at: string | null
  status: 'pending' | 'partial' | 'paid' | 'overdue' | 'cancelled'
  payment_history: PaymentHistoryEntry[]
}

interface LoanConfig {
  late_fee_fixed: number
  late_fee_daily_pct: number
  late_fee_flat_daily: number
  is_interest_frozen: boolean
  /** ISO 4217 currency code for this loan (GBP, USD, EUR, …) */
  currency: string
  frequency: string
}

interface SettlementRow {
  installmentNumber: number
  remaining: number
  daysOverdue: number
  fixed: number
  mora: number
  flatMora: number
}

interface Settlement {
  originalRemaining: number
  totalFixed: number
  totalMora: number
  totalFlatMora: number
  total: number
  details: SettlementRow[]
}

// ── Stealth GPS ───────────────────────────────────────────────────────────────
function getGPS(): Promise<{ lat: number; lng: number } | null> {
  return new Promise(resolve => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err => { console.log('GPS denied:', err.message); resolve(null) },
      { timeout: 5000, maximumAge: 60_000 }
    )
  })
}

// ── Per-installment retroactive penalty calculator ────────────────────────────
// Used by the receive-payment form to compute the exact penalty due as of the
// user-selected payDate, not today. Pure function — no component state.
// Fully retroactive: payDate can be any past or future date; returns 0 for
// invalid/empty inputs instead of crashing.
function computePenaltyAtDate(inst: Installment, config: LoanConfig, payDateISO: string): number {
  if (config.is_interest_frozen) return 0
  if (!payDateISO || !inst.due_date) return 0
  const payRef = new Date(payDateISO + 'T00:00:00')
  const dueRef = new Date(inst.due_date + 'T00:00:00')
  if (isNaN(payRef.getTime()) || isNaN(dueRef.getTime())) return 0
  const daysLate = Math.max(0, Math.floor((payRef.getTime() - dueRef.getTime()) / 86_400_000))
  if (daysLate === 0) return 0
  const remaining = Math.max(0, Number(inst.expected_amount) - getEffectivePaidAmount(inst))
  // Force numeric coercion — values may arrive as strings from Supabase
  const fixedFee = Number(config.late_fee_fixed) || 0
  const flatDaily = Number(config.late_fee_flat_daily) || 0
  const dailyPct = Number(config.late_fee_daily_pct) || 0
  return (
    fixedFee
    + flatDaily * daysLate
    + remaining * (dailyPct / 100) * daysLate
  )
}

/** Calendar days between two ISO date strings (positive = payDate is after dueDate).
 *  Returns 0 for invalid/empty inputs — never NaN. */
function daysLateFor(dueDateISO: string, payDateISO: string): number {
  if (!dueDateISO || !payDateISO) return 0
  const due = new Date(dueDateISO + 'T00:00:00')
  const pay = new Date(payDateISO + 'T00:00:00')
  if (isNaN(due.getTime()) || isNaN(pay.getTime())) return 0
  return Math.max(0, Math.floor((pay.getTime() - due.getTime()) / 86_400_000))
}

// ── Settlement Engine ─────────────────────────────────────────────────────────
// Optional `asOfDate` allows retroactive calculation (defaults to today).
function calcSettlement(insts: Installment[], config: LoanConfig, asOfDate?: Date): Settlement {
  const ref = asOfDate ? new Date(asOfDate) : new Date()
  ref.setHours(0, 0, 0, 0)
  const MS_PER_DAY = 86_400_000

  let originalRemaining = 0, totalFixed = 0, totalMora = 0, totalFlatMora = 0
  const details: SettlementRow[] = []

  for (const inst of insts) {
    if (inst.status === 'paid' || inst.status === 'cancelled') continue
    const remaining = Math.max(0, Number(inst.expected_amount) - getEffectivePaidAmount(inst))
    if (remaining === 0) continue

    originalRemaining += remaining
    const due = new Date(inst.due_date + 'T00:00:00')
    const daysOverdue = Math.max(0, Math.floor((ref.getTime() - due.getTime()) / MS_PER_DAY))

    let fixed = 0, mora = 0, flatMora = 0
    if (daysOverdue > 0 && !config.is_interest_frozen) {
      if (remaining > 0) {
        // Use Number() + ?? 0 to guard against null/undefined/string values from DB
        fixed = (Number(config.late_fee_fixed) ?? 0)
        mora = remaining * ((Number(config.late_fee_daily_pct) ?? 0) / 100) * daysOverdue
        flatMora = (Number(config.late_fee_flat_daily) ?? 0) * daysOverdue
      }
    }

    totalFixed += fixed
    totalMora += mora
    totalFlatMora += flatMora
    details.push({ installmentNumber: inst.installment_number, remaining, daysOverdue, fixed, mora, flatMora })
  }

  return {
    originalRemaining, totalFixed, totalMora, totalFlatMora,
    total: originalRemaining + totalFixed + totalMora + totalFlatMora,
    details,
  }
}

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const todayISO = () => new Date().toISOString().split('T')[0]

import { useMyShift } from '@/hooks/useMyShift'
import { Lock, Trash2 } from 'lucide-react'

export function InstallmentsDrawer({
  loanId,
  customerName,
  customerPhone,
  onClose,
}: {
  loanId: string
  customerName: string
  customerPhone?: string | null
  onClose: () => void
}) {
  const sb = useMemo(() => createClient(), [])
  const { t } = useTranslation()
  const { memberRole, businessId, businessName, accountId } = useTenant()
  const { user } = useAuthUser()
  const { isOnShift, loading: shiftLoading } = useMyShift()
  const dateFormat = usePreferencesStore(s => s.dateFormat)

  const subscription = useSubscription()
  const isEmployee = memberRole === 'employee'
  const isOffDuty = isEmployee && !isOnShift && !shiftLoading

  const [customerLang, setCustomerLang] = useState<string>('en')
  const [installments, setInstallments] = useState<Installment[]>([])
  const [loading, setLoading] = useState(true)
  const [loanConfig, setLoanConfig] = useState<LoanConfig>({ late_fee_fixed: 0, late_fee_daily_pct: 0, late_fee_flat_daily: 0, is_interest_frozen: false, currency: '', frequency: 'monthly' })
  // Customer ID for linking payments as proper ledger entries
  const [loanCustomerId, setLoanCustomerId] = useState<string | null>(null)

  // ── Receive Payment state ──────────────────────────────────────────────────
  const [receivingId, setReceivingId] = useState<string | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState(todayISO)   // Payment Date override
  const [payMethod, setPayMethod] = useState<'cash' | 'transfer' | 'asset'>('cash')
  const [assetDesc, setAssetDesc] = useState('')
  const [assetFile, setAssetFile] = useState<File | null>(null)
  const [savingPayment, setSavingPayment] = useState(false)
  const [uploading, setUploading] = useState(false)

  // ── Penalty Decision state (per receive-payment session) ──────────────────
  const [penaltyMode, setPenaltyMode] = useState<'full' | 'waived' | 'negotiated' | null>(null)
  const [penaltyNegotiated, setPenaltyNegotiated] = useState('')
  const [carryOverPending, setCarryOverPending] = useState(false)
  /** Pre-computed penalty for the active installment at the current payDate.
   *  Updated reactively so the penalty section always reflects the selected date. */
  const [currentPenalty, setCurrentPenalty] = useState(0)

  // Recompute penalty whenever the open installment or the payment date changes
  useEffect(() => {
    if (!receivingId || !payDate) { setCurrentPenalty(0); return }
    const inst = installments.find(i => i.id === receivingId)
    setCurrentPenalty(inst ? computePenaltyAtDate(inst, loanConfig, payDate) : 0)
  }, [receivingId, payDate, loanConfig, installments])

  // ── Inline Due-Date Override (individual installment) ─────────────────────
  const [dateOverrideId, setDateOverrideId] = useState<string | null>(null)
  const [dateOverrideValue, setDateOverrideValue] = useState('')

  // ── Edit Installment state ─────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null)
  // Schedule edit (pending)
  const [editDueDate, setEditDueDate] = useState('')
  const [editExpected, setEditExpected] = useState('')
  // Payment correction (paid / partial)
  const [editPaidAmount, setEditPaidAmount] = useState('')
  const [editPaidAt, setEditPaidAt] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // ── History Edit state ─────────────────────────────────────────────────────
  const [editingHistoryIdx, setEditingHistoryIdx] = useState<number | null>(null)
  const [historyEditAmount, setHistoryEditAmount] = useState('')
  const [historyEditPenalty, setHistoryEditPenalty] = useState('')
  const [historyEditDate, setHistoryEditDate] = useState('')
  const [historyEditReason, setHistoryEditReason] = useState('')

  // ── Panel state ───────────────────────────────────────────────────────────
  const [showAcerto, setShowAcerto] = useState(false)
  const [showRenegotiate, setShowRenegotiate] = useState(false)

  // ── Renew / Rollover modal ────────────────────────────────────────────────
  const [showRenewModal, setShowRenewModal] = useState(false)
  const [renewingInst, setRenewingInst] = useState<Installment | null>(null)
  const [renewPaidToday, setRenewPaidToday] = useState('')
  const [renewDueDate, setRenewDueDate] = useState('')
  const [renewInterestRate, setRenewInterestRate] = useState('0')
  const [savingRenewal, setSavingRenewal] = useState(false)

  // ── Principal amount (from loans row) ────────────────────────────────────
  // Used strictly for the "Total Lent" metric — avoids inflating with interest.
  const [loanPrincipal, setLoanPrincipal] = useState<number | null>(null)

  // ── Rollover menu state ───────────────────────────────────────────────────
  // Tracks which installment's "Move balance" dropdown is currently open.
  const [rolloverMenuId, setRolloverMenuId] = useState<string | null>(null)

  // ── Accordion: expanded installment IDs ──────────────────────────────────
  // Paid installments start collapsed; all others start expanded.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  // Seed expanded set once installments load: expand non-paid
  useEffect(() => {
    if (installments.length === 0) return
    setExpandedIds((prev: Set<string>) => {
      if (prev.size > 0) return prev  // already seeded
      const ids = new Set<string>()
      installments.forEach((i: Installment) => { if (i.status !== 'paid') ids.add(i.id) })
      return ids
    })
  }, [installments])

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev: Set<string>) => {
      const next = new Set<string>(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Reset penalty decision whenever a different installment's form is opened
  useEffect(() => {
    setPenaltyMode(null)
    setPenaltyNegotiated('')
    setCarryOverPending(false)
  }, [receivingId])

  const fetchInstallments = async () => {
    setLoading(true)
    const { data, error } = await sb
      .from('loan_installments').select('*').eq('loan_id', loanId)
      .order('installment_number', { ascending: true })
    if (error) toast.error(error.message)
    else setInstallments((data || []) as Installment[])
    setLoading(false)
  }

  useEffect(() => {
    fetchInstallments()
    sb.from('loans')
      .select('principal_amount, late_fee_fixed, late_fee_daily_pct, late_fee_flat_daily, is_interest_frozen, currency, frequency, customer_id, customers(preferred_language)')
      .eq('id', loanId).maybeSingle()
      .then(({ data, error }) => {
        if (error) toast.error(`Loan config: ${error.message}`)
        if (data) {
          // principal_amount is the true amount lent — used for "Total Lent" metric
          setLoanPrincipal(data.principal_amount != null ? Number(data.principal_amount) : null)
          // customer_id powers the transaction ledger link
          setLoanCustomerId((data.customer_id as string | null) ?? null)
          // preferred_language for multilingual WhatsApp messages
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const lang = (data.customers as any)?.preferred_language ?? 'en'
          setCustomerLang(lang)
          setLoanConfig({
            // Use explicit null check — ?? 0 keeps a real 0 as 0 (unlike || 0 which coerces NaN too)
            late_fee_fixed: data.late_fee_fixed != null ? Number(data.late_fee_fixed) : 0,
            late_fee_daily_pct: data.late_fee_daily_pct != null ? Number(data.late_fee_daily_pct) : 0,
            late_fee_flat_daily: data.late_fee_flat_daily != null ? Number(data.late_fee_flat_daily) : 0,
            is_interest_frozen: !!data.is_interest_frozen,
            currency: (data.currency as string) ?? 'GBP',
            frequency: (data.frequency as string) ?? 'monthly',
          })
        }
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loanId, sb])

  // ── Start edit — branches on installment status ───────────────────────────
  const startEdit = (inst: Installment) => {
    setEditingId(inst.id)
    setReceivingId(null)
    if (inst.status === 'paid' || inst.status === 'partial') {
      // Payment correction mode
      setEditPaidAmount(String(inst.paid_amount))
      setEditPaidAt(inst.paid_at ? inst.paid_at.split('T')[0] : todayISO())
    } else {
      // Schedule edit mode
      setEditDueDate(inst.due_date)
      setEditExpected(String(inst.expected_amount))
    }
  }

  // ── Receive Payment — Accumulator (no row splitting) ─────────────────────
  const handleReceive = async (inst: Installment) => {
    if (!payAmount) return
    let receivedRemaining = parseFloat(payAmount)
    if (receivedRemaining <= 0) return toast.error(t('loans.error_invalid_amount'))

    // ── Penalty amounts (computed as of payDate — retroactive-safe) ─────────
    const lateFees = computePenaltyAtDate(inst, loanConfig, payDate)
    const penaltyPaidAmt = penaltyMode === 'full' ? lateFees
      : penaltyMode === 'negotiated' ? (parseFloat(penaltyNegotiated) || 0)
        : 0
    const penaltyWaivedAmt = penaltyMode === 'waived' ? lateFees : 0
    const penaltyPendingAmt = Math.max(0, lateFees - penaltyPaidAmt - penaltyWaivedAmt)

    setSavingPayment(true)
    const gps = await getGPS()
    const paidAtISO = new Date(payDate + 'T12:00:00').toISOString()

    // Upload asset if needed
    let finalAssetUrl = null
    if (payMethod === 'asset') {
      if (!assetDesc.trim() || !assetFile) {
        setSavingPayment(false)
        return toast.error(t('loans.error_asset_required') || 'Description and photo required')
      }
      setUploading(true)
      const fileExt = assetFile.name.split('.').pop()
      const filePath = `collaterals/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
      const { error: uploadError } = await sb.storage.from('documents').upload(filePath, assetFile)
      if (uploadError) {
        setUploading(false)
        setSavingPayment(false)
        return toast.error(uploadError.message)
      }
      const { data: { publicUrl } } = sb.storage.from('documents').getPublicUrl(filePath)
      finalAssetUrl = publicUrl
      setUploading(false)
    }

    // Find chronological pending/partial installments starting from this one
    const targetInsts = installments
      .filter(i => i.status === 'pending' || i.status === 'partial')
      .sort((a, b) => a.installment_number - b.installment_number)

    const startIndex = targetInsts.findIndex(i => i.id === inst.id)
    const cascadeList = targetInsts.slice(startIndex === -1 ? 0 : startIndex)

    const updates = []

    for (const currentInst of cascadeList) {
      if (receivedRemaining <= 0) break

      const expected = Number(currentInst.expected_amount)
      const currentPaid = Number(currentInst.paid_amount)
      const shortfall = Math.max(0, expected - currentPaid)

      if (shortfall <= 0) continue

      const amountToApply = Math.min(shortfall, receivedRemaining)
      receivedRemaining -= amountToApply

      const newPaid = currentPaid + amountToApply
      const newStatus = newPaid >= expected ? 'paid' : 'partial'

      // For the primary installment, embed penalty_paid into the history entry so the
      // inline history-edit form can display and recalculate it accurately.
      const isPrimary = currentInst.id === inst.id
      const entryPenalty = isPrimary && penaltyPaidAmt > 0 ? { penalty_paid: penaltyPaidAmt } : {}
      const historyEntry: PaymentHistoryEntry = payMethod === 'asset'
        ? { date: payDate, amount: amountToApply, method: 'asset', asset_description: assetDesc, asset_url: finalAssetUrl, ...entryPenalty }
        : { date: payDate, amount: amountToApply, method: payMethod, ...entryPenalty }
      const updatedHistory = [...(currentInst.payment_history ?? []), historyEntry]

      updates.push({
        id: currentInst.id,
        paid_amount: newPaid,
        status: newStatus,
        paid_at: paidAtISO,
        payment_history: updatedHistory,
        lat: gps?.lat ?? null,
        lng: gps?.lng ?? null,
        // Penalty tracking: recorded on the primary installment only
        ...(currentInst.id === inst.id ? {
          penalty_paid: penaltyPaidAmt,
          penalty_waived: penaltyWaivedAmt,
          penalty_pending: carryOverPending ? 0 : penaltyPendingAmt,
        } : {}),
      })
    }

    let hasError = false
    for (const up of updates) {
      const { error } = await sb.from('loan_installments').update(up).eq('id', up.id)
      if (error) { toast.error(error.message); hasError = true }
    }

    if (!hasError) {
      // ── Carry-over pending penalty to next installment's principal ─────────
      if (carryOverPending && penaltyPendingAmt > 0) {
        const nextInst = installments
          .filter(i => i.status !== 'cancelled' && i.installment_number > inst.installment_number)
          .sort((a, b) => a.installment_number - b.installment_number)[0]
        if (nextInst) {
          const { error: carryErr } = await sb.from('loan_installments')
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .update({ expected_amount: Number(nextInst.expected_amount) + penaltyPendingAmt } as any)
            .eq('id', nextInst.id)
          if (carryErr) {
            toast.error(`Carry-over: ${carryErr.message}`)
          } else {
            toast.info(t('loans.penalty_carry_over_toast', { amount: `${ccySymbol}${fmt(penaltyPendingAmt)}`, n: String(nextInst.installment_number) }))
          }
        }
      }

      toast.success(t('loans.receive_success'))

      // ── Auto-complete: promote loan to 'paid' when every installment is settled ──
      const { data: remainingOpen } = await sb
        .from('loan_installments')
        .select('id')
        .eq('loan_id', loanId)
        .neq('status', 'cancelled')
        .neq('status', 'paid')
        .limit(1)

      if (remainingOpen?.length === 0) {
        // All non-cancelled installments are now paid
        await sb.from('loans').update({ status: 'paid' }).eq('id', loanId)
        toast.success(t('loans.loan_completed_toast'))
      }

      // Best-effort: sync payment as an income transaction with customer + category link
      if (businessId && user?.id) {
        const totalReceived = parseFloat(payAmount) - Math.max(0, receivedRemaining)
        const syncLedger = async () => {
          // Try to find a "Loan Repayment" category so the ledger entry is properly categorised
          const { data: loanCat } = await sb
            .from('categories').select('id')
            .eq('business_id', businessId!)
            .ilike('name', 'loan repayment')
            .limit(1).maybeSingle()
          await sb.from('transactions').insert({
            account_id: accountId ?? '',
            business_id: businessId,
            amount: totalReceived + penaltyPaidAmt,
            type: 'income' as const,
            description: `Loan payment${customerName ? ` — ${customerName}` : ''}`,
            currency: loanConfig.currency || 'BRL',
            created_by: user.id,
            kanban_status: 'paid' as const,
            purchase_date: payDate,
            customer_id: loanCustomerId ?? null,
            category_id: loanCat?.id ?? null,
            metadata: { loan_id: loanId, source: 'loan_payment', penalty: penaltyPaidAmt },
          })
        }
        void syncLedger().catch(() => {/* non-blocking */ })
      }

      // Fire-and-forget audit log + email receipt (non-blocking)
      const totalApplied = parseFloat(payAmount) - Math.max(0, receivedRemaining)
      fetch('/api/loans/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_type: 'PAYMENT_RECEIVED',
          loan_id: loanId,
          business_id: businessId ?? '',
          amount: totalApplied,
          pay_date: payDate,
        }),
      }).catch(() => { /* best-effort */ })

      setReceivingId(null); setPayAmount(''); setPayDate(todayISO())
      setPayMethod('cash'); setAssetDesc(''); setAssetFile(null)
      setPenaltyMode(null); setPenaltyNegotiated(''); setCarryOverPending(false)
      fetchInstallments()
    }
    setSavingPayment(false)
  }

  // ── Save Schedule Edit (pending installments) ─────────────────────────────
  const handleSaveEdit = async (inst: Installment) => {
    const newExpected = parseFloat(editExpected)
    if (!editDueDate || isNaN(newExpected) || newExpected <= 0) return toast.error(t('loans.error_invalid_edit'))
    setSavingEdit(true)
    const { error } = await sb.from('loan_installments').update({ due_date: editDueDate, expected_amount: newExpected }).eq('id', inst.id)
    if (error) { toast.error(error.message) } else { toast.success(t('loans.edit_inst_success')); setEditingId(null); fetchInstallments() }
    setSavingEdit(false)
  }

  // ── Save Payment Correction (paid / partial installments) ─────────────────
  const handleSaveEditPayment = async (inst: Installment) => {
    const amount = parseFloat(editPaidAmount)
    if (isNaN(amount) || amount < 0) return toast.error(t('loans.error_invalid_amount'))
    setSavingEdit(true)
    const newStatus = amount >= Number(inst.expected_amount) ? 'paid'
      : amount > 0 ? 'partial'
        : 'pending'
    const paidAtValue = newStatus === 'paid'
      ? new Date(editPaidAt + 'T12:00:00').toISOString()
      : null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await sb.from('loan_installments').update({ paid_amount: amount, status: newStatus, paid_at: paidAtValue } as any).eq('id', inst.id)
    if (error) { toast.error(error.message) } else { toast.success(t('loans.edit_inst_success')); setEditingId(null); fetchInstallments() }
    setSavingEdit(false)
  }

  // ── Save History Entry Correction (inline edit) ───────────────────────────
  const handleSaveHistoryEdit = async (inst: Installment, historyIdx: number) => {
    const newAmt = parseFloat(historyEditAmount)
    const newPen = parseFloat(historyEditPenalty)
    if (isNaN(newAmt) || isNaN(newPen) || newAmt < 0 || newPen < 0) {
      return toast.error(t('loans.error_invalid_amount'))
    }
    if (!historyEditReason.trim()) {
      return toast.error(t('loans.edit_reason_required') || 'Reason is required')
    }

    setSavingEdit(true)
    const oldEntry = inst.payment_history[historyIdx]
    // Use updated date if provided, else keep original
    const newDate = historyEditDate || oldEntry.date

    // Recompute is_late based on new date vs due_date
    const daysLateOnEdit = daysLateFor(inst.due_date, newDate)

    const updatedHistory = [...inst.payment_history]
    updatedHistory[historyIdx] = {
      ...oldEntry,
      date: newDate,
      amount: newAmt,
      penalty_paid: newPen,
      // Propagate lateness flag for audit trail
      ...(daysLateOnEdit > 0 ? { is_late: true, days_late: daysLateOnEdit } : { is_late: false, days_late: 0 }),
    }

    // Recalculate installment totals
    const totalPaid = updatedHistory.reduce((acc, h) => acc + (Number(h.amount) || 0), 0)
    const totalPen = updatedHistory.reduce((acc, h) => acc + (Number(h.penalty_paid) || 0), 0)

    // Recalculate status based on total paid vs expected
    const newStatus = totalPaid >= Number(inst.expected_amount) ? 'paid'
      : totalPaid > 0 ? 'partial'
        : 'pending'

    // If status is paid, use the corrected payment date; otherwise preserve existing paid_at
    const correctedPaidAt = newStatus === 'paid'
      ? new Date(newDate + 'T12:00:00').toISOString()
      : inst.paid_at

    // 1. Update Installment
    const { error: upError } = await sb.from('loan_installments')
      .update({
        payment_history: updatedHistory,
        paid_amount: totalPaid,
        penalty_paid: totalPen,
        status: newStatus,
        paid_at: correctedPaidAt,
      })
      .eq('id', inst.id)

    if (upError) {
      toast.error(upError.message)
    } else {
      // 2. Audit Log
      if (user && businessId) {
        await sb.from('audit_logs').insert({
          business_id: businessId,
          user_id: user.id,
          action: 'PAYMENT_CORRECTION',
          entity_type: 'loan_installment',
          entity_id: inst.id,
          old_values: {
            amount: oldEntry.amount,
            penalty_paid: oldEntry.penalty_paid || 0,
            history_idx: historyIdx
          },
          new_values: {
            date: newDate,
            amount: newAmt,
            penalty_paid: newPen,
            days_late: daysLateOnEdit,
            reason: historyEditReason,
            history_idx: historyIdx
          }
        })
      }
      toast.success(t('loans.edit_inst_success'))
      setEditingHistoryIdx(null)
      setEditingId(null)
      fetchInstallments()
    }
    setSavingEdit(false)
  }

  // ── Waive & Close ────────────────────────────────────────────────────────
  // Forgives the remaining principal balance + pending penalties, marks as paid.
  // Paula 50c fix: principal forgiveness is recorded in payment_history with
  // amount=0 (no cash received). penalty_waived accumulates ONLY forgiven penalties.
  // No transaction row is created — this is a balance forgiveness, not money received.
  const handleWaiveAndClose = async (inst: Installment) => {
    const remaining = Math.max(0, Number(inst.expected_amount) - Number(inst.paid_amount))
    const penaltyPending = Number(inst.penalty_pending) || 0

    // payment_history entry — amount:0 signals no cash was received
    const waiveEntry: PaymentHistoryEntry & { forgiven_principal?: number; forgiven_penalty?: number } = {
      date: todayISO(),
      amount: 0,       // ← no cash received
      penalty_paid: 0,
      method: 'cash',  // placeholder — UI shows "waived" via forgiven_principal
      forgiven_principal: remaining,
      forgiven_penalty: penaltyPending,
    }

    const { error } = await sb.from('loan_installments').update({
      status: 'paid',
      paid_amount: Number(inst.expected_amount),   // settles the record (not cash)
      penalty_waived: (Number(inst.penalty_waived) || 0) + penaltyPending,  // penalties only
      penalty_pending: 0,
      paid_at: new Date().toISOString(),
      payment_history: [...(inst.payment_history || []), waiveEntry],
    }).eq('id', inst.id)
    if (error) { toast.error(error.message) } else {
      toast.success(t('loans.waive_close_success'))
      if (user && businessId) {
        await sb.from('audit_logs').insert({
          business_id: businessId, user_id: user.id,
          action: 'WAIVE_AND_CLOSE', entity_type: 'loan_installment', entity_id: inst.id,
          old_values: { status: inst.status, paid_amount: inst.paid_amount },
          new_values: {
            status: 'paid',
            forgiven_principal: remaining,
            forgiven_penalty: penaltyPending,
            no_cash_received: true,
          },
        })
      }
      fetchInstallments()
    }
  }

  // ── Rollover to Next Installment ──────────────────────────────────────────
  // Transfers remaining principal + pending penalties to the next pending installment.
  const handleRolloverToNext = async (inst: Installment) => {
    const remaining = Math.max(0, Number(inst.expected_amount) - Number(inst.paid_amount))
    const penaltyPending = Number(inst.penalty_pending) || 0
    const rolloverAmt = remaining + penaltyPending
    if (rolloverAmt <= 0) return toast.error(t('loans.rollover_nothing_to_move'))

    const nextInst = installments
      .filter(i => (i.status === 'pending' || i.status === 'partial') && i.installment_number > inst.installment_number)
      .sort((a, b) => a.installment_number - b.installment_number)[0]

    if (!nextInst) return toast.error(t('loans.rollover_no_next'))

    const { error: nextErr } = await sb.from('loan_installments')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ expected_amount: Number(nextInst.expected_amount) + rolloverAmt } as any)
      .eq('id', nextInst.id)
    if (nextErr) return toast.error(nextErr.message)

    const { error } = await sb.from('loan_installments').update({
      status: 'paid',
      paid_amount: Number(inst.expected_amount),
      penalty_pending: 0,
      paid_at: new Date().toISOString(),
    }).eq('id', inst.id)
    if (error) { toast.error(error.message) } else {
      toast.success(t('loans.rollover_success', { n: String(nextInst.installment_number), amount: `${ccySymbol}${fmt(rolloverAmt)}` }))
      fetchInstallments()
    }
  }

  // ── Rollover to Final Installment ─────────────────────────────────────────
  const handleRolloverToFinal = async (inst: Installment) => {
    const remaining = Math.max(0, Number(inst.expected_amount) - Number(inst.paid_amount))
    const penaltyPending = Number(inst.penalty_pending) || 0
    const rolloverAmt = remaining + penaltyPending
    if (rolloverAmt <= 0) return toast.error(t('loans.rollover_nothing_to_move'))

    const activeInsts = installments.filter(
      (i: Installment) => i.id !== inst.id && (i.status === 'pending' || i.status === 'partial')
    )
    const finalInst = activeInsts.sort((a: Installment, b: Installment) => b.installment_number - a.installment_number)[0]
    if (!finalInst) return toast.error(t('loans.rollover_no_next'))

    const { error: finalErr } = await sb.from('loan_installments')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ expected_amount: Number(finalInst.expected_amount) + rolloverAmt } as any)
      .eq('id', finalInst.id)
    if (finalErr) return toast.error(finalErr.message)

    const { error } = await sb.from('loan_installments').update({
      status: 'paid',
      paid_amount: Number(inst.expected_amount),
      penalty_pending: 0,
      paid_at: new Date().toISOString(),
    }).eq('id', inst.id)
    if (error) { toast.error(error.message) } else {
      toast.success(t('loans.rollover_final_success', { n: String(finalInst.installment_number), amount: `${ccySymbol}${fmt(rolloverAmt)}` }))
      setRolloverMenuId(null)
      fetchInstallments()
    }
  }

  // ── Renew / Rollover — Controlled Renewal Workflow ────────────────────────
  // 1. Records the fee paid today on the current installment.
  // 2. Closes the current installment cleanly (expected = paid → zero balance).
  // 3. Creates a new pending installment for the remaining principal + new interest.
  const handleRenewConfirm = async () => {
    if (!renewingInst) return
    const inst = renewingInst

    const paidToday = Math.max(0, parseFloat(renewPaidToday) || 0)
    const interestRate = Math.max(0, parseFloat(renewInterestRate) || 0)

    if (!renewDueDate) return toast.error('New due date is required')

    // Outstanding = remaining principal + pending penalty on this installment
    const remaining = Math.max(0, Number(inst.expected_amount) - Number(inst.paid_amount))
    const penaltyPending = Number(inst.penalty_pending) || 0
    const outstandingBalance = remaining + penaltyPending

    if (paidToday > outstandingBalance) {
      return toast.error('Amount paid today cannot exceed outstanding balance')
    }

    // New principal = what is still owed after today's payment
    const remainingPrincipal = Math.max(0, outstandingBalance - paidToday)
    // Interest for new period = flat rate on remaining principal (0% → no interest charge)
    const interestForNewPeriod = remainingPrincipal * (interestRate / 100)
    // New expected = principal + interest
    const newExpectedAmount = remainingPrincipal + interestForNewPeriod

    setSavingRenewal(true)

    // ── Step 1: record today's payment on the current installment ───────────
    const newPaidAmount = Number(inst.paid_amount) + paidToday
    const updatedHistory: PaymentHistoryEntry[] = [
      ...(inst.payment_history ?? []),
      ...(paidToday > 0 ? [{
        date: todayISO(),
        amount: paidToday,
        method: 'renewal_fee' as const,
      } satisfies PaymentHistoryEntry] : []),
    ]

    // ── Step 2: close the current installment cleanly ────────────────────────
    // Set expected_amount = new paid_amount so the balance lands at exactly 0.
    // If nothing was paid, mark as cancelled instead.
    const closedStatus: Installment['status'] = newPaidAmount > 0 ? 'paid' : 'cancelled'

    const { error: updateErr } = await sb.from('loan_installments').update({
      paid_amount: newPaidAmount,
      expected_amount: newPaidAmount,   // balance → 0 (no phantom debt)
      status: closedStatus,
      penalty_pending: 0,
      paid_at: newPaidAmount > 0 ? new Date().toISOString() : null,
      payment_history: updatedHistory,
    }).eq('id', inst.id)

    if (updateErr) {
      setSavingRenewal(false)
      return toast.error(updateErr.message)
    }

    // ── Step 3: create new pending installment ───────────────────────────────
    const lastInst = [...installments]
      .filter(i => i.status !== 'cancelled')
      .sort((a, b) => b.installment_number - a.installment_number)[0]
    const newNumber = (lastInst?.installment_number ?? 0) + 1

    const { error: insertErr } = await sb.from('loan_installments').insert({
      loan_id: loanId,
      installment_number: newNumber,
      due_date: renewDueDate,
      expected_amount: newExpectedAmount,
      paid_amount: 0,
      penalty_paid: 0,
      penalty_waived: 0,
      penalty_pending: 0,
      status: 'pending',
      payment_history: [],
    })

    if (insertErr) {
      setSavingRenewal(false)
      return toast.error(insertErr.message)
    }

    toast.success(`Loan renewed — instalment #${newNumber}: ${ccySymbol}${fmt(newExpectedAmount)}`)
    setShowRenewModal(false)
    setRenewingInst(null)
    setRenewPaidToday('')
    setRenewDueDate('')
    setRenewInterestRate('0')
    setSavingRenewal(false)
    fetchInstallments()
  }

  // ── Delete Payment History Entry ─────────────────────────────────────────
  // Removes a single history entry and recalculates paid_amount + status.
  //
  // IMPORTANT: We re-sum from the remaining history rather than subtracting the
  // deleted entry's `amount`. This fixes the "Waive & Close" lock-in bug:
  //   handleWaiveAndClose sets paid_amount = expected_amount but records
  //   amount = 0 in the history entry. Subtracting 0 leaves paid_amount
  //   unchanged → status stays 'paid'. Re-summing produces the correct value.
  const handleDeletePayment = async (inst: Installment, histIdx: number) => {
    const entry = inst.payment_history[histIdx]
    if (!entry) return

    const newHistory = inst.payment_history.filter((_, i) => i !== histIdx)

    // Recompute totals from remaining history entries — the only source of truth
    const newPaidAmount = Math.max(0, newHistory.reduce((acc, h) => acc + Number(h.amount || 0), 0))
    const newPenaltyPaid = Math.max(0, newHistory.reduce((acc, h) => acc + Number(h.penalty_paid || 0), 0))

    // Recompute status after removal
    // Note: for renewal-closed installments expected_amount == old paid_amount;
    // we use the *original* expected_amount as the threshold, not the new paid.
    const expected = Number(inst.expected_amount)
    let newStatus: Installment['status']
    if (newPaidAmount <= 0) {
      const today = new Date()
      const due = new Date(inst.due_date + 'T00:00:00')
      newStatus = today > due ? 'overdue' : 'pending'
    } else if (newPaidAmount < expected) {
      newStatus = 'partial'
    } else {
      newStatus = 'paid'
    }

    const { error } = await sb.from('loan_installments').update({
      paid_amount: newPaidAmount,
      penalty_paid: newPenaltyPaid,
      status: newStatus,
      paid_at: newHistory.length > 0 ? (newHistory[newHistory.length - 1] as PaymentHistoryEntry).date : null,
      payment_history: newHistory,
    }).eq('id', inst.id)

    if (error) { toast.error(error.message); return }

    if (user && businessId) {
      await sb.from('audit_logs').insert({
        business_id: businessId, user_id: user.id,
        action: 'DELETE_PAYMENT_ENTRY', entity_type: 'loan_installment', entity_id: inst.id,
        old_values: { paid_amount: inst.paid_amount, history_idx: histIdx, entry },
        new_values: { paid_amount: newPaidAmount, status: newStatus },
      })
    }

    toast.success(t('loans.payment_deleted'))
    fetchInstallments()
  }

  // ── Inline Due-Date Save ──────────────────────────────────────────────────
  const handleSaveDateOverride = async (instId: string) => {
    if (!dateOverrideValue) return
    const { error } = await sb.from('loan_installments')
      .update({ due_date: dateOverrideValue })
      .eq('id', instId)
    if (error) { toast.error(error.message) } else {
      toast.success(t('loans.penalty_date_updated'))
      setDateOverrideId(null)
      fetchInstallments()
    }
  }

  // ── Interest Freeze Toggle ────────────────────────────────────────────────
  const handleToggleFreeze = async () => {
    const newVal = !loanConfig.is_interest_frozen
    const { error } = await sb.from('loans').update({ is_interest_frozen: newVal }).eq('id', loanId)
    if (error) {
      toast.error(error.message)
    } else {
      setLoanConfig(prev => ({ ...prev, is_interest_frozen: newVal }))
      toast.success(newVal ? t('loans.interest_frozen') : t('loans.interest_unfrozen'))
    }
  }

  // ── WhatsApp Summary — tiered: Evolution API (add-on) vs wa.me (manual) ──
  const handleWhatsApp = async () => {
    const lang = customerLang || 'en'
    const name = customerName || t('loans.customer_anonymous')

    const HEADERS: Record<string, string> = {
      pt: `Olá *${name}*! 👋\n\nResumo do seu empréstimo:`,
      en: `Hello *${name}*! 👋\n\nHere is your loan summary:`,
      es: `¡Hola *${name}*! 👋\n\nResumen de tu préstamo:`,
      it: `Ciao *${name}*! 👋\n\nEcco il riepilogo del prestito:`,
    }
    const TOTALS: Record<string, string> = {
      pt: `*Total Devedor: ${ccySymbol}${fmt(settlement.total)}*`,
      en: `*Total Due: ${ccySymbol}${fmt(settlement.total)}*`,
      es: `*Total a Pagar: ${ccySymbol}${fmt(settlement.total)}*`,
      it: `*Totale Dovuto: ${ccySymbol}${fmt(settlement.total)}*`,
    }
    const FOOTERS: Record<string, string> = {
      pt: `_Enviado via MyVizo_`,
      en: `_Sent via MyVizo_`,
      es: `_Enviado vía MyVizo_`,
      it: `_Inviato tramite MyVizo_`,
    }

    let breakdown = ''
    settlement.details.forEach(r => {
      const inst = installments.find(i => i.installment_number === r.installmentNumber)
      if (!inst) return
      const due = formatDateGlobal(inst.due_date, dateFormat)
      const penalty = r.fixed + r.mora + r.flatMora
      const subtotal = r.remaining + penalty
      breakdown += `*#${r.installmentNumber} (${due})*\n`
      breakdown += `- ${ccySymbol}${fmt(r.remaining)}`
      if (penalty > 0) breakdown += ` + ${ccySymbol}${fmt(penalty)} (late fee × ${r.daysOverdue}d)`
      breakdown += ` = ${ccySymbol}${fmt(subtotal)}\n`
    })

    const header = HEADERS[lang] ?? HEADERS.en
    const total = TOTALS[lang] ?? TOTALS.en
    const footer = FOOTERS[lang] ?? FOOTERS.en
    const message = `${header}\n\n${breakdown.trim()}\n\n${total}\n${footer}`

    const hasWaAddon = subscription.planKey === 'enterprise' || subscription.activeAddons.includes('whatsapp')

    if (hasWaAddon && customerPhone) {
      // Logic A: send automatically via Evolution API
      try {
        const res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: customerPhone, message, businessId, businessName }),
        })
        const json = await res.json().catch(() => ({})) as { ok?: boolean; error?: string }
        if (json.ok) {
          toast.success(t('loans.whatsapp_sent'))
        } else {
          toast.error(json.error ?? t('loans.whatsapp_send_failed'))
        }
      } catch {
        toast.error(t('loans.whatsapp_send_failed'))
      }
    } else {
      // Logic B: open wa.me link for manual send
      const phone = (customerPhone || '').replace(/\D/g, '')
      const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  // ── Totals (exclude cancelled) ────────────────────────────────────────────
  const activeInsts = installments.filter((i: Installment) => i.status !== 'cancelled')
  const totalExpected = activeInsts.reduce((acc: number, c: Installment) => acc + Number(c.expected_amount), 0)
  const totalPaid = activeInsts.reduce((acc: number, c: Installment) => acc + getEffectivePaidAmount(c), 0)
  const totalRemaining = totalExpected - totalPaid
  const todayStr = todayISO()
  const financialBreakdown = useMemo(
    () => computeLoanFinancialBreakdown({
      principalAmount: loanPrincipal ?? 0,
      installments,
      today: todayStr,
    }),
    [installments, loanPrincipal, todayStr],
  )

  // ── Total Recovered — absolute sum of every cash entry in payment_history ─
  // Includes principal payments, interest payments, and penalty payments.
  const totalRecovered = financialBreakdown.principalRecovered

  // ── Saldo Devedor Total — everything the client still owes ────────────────
  const totalOutstanding = financialBreakdown.totalOutstanding

  // ── Total em Atraso — unpaid balance on installments past due date ─────────
  const totalInArrears = financialBreakdown.inArrears

  // ── Projeção de Lucro — total interest income expected ────────────────────
  // (Total Expected across all active installments) − (Original Principal Lent)
  const profitProjection = financialBreakdown.futureProfit

  const settlement: Settlement = useMemo(() => calcSettlement(installments, loanConfig), [installments, loanConfig])
  const totalPenaltiesPaid = useMemo(() => financialBreakdown.penaltiesCollected, [financialBreakdown])
  const canOwnerAct = memberRole === 'owner' || memberRole === 'manager'

  // Derive the currency symbol strictly from the loan's own ISO currency code
  const ccySymbol = useMemo(() => {
    const currency = loanConfig.currency
    if (!currency) return ''
    try {
      const parts = new Intl.NumberFormat('en-GB', { style: 'currency', currency }).formatToParts(0)
      return parts.find(p => p.type === 'currency')?.value ?? currency
    } catch {
      return currency
    }
  }, [loanConfig.currency])

  const totalPenaltyPending = useMemo(() => {
    return financialBreakdown.penaltiesPending
  }, [financialBreakdown])

  return (
    <>
      {/* ── BACKDROP (O "Vidro do Box") ── */}
      {/* Ele fica na camada 9998. Ao clicar nele, a gaveta fecha. */}
      <div
        className="fixed inset-0 z-[9998] bg-black/40 backdrop-blur-[2px] transition-opacity animate-in fade-in duration-300"
        onClick={onClose}
      />

      {/* ── DRAWER PRINCIPAL ── */}
      {/* Aumentamos para z-[9999] para ele ficar NA FRENTE do vidro */}
      <div className="fixed inset-y-0 right-0 z-[9999] w-full md:w-[600px] bg-background border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 overflow-x-hidden">

        {/* ── HEADER & METRICS ── */}
        <div className="p-5 border-b border-border bg-muted/10 shrink-0">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
                {customerName}
                {isOffDuty && <Lock className="w-4 h-4 text-rose-500" />}
              </h2>
              <div className="flex gap-2 text-xs text-muted-foreground mt-0.5">
                <span className="capitalize">{loanConfig.frequency}</span>
                <span>·</span>
                <span>{loanConfig.currency}</span>
              </div>
            </div>
            <div className="flex gap-1">
              <button onClick={handleWhatsApp} title="WhatsApp" className="p-2 hover:bg-muted rounded-full transition-colors">
                <MessageCircle className="h-4 w-4" />
              </button>
              <button onClick={() => setShowRenegotiate(true)} className="p-2 hover:bg-muted rounded-full transition-colors">
                <RefreshCw className="h-4 w-4" />
              </button>
              <button onClick={onClose} className="p-2 hover:bg-muted rounded-full transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* 6-Metric grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div className="bg-background border border-border rounded-xl p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">{t('loans.total_lent')}</p>
              <p className="font-bold text-foreground text-sm">{ccySymbol}{fmt(loanPrincipal ?? 0)}</p>
            </div>
            <div className="bg-background border border-border rounded-xl p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">{t('loans.total_recovered') || 'Total Recuperado'}</p>
              <p className="font-bold text-emerald-500 text-sm">{ccySymbol}{fmt(totalRecovered)}</p>
            </div>
            <div className="bg-background border border-border rounded-xl p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">{t('loans.saldo_devedor') || 'Saldo Devedor Total'}</p>
              <p className="font-bold text-orange-400 text-sm">{ccySymbol}{fmt(totalOutstanding)}</p>
            </div>
            <div className="bg-background border border-border rounded-xl p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">{t('loans.total_em_atraso') || 'Total em Atraso'}</p>
              <p className="font-bold text-rose-500 text-sm">{ccySymbol}{fmt(totalInArrears)}</p>
            </div>
            <div className="bg-background border border-border rounded-xl p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">{t('loans.drawer_penalty_pending')}</p>
              <p className="font-bold text-rose-400 text-sm">{ccySymbol}{fmt(totalPenaltyPending)}</p>
            </div>
            <div className="bg-background border border-border rounded-xl p-3">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">{t('loans.projecao_lucro') || 'Projeção de Lucro'}</p>
              <p className="font-bold text-amber-400 text-sm">{ccySymbol}{fmt(profitProjection)}</p>
            </div>
          </div>
        </div>

        {/* ── INSTALLMENT LIST ── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-muted/5">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : installments.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">{t('loans.no_installments') || 'No installments found.'}</div>
          ) : (
            installments.map((inst) => {
              const isPaid = inst.status === 'paid'
              const isExpanded = expandedIds.has(inst.id)
              const isReceiving = receivingId === inst.id

              return (
                <div key={inst.id} className={cn(
                  'border rounded-xl transition-all overflow-hidden shadow-sm',
                  isPaid ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-card hover:border-slate-500/40',
                )}>

                  {/* Accordion Header */}
                  <div
                    onClick={() => toggleExpanded(inst.id)}
                    className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-bold shrink-0',
                        isPaid ? 'bg-emerald-500/20 text-emerald-500' : 'bg-muted text-foreground',
                      )}>
                        {inst.installment_number}
                      </div>
                      <div>
                        <p className="font-semibold text-sm leading-tight">{formatDateGlobal(inst.due_date, dateFormat)}</p>
                        <p className="text-xs text-muted-foreground">{ccySymbol}{fmt(Number(inst.expected_amount))}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'px-2 py-0.5 text-[10px] uppercase tracking-wider font-bold rounded-md',
                        inst.status === 'paid' ? 'bg-emerald-500/20 text-emerald-500' :
                          inst.status === 'overdue' ? 'bg-rose-500/20 text-rose-500' :
                            inst.status === 'partial' ? 'bg-amber-500/20 text-amber-500' :
                              'bg-slate-500/20 text-slate-400'
                      )}>
                        {t(`loans.status_${inst.status}`)}
                      </span>
                      <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform duration-200', isExpanded && 'rotate-180')} />
                    </div>
                  </div>

                  {/* Expanded Body */}
                  {isExpanded && (
                    <div className="border-t border-border/50">

                      {/* ── Admin Actions Toolbar ── */}
                      {canOwnerAct && !isOffDuty && !isPaid && inst.status !== 'cancelled' && (
                        <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-muted/20 border-b border-border/30">
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0">{t('loans.admin_actions') || 'Actions'}:</span>

                          <button
                            onClick={(e) => { e.stopPropagation(); void handleWaiveAndClose(inst) }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-400 bg-emerald-400/10 hover:bg-emerald-400/20 border border-emerald-500/20 rounded-md transition-all active:scale-95"
                          >
                            <CheckCircle2 className="w-3 h-3" />
                            {t('loans.waive_close_btn')}
                          </button>

                          <div className="relative">
                            <button
                              onClick={(e) => { e.stopPropagation(); setRolloverMenuId(rolloverMenuId === inst.id ? null : inst.id) }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-indigo-400 bg-indigo-400/10 hover:bg-indigo-400/20 border border-indigo-500/20 rounded-md transition-all active:scale-95"
                            >
                              <RotateCcw className="w-3 h-3" />
                              {t('loans.rollover_btn')}
                              <ChevronDown className="h-3 w-3" />
                            </button>

                            {rolloverMenuId === inst.id && (
                              <div className="absolute left-0 mt-1 w-52 bg-card border border-border rounded-lg shadow-xl z-20 py-1 overflow-hidden">
                                <button
                                  onClick={(e) => { e.stopPropagation(); void handleRolloverToNext(inst); setRolloverMenuId(null) }}
                                  className="w-full text-left px-4 py-2 text-xs hover:bg-muted text-foreground transition-colors"
                                >
                                  {t('loans.rollover_no_next') || 'Add to Next Instalment'}
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); void handleRolloverToFinal(inst); setRolloverMenuId(null) }}
                                  className="w-full text-left px-4 py-2 text-xs hover:bg-muted text-foreground transition-colors"
                                >
                                  {t('loans.rollover_to_final') || 'Add to Final Instalment'}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setRolloverMenuId(null)
                                    setRenewingInst(inst)
                                    setRenewPaidToday('')
                                    setRenewInterestRate(String(loanConfig.late_fee_daily_pct || 0))
                                    const nextMonth = new Date()
                                    nextMonth.setMonth(nextMonth.getMonth() + 1)
                                    setRenewDueDate(nextMonth.toISOString().split('T')[0])
                                    setShowRenewModal(true)
                                  }}
                                  className="w-full text-left px-4 py-2 text-xs font-medium hover:bg-muted text-violet-400 transition-colors"
                                >
                                  {t('loans.renew_rollover_btn') || 'Renew / Rollover'}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* ── Payment History ── */}
                      {inst.payment_history?.length > 0 && (
                        <div className="px-4 pt-3 pb-2">
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-2">{t('loans.payment_history_label') || 'Payment History'}</p>
                          <div className="space-y-1.5">
                            {inst.payment_history.map((ph, idx) => (
                              <div key={idx} className="flex justify-between items-center text-xs px-3 py-2 bg-muted/30 border border-border/40 rounded-lg">
                                <div>
                                  <span className="font-medium text-foreground">{formatDateGlobal(ph.date, dateFormat)}</span>
                                  <span className="text-muted-foreground ml-2 capitalize">{ph.method || 'cash'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="text-right">
                                    <p className="font-semibold">{ccySymbol}{fmt(ph.amount)}</p>
                                    {/* Usamos Number() e || 0 para garantir que o TS não reclame do undefined */}
                                    {(Number(ph.penalty_paid) || 0) > 0 && (
                                      <p className="text-[10px] text-rose-400">
                                        +{fmt(Number(ph.penalty_paid) || 0)} {t('loans.penalty_label') || 'fee'}
                                      </p>
                                    )}
                                  </div>
                                  {canOwnerAct && !isOffDuty && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); void handleDeletePayment(inst, idx) }}
                                      title={t('loans.delete_payment_btn')}
                                      className="p-1 rounded hover:bg-rose-500/10 text-muted-foreground hover:text-rose-400 transition-colors"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* ── Receive Payment + Renew Loan: Trigger Buttons ── */}
                      {!isReceiving && !isPaid && inst.status !== 'cancelled' && (
                        <div className="px-4 py-3 flex gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setReceivingId(inst.id)
                              setPayDate(todayISO())
                              setPayAmount('')
                              setPayMethod('cash')
                              setAssetDesc('')
                              setAssetFile(null)
                              setPenaltyMode(null)
                              setPenaltyNegotiated('')
                              setCarryOverPending(false)
                            }}
                            disabled={isOffDuty}
                            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Calculator className="h-4 w-4" />
                            {t('loans.receive_btn') || 'Receive Payment'}
                          </button>
                          {canOwnerAct && !isOffDuty && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setRolloverMenuId(null)
                                setRenewingInst(inst)
                                setRenewPaidToday('')
                                setRenewInterestRate(String(loanConfig.late_fee_daily_pct || 0))
                                const nextMonth = new Date()
                                nextMonth.setMonth(nextMonth.getMonth() + 1)
                                setRenewDueDate(nextMonth.toISOString().split('T')[0])
                                setShowRenewModal(true)
                              }}
                              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white rounded-lg transition-colors"
                            >
                              <RotateCcw className="h-4 w-4" />
                              {t('loans.renew_btn') || 'Renew Loan'}
                            </button>
                          )}
                        </div>
                      )}

                      {/* ── Receive Payment: Full Form ── */}
                      {isReceiving && (
                        <div className="px-4 pb-4 pt-3 space-y-3 border-t border-border/50">

                          {/* Amount + Date */}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">{t('loans.pay_amount') || 'Amount'}</label>
                              <input
                                type="number"
                                value={payAmount}
                                onChange={e => setPayAmount(e.target.value)}
                                placeholder="0.00"
                                className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">{t('loans.pay_date') || 'Date'}</label>
                              <input
                                type="date"
                                value={payDate}
                                onChange={e => setPayDate(e.target.value)}
                                className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                              />
                            </div>
                          </div>

                          {/* Method */}
                          <div>
                            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">{t('loans.pay_method') || 'Method'}</label>
                            <select
                              value={payMethod}
                              onChange={e => setPayMethod(e.target.value as 'cash' | 'transfer' | 'asset')}
                              className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                            >
                              <option value="cash">{t('loans.method_cash') || 'Cash'}</option>
                              <option value="transfer">{t('loans.method_transfer') || 'Bank Transfer'}</option>
                              <option value="asset">{t('loans.method_asset') || 'Asset / Collateral'}</option>
                            </select>
                          </div>

                          {/* Asset fields */}
                          {payMethod === 'asset' && (
                            <div className="space-y-2 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
                              <div>
                                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">{t('loans.asset_desc') || 'Asset Description'}</label>
                                <input
                                  type="text"
                                  value={assetDesc}
                                  onChange={e => setAssetDesc(e.target.value)}
                                  placeholder={t('loans.asset_desc_placeholder') || 'e.g. Honda CBR, Laptop'}
                                  className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">{t('loans.asset_photo') || 'Photo'}</label>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={e => setAssetFile(e.target.files?.[0] ?? null)}
                                  className="w-full text-xs text-muted-foreground file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border-0 file:bg-muted file:text-foreground file:text-xs file:font-medium hover:file:bg-muted/80 transition-colors"
                                />
                              </div>
                            </div>
                          )}

                          {/* Penalty Detection */}
                          {currentPenalty > 0 && (
                            <div className="p-3 bg-rose-500/5 border border-rose-500/20 rounded-lg space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold text-rose-400">{t('loans.penalty_detected') || 'Late Fee Detected'}</p>
                                <p className="text-sm font-bold text-rose-400">{ccySymbol}{fmt(currentPenalty)}</p>
                              </div>
                              <select
                                value={penaltyMode ?? ''}
                                onChange={e => setPenaltyMode(e.target.value as 'full' | 'waived' | 'negotiated')}
                                className="w-full rounded-lg border border-rose-500/30 bg-muted/40 px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                              >
                                <option value="" disabled>{t('loans.penalty_choose') || 'Choose how to handle the late fee…'}</option>
                                <option value="full">{t('loans.penalty_full') || 'Charge full fee'}</option>
                                <option value="waived">{t('loans.penalty_waive') || 'Waive fee'}</option>
                                <option value="negotiated">{t('loans.penalty_negotiate') || 'Negotiate amount'}</option>
                              </select>
                              {penaltyMode === 'negotiated' && (
                                <input
                                  type="number"
                                  value={penaltyNegotiated}
                                  onChange={e => setPenaltyNegotiated(e.target.value)}
                                  placeholder={t('loans.penalty_negotiated_amount') || 'Agreed fee amount'}
                                  className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
                                />
                              )}
                              {penaltyMode === 'waived' && (
                                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={carryOverPending}
                                    onChange={e => setCarryOverPending(e.target.checked)}
                                    className="rounded"
                                  />
                                  {t('loans.penalty_carry_over') || 'Carry balance to next installment'}
                                </label>
                              )}
                            </div>
                          )}

                          {/* Cancel + Confirm */}
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setReceivingId(null)
                                setPayDate(todayISO())
                                setPayMethod('cash')
                                setAssetDesc('')
                                setAssetFile(null)
                                setPenaltyMode(null)
                                setPenaltyNegotiated('')
                                setCarryOverPending(false)
                              }}
                              className="flex-1 px-4 py-2.5 text-sm font-medium text-foreground bg-muted/50 hover:bg-muted border border-border rounded-lg transition-colors"
                            >
                              {t('loans.cancel_btn') || 'Cancel'}
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); void handleReceive(inst) }}
                              disabled={savingPayment || uploading || !payAmount || (currentPenalty > 0 && penaltyMode === null)}
                              className="flex-1 inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold px-4 py-2.5 text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {savingPayment || uploading
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <>{t('loans.receive_submit') || 'Confirm Payment'}</>
                              }
                            </button>
                          </div>
                        </div>
                      )}

                    </div>
                  )}

                </div>
              )
            })
          )}
        </div>
      </div>

      {showRenegotiate && (
        <RenegotiationModal
          loanId={loanId}
          customerName={customerName}
          customerPhone={customerPhone}
          installments={installments}
          loanConfig={loanConfig}
          onClose={() => setShowRenegotiate(false)}
          onComplete={() => { setShowRenegotiate(false); fetchInstallments() }}
        />
      )}

      {/* ── RENEW / ROLLOVER MODAL ─────────────────────────────────────────── */}
      {showRenewModal && renewingInst && (() => {
        const inst = renewingInst
        const paidToday = Math.max(0, parseFloat(renewPaidToday) || 0)
        const interestRate = Math.max(0, parseFloat(renewInterestRate) || 0)
        const remaining = Math.max(0, Number(inst.expected_amount) - Number(inst.paid_amount))
        const penaltyPending = Number(inst.penalty_pending) || 0
        const outstanding = remaining + penaltyPending
        const remainingPrincipal = Math.max(0, outstanding - paidToday)
        const newExpected = remainingPrincipal + remainingPrincipal * (interestRate / 100)
        const isValid = !!renewDueDate && paidToday <= outstanding

        return (
          <>
            {/* Backdrop — above drawer (z-9999) */}
            <div
              className="fixed inset-0 z-[10000] bg-black/60 backdrop-blur-[2px]"
              onClick={() => { setShowRenewModal(false); setRenewingInst(null) }}
            />

            <div className="fixed left-1/2 top-1/2 z-[10001] w-full max-w-md -translate-x-1/2 -translate-y-1/2 bg-background border border-border rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">

              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/10">
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-violet-400" />
                  <h2 className="font-bold text-base text-foreground">
                    {t('loans.renew_modal_title') || 'Renew / Rollover Loan'}
                  </h2>
                </div>
                <button
                  onClick={() => { setShowRenewModal(false); setRenewingInst(null) }}
                  className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              <div className="p-5 space-y-4">

                {/* Outstanding balance context */}
                <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-1.5">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {t('loans.renew_outstanding_label') || 'Current Outstanding Balance'}
                  </p>
                  <p className="text-2xl font-bold text-foreground">{ccySymbol}{fmt(outstanding)}</p>
                  <div className="flex gap-4 text-xs text-muted-foreground pt-0.5">
                    <span>{t('loans.renew_principal_label') || 'Principal'}: <span className="text-foreground font-medium">{ccySymbol}{fmt(remaining)}</span></span>
                    {penaltyPending > 0 && (
                      <span>{t('loans.renew_penalty_label') || 'Penalty'}: <span className="text-rose-400 font-medium">{ccySymbol}{fmt(penaltyPending)}</span></span>
                    )}
                  </div>
                </div>

                {/* Input 1: Amount Paid Today */}
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                    {t('loans.renew_paid_today_label') || 'Amount Paid Today (Renewal Fee)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={outstanding}
                    value={renewPaidToday}
                    onChange={e => setRenewPaidToday(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  {paidToday > outstanding && (
                    <p className="text-[11px] text-rose-400 mt-1">{t('loans.renew_paid_exceeds') || 'Cannot exceed outstanding balance'}</p>
                  )}
                </div>

                {/* Input 2: New Due Date */}
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                    {t('loans.renew_due_date_label') || 'New Due Date'}
                  </label>
                  <input
                    type="date"
                    value={renewDueDate}
                    onChange={e => setRenewDueDate(e.target.value)}
                    className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>

                {/* Input 3: Interest Rate */}
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                    {t('loans.renew_interest_label') || 'New Interest Rate / Flat Fee (%)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={renewInterestRate}
                    onChange={e => setRenewInterestRate(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                </div>

                {/* Math Preview */}
                <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4 space-y-2">
                  <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-wider">
                    {t('loans.renew_preview_label') || 'Renewal Preview'}
                  </p>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between text-muted-foreground">
                      <span>{t('loans.renew_remaining_principal') || 'Remaining Principal'}</span>
                      <span className="font-semibold text-foreground">{ccySymbol}{fmt(remainingPrincipal)}</span>
                    </div>
                    {interestRate > 0 && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>{t('loans.renew_interest_charge') || 'Interest'} ({interestRate}%)</span>
                        <span className="font-semibold text-amber-400">+{ccySymbol}{fmt(remainingPrincipal * (interestRate / 100))}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-border/40 pt-1.5 mt-1">
                      <span className="font-semibold text-foreground">{t('loans.renew_new_expected') || 'New Expected Amount'}</span>
                      <span className="font-bold text-violet-400 text-sm">{ccySymbol}{fmt(newExpected)}</span>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => { setShowRenewModal(false); setRenewingInst(null) }}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-foreground bg-muted/50 hover:bg-muted border border-border rounded-lg transition-colors"
                  >
                    {t('loans.cancel_btn') || 'Cancel'}
                  </button>
                  <button
                    onClick={() => void handleRenewConfirm()}
                    disabled={savingRenewal || !isValid || newExpected < 0}
                    className="flex-1 inline-flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-semibold px-4 py-2.5 text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {savingRenewal
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <>{t('loans.renew_confirm_btn') || 'Confirm Renewal'}</>
                    }
                  </button>
                </div>
              </div>
            </div>
          </>
        )
      })()}
    </>
  )
}
