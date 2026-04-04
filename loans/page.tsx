'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { Plus, Search, Loader2, Banknote, CalendarDays, Upload, Download, Trash2, MoreVertical, AlertTriangle, GripVertical, TrendingUp, DollarSign, Receipt, Clock, CheckCircle2, Pencil, MessageCircle, Sparkles, TrendingDown, RefreshCw, Layers } from 'lucide-react'
import { getRates } from '@/lib/currencyConvert'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/hooks/useTranslation'
import { useSubscription } from '@/hooks/useSubscription'
import { FeatureGate } from '@/components/billing/FeatureGate'
import { usePreferencesStore } from '@/lib/stores/usePreferencesStore'
import { formatDateGlobal } from '@/lib/formatDate'
import { CreateLoanModal } from '@/components/dashboard/loans/CreateLoanModal'
import { InstallmentsDrawer } from '@/components/dashboard/loans/InstallmentsDrawer'
import { ImportLoansModal } from '@/components/dashboard/loans/ImportLoansModal'
import { PromissoryNote } from '@/components/dashboard/loans/PromissoryNote'
import { HoverCard } from '@/components/ui/HoverCard'
import { Printer } from 'lucide-react'
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  useSortable, horizontalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

// ── Analytics metric types ─────────────────────────────────────────────────
type MetricId = 'total_lent' | 'profit_projection' | 'penalties_collected' | 'in_arrears' | 'total_recovered' | 'total_profit' | 'total_outstanding'

interface LoanAnalytics {
  totalLent:           number
  profitProjection:    number
  penaltiesCollected:  number
  inArrears:           number
  totalRecovered:      number
  totalProfit:         number
  totalOutstanding:    number
}

const METRIC_STORAGE_KEY   = 'loans_metric_card_order'
const DEFAULT_METRIC_ORDER: MetricId[] = [
  'total_lent', 'profit_projection', 'total_profit', 'penalties_collected', 'in_arrears', 'total_recovered', 'total_outstanding',
]

interface MetricConfig {
  id:     MetricId
  labelKey: string
  icon:   React.ElementType
  color:  string
  getValue: (a: LoanAnalytics) => number
}

const METRIC_CONFIGS: MetricConfig[] = [
  { id: 'total_lent',          labelKey: 'loans.analytics_total_lent',          icon: DollarSign,   color: 'bg-blue-500',    getValue: a => a.totalLent },
  { id: 'profit_projection',   labelKey: 'loans.analytics_profit_projection',   icon: TrendingUp,   color: 'bg-emerald-500', getValue: a => a.profitProjection },
  { id: 'total_profit',        labelKey: 'loans.analytics_total_profit',        icon: Sparkles,     color: 'bg-teal-500',    getValue: a => a.totalProfit },
  { id: 'penalties_collected', labelKey: 'loans.analytics_penalties_collected', icon: Receipt,      color: 'bg-amber-500',   getValue: a => a.penaltiesCollected },
  { id: 'in_arrears',          labelKey: 'loans.analytics_in_arrears',          icon: Clock,        color: 'bg-rose-500',    getValue: a => a.inArrears },
  { id: 'total_recovered',     labelKey: 'loans.analytics_total_recovered',     icon: CheckCircle2, color: 'bg-violet-500',  getValue: a => a.totalRecovered },
  { id: 'total_outstanding',   labelKey: 'loans.analytics_total_outstanding',   icon: Layers,       color: 'bg-orange-500',  getValue: a => a.totalOutstanding },
]

// ── Sortable metric card ───────────────────────────────────────────────────
function SortableMetricCard({ cfg, analytics, ccySymbol, loading, t }: {
  cfg:       MetricConfig
  analytics: LoanAnalytics | null
  ccySymbol: string
  loading:   boolean
  t:         (key: string) => string
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: cfg.id })
  const Icon = cfg.icon
  const value = analytics ? cfg.getValue(analytics) : 0

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : undefined }}
      className={cn(
        'relative bg-card border border-border rounded-xl p-4 flex-1 min-w-[160px] select-none',
        isDragging ? 'opacity-60 shadow-2xl' : 'hover:border-primary/30 transition-colors',
      )}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start justify-between gap-2">
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', cfg.color)}>
          <Icon className="h-4 w-4 text-white" />
        </div>
        <GripVertical className="h-4 w-4 text-muted-foreground/25 cursor-grab active:cursor-grabbing shrink-0" />
      </div>
      <div className="mt-3">
        {loading ? (
          <div className="h-6 w-24 bg-muted animate-pulse rounded mb-1" />
        ) : (
          <p className="text-xl font-bold text-foreground">
            {ccySymbol}{value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{t(cfg.labelKey)}</p>
      </div>
    </div>
  )
}

interface LoanWithCustomer {
  id: string
  principal_amount: number
  interest_rate: number
  interest_type: 'simple' | 'compound'
  total_installments: number
  frequency: string
  currency: string
  status: 'active' | 'paid' | 'defaulted' | 'cancelled'
  start_date: string
  customers: { name: string; phone: string | null } | null
}

function getCcySymbol(ccy: string): string {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: ccy }).formatToParts(0)
      .find(p => p.type === 'currency')?.value ?? ccy
  } catch { return ccy }
}

// ── Lazy HoverCard content for loan rows ──────────────────────────────────────
function LoanHoverContent({ loanId, currency, principalAmount, t }: {
  loanId: string
  currency: string
  principalAmount: number
  t: (key: string, params?: Record<string, string>) => string
}) {
  const [data, setData] = useState<{
    paidCount: number; totalCount: number
    totalPaid: number; totalExpected: number; penaltiesPaid: number
  } | null>(null)
  const sb = useMemo(() => createClient(), [])

  useEffect(() => {
    let cancelled = false
    sb.from('loan_installments')
      .select('status, paid_amount, expected_amount, penalty_paid')
      .eq('loan_id', loanId)
      .neq('status', 'cancelled')
      .then(({ data: insts }) => {
        if (cancelled || !insts) return
        const paidCount    = insts.filter(i => i.status === 'paid').length
        const totalCount   = insts.length
        const totalPaid    = insts.reduce((s, i) => s + Number(i.paid_amount || 0), 0)
        const totalExpected = insts.reduce((s, i) => s + Number(i.expected_amount || 0), 0)
        const penaltiesPaid = insts.reduce((s, i) => s + Number(i.penalty_paid || 0), 0)
        setData({ paidCount, totalCount, totalPaid, totalExpected, penaltiesPaid })
      })
    return () => { cancelled = true }
  }, [loanId, sb])

  const sym = getCcySymbol(currency || 'USD')
  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  if (!data) {
    return (
      <div className="p-4 flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Loading…</span>
      </div>
    )
  }

  const remaining   = Math.max(0, data.totalExpected - data.totalPaid)
  const realProfit  = Math.max(0, data.totalPaid - principalAmount) + data.penaltiesPaid
  const progressPct = data.totalCount > 0 ? Math.round((data.paidCount / data.totalCount) * 100) : 0

  return (
    <div className="p-4 space-y-3 min-w-[260px]">
      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
            {t('loans.hovercard_progress', { paid: String(data.paidCount), total: String(data.totalCount) })}
          </span>
          <span className="text-[10px] font-bold text-primary">{progressPct}%</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-muted/40 px-3 py-2">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">{t('loans.drawer_total_paid')}</p>
          <p className="text-sm font-bold text-emerald-500">{sym}{fmt(data.totalPaid)}</p>
        </div>
        <div className="rounded-lg bg-muted/40 px-3 py-2">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">{t('loans.drawer_remaining')}</p>
          <p className="text-sm font-bold text-rose-500">{sym}{fmt(remaining)}</p>
        </div>
        <div className="rounded-lg bg-muted/40 px-3 py-2">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">{t('loans.sidebar_stats_penalties')}</p>
          <p className="text-sm font-bold text-amber-500">{sym}{fmt(data.penaltiesPaid)}</p>
        </div>
        <div className="rounded-lg bg-muted/40 px-3 py-2">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">{t('loans.hovercard_profit')}</p>
          <p className="text-sm font-bold text-teal-500">{sym}{fmt(realProfit)}</p>
        </div>
      </div>
    </div>
  )
}

// ── Delete Loan Modal (type-name-to-confirm) ────────────────────────────────
function DeleteLoanModal({
  customerName,
  onConfirm,
  onCancel,
}: {
  customerName: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const [input, setInput] = useState('')
  const firstName = customerName.split(' ')[0] || customerName
  const confirmed = input.trim().toLowerCase() === firstName.toLowerCase()

  const copy = () => {
    navigator.clipboard.writeText(firstName).catch(() => {})
  }

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-sm bg-popover ring-1 ring-border rounded-2xl shadow-2xl p-6">
        <div className="flex items-start gap-4 mb-4">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-rose-500/10 shrink-0 mt-0.5">
            <AlertTriangle className="h-5 w-5 text-rose-500" />
          </div>
          <div>
            <h3 className="text-base font-bold text-foreground">Delete loan for <span className="text-rose-500">{firstName}</span>?</h3>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">This action cannot be undone. All installments will be permanently removed.</p>
          </div>
        </div>
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-muted-foreground">Type &quot;<span className="font-bold text-foreground">{firstName}</span>&quot; to confirm</label>
            <button onClick={copy} className="text-xs text-primary hover:underline">Copy</button>
          </div>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={firstName}
            autoFocus
            className="w-full rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/50"
          />
        </div>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors border border-border">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!confirmed}
            className="flex-1 px-4 py-2 text-sm font-medium bg-rose-500 hover:bg-rose-600 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Delete Loan
          </button>
        </div>
      </div>
    </div>
  )
}

export default function LoansPage() {
  const sb = useMemo(() => createClient(), [])
  const { businessId, isLoading: tenantLoading, currency } = useTenant()
  const { t } = useTranslation()
  const subscription = useSubscription()
  const dateFormat = usePreferencesStore(s => s.dateFormat)

  const [loans, setLoans] = useState<LoanWithCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active')

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [editLoanId, setEditLoanId] = useState<string | null>(null)
  const [drawerLoan, setDrawerLoan] = useState<{id: string, name: string, phone?: string | null} | null>(null)

  // Dropdown menu state
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Print context
  const [loanToPrint, setLoanToPrint] = useState<LoanWithCustomer | null>(null)

  // Confirm delete modal
  const [loanToDelete, setLoanToDelete] = useState<string | null>(null)

  // ── Analytics ──────────────────────────────────────────────────────────────
  const [analytics,        setAnalytics]        = useState<LoanAnalytics | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)
  const [metricOrder,      setMetricOrder]      = useState<MetricId[]>(DEFAULT_METRIC_ORDER)
  const [overdueIds,        setOverdueIds]        = useState<Set<string>>(new Set())
  const [selectedCurrency,  setSelectedCurrency]  = useState<string>('all')
  const [analyticsScope,    setAnalyticsScope]    = useState<'active' | 'all'>('active')

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Currency symbol for analytics cards — use the selected filter currency,
  // fallback to business default only when 'all' currencies are shown
  const analyticsCcySymbol = useMemo(() => {
    const ccy = selectedCurrency !== 'all' ? selectedCurrency : (currency || 'USD')
    try {
      const parts = new Intl.NumberFormat('en-GB', { style: 'currency', currency: ccy }).formatToParts(0)
      return parts.find(p => p.type === 'currency')?.value ?? ccy
    } catch { return ccy }
  }, [currency, selectedCurrency])

  const loadLoans = useCallback(async () => {
    if (!businessId) return
    setLoading(true)
    const { data, error } = await sb
      .from('loans')
      .select(`
        id,
        principal_amount,
        interest_rate,
        interest_type,
        total_installments,
        frequency,
        currency,
        status,
        start_date,
        customers ( name, phone )
      `)
      .eq('business_id', businessId)
      .order('start_date', { ascending: false })

    if (error) toast.error(t('loans.error_load'))
    else {
      setLoans(data as unknown as LoanWithCustomer[])

      // Compute overdue status for each loan
      const today = new Date().toISOString().split('T')[0]
      const ids = (data as unknown as LoanWithCustomer[]).map(l => l.id)
      if (ids.length > 0) {
        const { data: overdueRows } = await sb
          .from('loan_installments')
          .select('loan_id')
          .in('loan_id', ids)
          .or(`status.eq.overdue,and(status.in.(pending,partial),due_date.lt.${today})`)
        setOverdueIds(new Set((overdueRows ?? []).map((r: {loan_id: string}) => r.loan_id)))
      }
    }
    setLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, sb])

  const loadAnalytics = useCallback(async () => {
    if (!businessId) return
    setAnalyticsLoading(true)
    const today = new Date().toISOString().split('T')[0]
    // Base currency for conversion: the selected filter, or business default
    const baseCcy = selectedCurrency !== 'all' ? selectedCurrency : (currency || 'GBP')

    let loanQuery = sb
      .from('loans')
      .select('id, principal_amount, currency')
      .eq('business_id', businessId)
      .neq('status', 'cancelled')

    if (analyticsScope === 'active') {
      loanQuery = loanQuery.eq('status', 'active')
    }

    if (selectedCurrency !== 'all') {
      loanQuery = loanQuery.eq('currency', selectedCurrency)
    }

    const { data: loanData } = await loanQuery

    if (!loanData?.length) {
      setAnalytics({ totalLent: 0, profitProjection: 0, penaltiesCollected: 0, inArrears: 0, totalRecovered: 0, totalProfit: 0, totalOutstanding: 0 })
      setAnalyticsLoading(false)
      return
    }

    // Fetch FX rates once for all loans when mixing currencies
    const rates = selectedCurrency === 'all' ? await getRates(baseCcy) : null
    const toBase = (amount: number, fromCcy: string): number => {
      if (!rates || !fromCcy || fromCcy === baseCcy) return amount
      const rate = rates[fromCcy]
      return rate ? amount / rate : amount
    }

    const loanIds = loanData.map(l => l.id)
    // Build a map of loanId → currency for per-row conversion
    const loanCcyMap = new Map(loanData.map(l => [l.id, (l.currency as string) || baseCcy]))
    const totalLent = loanData.reduce((s, l) => s + toBase(Number(l.principal_amount), (l.currency as string) || baseCcy), 0)

    const { data: instsRaw } = await sb
      .from('loan_installments')
      .select('loan_id, expected_amount, paid_amount, penalty_paid, penalty_pending, status, due_date')
      .in('loan_id', loanIds)

    if (!instsRaw) {
      setAnalytics({ totalLent, profitProjection: 0, penaltiesCollected: 0, inArrears: 0, totalRecovered: 0, totalProfit: 0, totalOutstanding: 0 })
      setAnalyticsLoading(false)
      return
    }

    // Apply per-installment currency conversion (each installment inherits its loan's currency)
    const insts = instsRaw.map(i => {
      const ccy = loanCcyMap.get(i.loan_id as string) ?? baseCcy
      return {
        ...i,
        expected_amount:  toBase(Number(i.expected_amount), ccy),
        paid_amount:      toBase(Number(i.paid_amount || 0), ccy),
        penalty_paid:     toBase(Number(i.penalty_paid || 0), ccy),
        penalty_pending:  toBase(Number(i.penalty_pending || 0), ccy),
      }
    })

    const profitProjection   = insts.reduce((s, i) => s + i.expected_amount, 0) - totalLent
    const penaltiesCollected = insts.reduce((s, i) => s + i.penalty_paid, 0)
    const inArrears          = insts
      .filter(i => i.status === 'overdue' || ((i.status === 'pending' || i.status === 'partial') && (i.due_date as string) < today))
      .reduce((s, i) => s + Math.max(0, i.expected_amount - i.paid_amount), 0)
    const totalRecovered     = insts.reduce((s, i) => s + i.paid_amount + i.penalty_paid, 0)
    // Total Profit = realized interest (paid back minus lent) + penalties received
    const interestReceived   = Math.max(0, insts.filter(i => i.status === 'paid').reduce((s, i) => s + i.paid_amount, 0) - totalLent)
    const totalProfit        = interestReceived + penaltiesCollected

    // Total Outstanding = remaining principal + accrued fees across active installments
    const totalOutstanding = insts
      .filter(i => i.status === 'pending' || i.status === 'partial' || i.status === 'overdue')
      .reduce((s, i) => s + Math.max(0, i.expected_amount - i.paid_amount) + i.penalty_pending, 0)

    setAnalytics({ totalLent, profitProjection, penaltiesCollected, inArrears, totalRecovered, totalProfit, totalOutstanding })
    setAnalyticsLoading(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId, sb, selectedCurrency, currency, analyticsScope])

  useEffect(() => {
    if (!tenantLoading) loadLoans()
  }, [tenantLoading, loadLoans])

  useEffect(() => {
    if (!tenantLoading && businessId) loadAnalytics()
  }, [tenantLoading, businessId, loadAnalytics])

  // Load metric order from localStorage after mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(METRIC_STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as MetricId[]
        if (Array.isArray(parsed) && parsed.length === DEFAULT_METRIC_ORDER.length) {
          setMetricOrder(parsed)
        }
      }
    } catch { /* ignore */ }
  }, [])

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null)
        setMenuPos(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = loans.filter(l => {
    const q = query.toLowerCase()
    const name = l.customers?.name || t('loans.customer_anonymous')
    if (q && !name.toLowerCase().includes(q)) return false
    // Tab filter: active = open loans; completed = fully settled or cancelled
    if (activeTab === 'active') return l.status === 'active' || l.status === 'defaulted'
    if (activeTab === 'completed') return l.status === 'paid' || l.status === 'cancelled'
    return true
  }).filter(l => selectedCurrency === 'all' || l.currency === selectedCurrency)

  const handleOpenDrawer = (l: LoanWithCustomer) => {
    setDrawerLoan({
      id: l.id,
      name: l.customers?.name || t('loans.customer_anonymous'),
      phone: l.customers?.phone ?? null,
    })
  }

  // ── Open dropdown with fixed position ──────────────────────────────────────
  const openMenu = (id: string, e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    if (openMenuId === id) {
      setOpenMenuId(null)
      setMenuPos(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    setOpenMenuId(id)
  }

  const handlePrint = (l: LoanWithCustomer) => {
    setOpenMenuId(null)
    setMenuPos(null)
    setLoanToPrint(l)
    setTimeout(() => {
      window.print()
    }, 100)
  }

  // ── Delete Loan ────────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!loanToDelete) return
    const { error } = await sb.from('loans').delete().eq('id', loanToDelete)
    if (error) {
      toast.error(error.message)
    } else {
      toast.success(t('loans.delete_success'))
      setLoans(prev => prev.filter(l => l.id !== loanToDelete))
    }
    setLoanToDelete(null)
  }

  // ── DnD metric cards ───────────────────────────────────────────────────────
  const handleMetricDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIdx = metricOrder.indexOf(active.id as MetricId)
    const newIdx = metricOrder.indexOf(over.id as MetricId)
    const newOrder = arrayMove(metricOrder, oldIdx, newIdx)
    setMetricOrder(newOrder)
    try { localStorage.setItem(METRIC_STORAGE_KEY, JSON.stringify(newOrder)) } catch { /* ignore */ }
  }

  // ── Export CSV ─────────────────────────────────────────────────────────────
  const handleExport = () => {
    if (filtered.length === 0) return toast.error(t('loans.export_empty'))

    const headers = ['Loan ID', 'Customer Name', 'Principal', 'Rate (%)', 'Status', 'Start Date']
    const csvRows = filtered.map(l => [
      l.id,
      l.customers?.name || '',
      l.principal_amount,
      Number(l.interest_rate).toFixed(4),
      l.status,
      l.start_date
    ])

    const csv = [headers, ...csvRows]
      .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `loans_export_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(t('loans.export_success'))
  }

  return (
    <FeatureGate feature="lending" subscription={subscription}>
    <div className="p-6 md:p-8 w-full relative overflow-x-hidden">
      <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('loans.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('loans.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleExport}
            disabled={tenantLoading || !businessId || loading}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {t('loans.export_csv_btn')}
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            disabled={tenantLoading || !businessId}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {t('loans.import_csv_btn')}
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            disabled={tenantLoading || !businessId}
            className="btn-primary gap-2 px-4 py-2 text-sm disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {t('loans.add_btn')}
          </button>
        </div>
      </div>

      {/* ── Analytics Dashboard ── */}
      {/* Currency filter */}
      {/* ── Analytics Scope Toggle ── */}
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">{t('loans.analytics_scope_label')}:</span>
        {(['active', 'all'] as const).map(scope => (
          <button
            key={scope}
            onClick={() => setAnalyticsScope(scope)}
            className={cn(
              'px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors',
              analyticsScope === scope
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:bg-muted'
            )}
          >
            {t(`loans.analytics_scope_${scope}`)}
          </button>
        ))}
      </div>

      {loans.length > 0 && (
        <div className="mb-3 flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground">{t('loans.analytics_currency_filter')}:</span>
          {selectedCurrency === 'all' && (
            <span className="flex items-center gap-1 text-[10px] text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-2 py-0.5">
              <RefreshCw className="h-2.5 w-2.5" />
              {t('loans.fx_converted_hint', { base: currency || 'GBP' })}
            </span>
          )}
          {(['all', ...Array.from(new Set(loans.map(l => l.currency).filter(Boolean)))]).map(ccy => (
            <button
              key={ccy}
              onClick={() => setSelectedCurrency(ccy)}
              className={cn(
                'px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors',
                selectedCurrency === ccy
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:bg-muted'
              )}
            >
              {ccy === 'all' ? t('loans.analytics_currency_all') : ccy}
            </button>
          ))}
        </div>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleMetricDragEnd}>
        <SortableContext items={metricOrder} strategy={horizontalListSortingStrategy}>
          <div className="mb-6 flex gap-3 overflow-x-auto pb-1">
            {metricOrder.map(id => {
              const cfg = METRIC_CONFIGS.find(c => c.id === id)!
              return (
                <SortableMetricCard
                  key={id}
                  cfg={cfg}
                  analytics={analytics}
                  ccySymbol={analyticsCcySymbol}
                  loading={analyticsLoading}
                  t={t}
                />
              )
            })}
          </div>
        </SortableContext>
      </DndContext>

      {/* ── Active / Completed tabs ── */}
      <div className="flex items-center gap-1 mb-5 border-b border-border">
        {(['active', 'completed'] as const).map(tab => {
          const count = loans.filter(l =>
            tab === 'active'
              ? (l.status === 'active' || l.status === 'defaulted')
              : (l.status === 'paid' || l.status === 'cancelled')
          ).length
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors',
                activeTab === tab
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab === 'active' ? t('loans.tab_active') : t('loans.tab_completed')}
              <span className={cn(
                'ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                activeTab === tab ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
              )}>{count}</span>
            </button>
          )
        })}
      </div>

      <div className="mb-5 relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={t('loans.search_placeholder')}
          className="w-full rounded-lg border border-border bg-muted/30 pl-9 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center bg-card">
          <Banknote className="mx-auto h-10 w-10 text-muted-foreground/25 mb-3" />
          <p className="text-sm font-medium text-foreground">
            {query ? t('loans.no_results') : t('loans.empty_title')}
          </p>
          {!query && (
            <p className="text-xs text-muted-foreground mt-1 mb-5">{t('loans.empty_desc')}</p>
          )}
        </div>
      ) : (
        <>
        {/* ── Mobile Card List (sm and below) ── */}
        <div className="md:hidden space-y-3">
          {filtered.map((l) => (
            <div
              key={l.id}
              onClick={() => handleOpenDrawer(l)}
              className="rounded-xl border border-border bg-card px-4 py-3.5 cursor-pointer hover:border-primary/30 transition-colors"
            >
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn(
                    "w-2 h-2 rounded-full shrink-0",
                    l.status !== 'active' ? "bg-muted-foreground/30" :
                    overdueIds.has(l.id) ? "bg-rose-500" : "bg-emerald-500"
                  )} />
                  <p className="text-sm font-semibold text-foreground truncate">
                    {l.customers?.name || <span className="text-muted-foreground italic font-normal">{t('loans.customer_anonymous')}</span>}
                  </p>
                </div>
                <span className={cn(
                  "shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide border",
                  l.status === 'active' ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" :
                  l.status === 'paid' ? "bg-primary/10 text-primary border-primary/20" :
                  l.status === 'defaulted' ? "bg-rose-500/10 text-rose-600 border-rose-500/20" :
                  "bg-muted text-muted-foreground border-transparent"
                )}>
                  {t(`loans.status_${l.status}`)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-semibold text-foreground text-sm">
                  {getCcySymbol(l.currency || 'USD')}{Number(l.principal_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span>{Number(l.interest_rate).toFixed(2)}% · {l.total_installments}× {t(`loans.freq_${l.frequency || 'monthly'}`)}</span>
                <span>{formatDateGlobal(l.start_date, dateFormat)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* ── Desktop Table: overflow-visible so fixed dropdown escapes the rounded container ── */}
        <div className="hidden md:block rounded-xl border border-border bg-card shadow-sm overflow-visible">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider rounded-tl-xl">{t('loans.col_customer')}</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('loans.col_principal')}</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('loans.col_rate')}</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('loans.col_installments')}</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('loans.col_start_date')}</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{t('loans.col_status')}</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold text-muted-foreground uppercase tracking-wider rounded-tr-xl">{t('loans.col_actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((l, idx) => (
                <tr
                  key={l.id}
                  className={cn(
                    "hover:bg-muted/30 transition-colors cursor-pointer group",
                    idx === filtered.length - 1 && "last:rounded-b-xl"
                  )}
                  onClick={() => handleOpenDrawer(l)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        l.status !== 'active' ? "bg-muted-foreground/30" :
                        overdueIds.has(l.id) ? "bg-rose-500" : "bg-emerald-500"
                      )} title={overdueIds.has(l.id) ? t('loans.status_dot_late') : t('loans.status_dot_ok')} />
                      <HoverCard
                        side="right"
                        trigger={
                          <span className="font-semibold text-foreground cursor-default">
                            {l.customers?.name || <span className="text-muted-foreground italic font-normal">{t('loans.customer_anonymous')}</span>}
                          </span>
                        }
                        content={
                          <LoanHoverContent
                            loanId={l.id}
                            currency={l.currency}
                            principalAmount={Number(l.principal_amount)}
                            t={t}
                          />
                        }
                      />
                      {l.customers?.phone && (
                        <a
                          href={`https://wa.me/${l.customers.phone.replace(/\D/g, '')}?text=${encodeURIComponent(t('loans.whatsapp_loan_summary').replace('{name}', l.customers.name || '').replace('{amount}', `${getCcySymbol(l.currency)}${Number(l.principal_amount).toFixed(2)}`).replace('{status}', l.status))}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="ml-1 text-green-500 hover:text-green-600 opacity-0 group-hover:opacity-100 transition-all"
                          title="WhatsApp"
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-semibold text-foreground">
                    {getCcySymbol(l.currency || 'USD')}{Number(l.principal_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {Number(l.interest_rate).toFixed(2)}%
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5 text-muted-foreground/50" />
                      <span>{l.total_installments}× {t(`loans.freq_${l.frequency || 'monthly'}`)}</span>
                      <span className="text-[9px] uppercase font-bold tracking-wider border ml-1 px-1 rounded text-muted-foreground/70">{t(`loans.type_${l.interest_type}`)}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDateGlobal(l.start_date, dateFormat)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide border",
                      l.status === 'active' ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" :
                      l.status === 'paid' ? "bg-primary/10 text-primary border-primary/20" :
                      l.status === 'defaulted' ? "bg-rose-500/10 text-rose-600 border-rose-500/20" :
                      "bg-muted text-muted-foreground border-transparent"
                    )}>
                      {t(`loans.status_${l.status}`)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        className="inline-flex items-center justify-center p-2 rounded-lg text-primary hover:bg-primary/10 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        title={t('loans.view_schedule')}
                        onClick={e => { e.stopPropagation(); handleOpenDrawer(l) }}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {l.status === 'active' && (
                        <button
                          className="inline-flex items-center justify-center p-2 rounded-lg text-amber-500 hover:bg-amber-500/10 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                          title={t('loans.edit_loan_btn')}
                          onClick={e => { e.stopPropagation(); setEditLoanId(l.id) }}
                        >
                          <TrendingDown className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        className="inline-flex items-center justify-center p-2 rounded-lg text-rose-500 hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        title={t('loans.delete_loan_btn')}
                        onClick={e => { e.stopPropagation(); setLoanToDelete(l.id) }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <button
                        className="inline-flex items-center justify-center p-2 rounded-lg text-muted-foreground hover:bg-muted transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                        onClick={e => openMenu(l.id, e)}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}

      {/* Fixed-position dropdown — escapes any overflow-hidden ancestor */}
      {openMenuId && menuPos && (
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 9999 }}
          className="w-44 bg-popover border border-border rounded-xl shadow-xl py-1 animate-in fade-in slide-in-from-top-1 duration-100"
        >
          <button
            onClick={e => {
              e.stopPropagation()
              const targetLoan = loans.find(l => l.id === openMenuId)
              if (targetLoan) handlePrint(targetLoan)
            }}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors border-b border-border"
          >
            <Printer className="h-4 w-4" />
            {t('loans.print_contract_btn')}
          </button>
          <button
            onClick={e => {
              e.stopPropagation()
              setOpenMenuId(null)
              setMenuPos(null)
              setLoanToDelete(openMenuId)
            }}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-500/10 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            {t('loans.delete_loan_btn')}
          </button>
        </div>
      )}

      {showCreateModal && (
        <CreateLoanModal
          onClose={() => setShowCreateModal(false)}
          onCreated={loadLoans}
        />
      )}

      {editLoanId && (
        <CreateLoanModal
          editLoanId={editLoanId}
          onClose={() => setEditLoanId(null)}
          onCreated={() => { setEditLoanId(null); loadLoans(); loadAnalytics() }}
        />
      )}

      {showImportModal && (
        <ImportLoansModal
          onClose={() => setShowImportModal(false)}
          onImported={loadLoans}
        />
      )}

      {drawerLoan && (
        <>
          <div className="fixed inset-0 z-[9998] bg-black/20 backdrop-blur-sm" onClick={() => { setDrawerLoan(null); loadLoans() }} />
          <InstallmentsDrawer
            loanId={drawerLoan.id}
            customerName={drawerLoan.name}
            customerPhone={drawerLoan.phone}
            onClose={() => { setDrawerLoan(null); loadLoans() }}
          />
        </>
      )}

      {/* Custom Delete Confirm Modal */}
      {loanToDelete && (() => {
        const loan = loans.find(l => l.id === loanToDelete)
        const name = loan?.customers?.name || t('loans.customer_anonymous')
        return (
          <DeleteLoanModal
            customerName={name}
            onConfirm={confirmDelete}
            onCancel={() => setLoanToDelete(null)}
          />
        )
      })()}

      {/* Visually hidden promissory note just for print */}
      {loanToPrint && (
        <div className="absolute opacity-0 pointer-events-none">
          <PromissoryNote
            customerName={loanToPrint.customers?.name || ''}
            principalAmount={loanToPrint.principal_amount}
            interestRate={loanToPrint.interest_rate}
            totalInstallments={loanToPrint.total_installments}
            startDate={loanToPrint.start_date}
          />
        </div>
      )}
    </div>
    </FeatureGate>
  )
}
