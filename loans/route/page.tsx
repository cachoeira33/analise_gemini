'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { useTranslation } from '@/hooks/useTranslation'
import { Loader2, Search, MapPin, Phone, AlertCircle, ChevronRight } from 'lucide-react'
import { InstallmentsDrawer } from '@/components/dashboard/loans/InstallmentsDrawer'

interface RouteInstallment {
  id: string
  installment_number: number
  due_date: string
  expected_amount: number
  paid_amount: number
  status: 'pending' | 'partial' | 'overdue'
  loans: {
    id: string
    collector_id: string | null
    customers: {
      name: string
      phone: string | null
      address: string | null
    } | null
  }
}

import { useMyShift } from '@/hooks/useMyShift'
import { Lock } from 'lucide-react'

export default function RouteDashboard() {
  const sb = useMemo(() => createClient(), [])
  const { businessId } = useTenant()
  const { t } = useTranslation()
  const { isOnShift, loading: shiftLoading } = useMyShift()

  const [installments, setInstallments] = useState<RouteInstallment[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null)

  const fetchRoute = async () => {
    if (!businessId || !isOnShift) return
    setLoading(true)
    
    // We only want defaults/pending up to Today
    const today = new Date().toISOString().split('T')[0]
    const { data: userData } = await sb.auth.getUser()
    const uid = userData.user?.id

    if (!uid) return

    const { data, error } = await sb
      .from('loan_installments')
      .select(`
        id,
        installment_number,
        due_date,
        expected_amount,
        paid_amount,
        status,
        loans!inner (
          id,
          business_id,
          collector_id,
          customers (
            name,
            phone,
            address
          )
        )
      `)
      .in('status', ['pending', 'partial', 'overdue'])
      .lte('due_date', today)
      .eq('loans.business_id', businessId)
      // Even though RLS protects employees, owners might be assigned specifically.
      .eq('loans.collector_id', uid)
      .order('due_date', { ascending: true })

    if (!error && data) {
      setInstallments(data as unknown as RouteInstallment[])
    }
    setLoading(false)
  }

  useEffect(() => {
    if (isOnShift) fetchRoute()
  }, [businessId, sb, isOnShift])

  const filtered = installments.filter(inst => {
    const q = search.toLowerCase()
    const c = inst.loans?.customers
    if (!c) return false
    return (
      c.name.toLowerCase().includes(q) ||
      (c.address && c.address.toLowerCase().includes(q)) ||
      (c.phone && c.phone.toLowerCase().includes(q))
    )
  })

  const formatMoney = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  if (shiftLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  if (!isOnShift) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-140px)] p-8 text-center bg-slate-950">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-rose-500/10 border border-rose-500/20 shadow-xl shadow-rose-500/5">
          <Lock className="h-10 w-10 text-rose-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">{t('shifts.off_duty')}</h2>
        <p className="text-slate-400 max-w-sm mx-auto leading-relaxed">
          {t('shifts.off_duty_desc')}
        </p>
        <div className="mt-8 flex gap-4">
          <button 
            onClick={() => window.location.reload()}
            className="btn-secondary px-6"
          >
            Check Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-64px)] bg-background lg:h-auto lg:min-h-[calc(100vh-80px)]">
      {/* Header */}
      <div className="p-4 border-b border-border bg-card top-0 z-10 sticky">
        <h1 className="text-xl font-bold text-foreground mb-3">{t('loans.route_title') || "Today's Route"}</h1>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={t('loans.route_search_placeholder') || 'Filter by name, address, phone...'}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-muted/30 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-24">
        {loading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center bg-muted/20 border border-dashed border-border rounded-xl">
            <AlertCircle className="h-8 w-8 text-muted-foreground mb-3 opacity-50" />
            <p className="text-sm font-medium text-muted-foreground">
              {t('loans.route_empty') || 'No collections scheduled for today!'}
            </p>
          </div>
        ) : (
          filtered.map(inst => {
            const customer = inst.loans.customers
            const remaining = inst.expected_amount - inst.paid_amount
            const isOverdue = inst.status === 'overdue'

            return (
              <div 
                key={inst.id} 
                onClick={() => setSelectedLoanId(inst.loans.id)}
                className="bg-card border border-border rounded-xl p-4 shadow-sm active:scale-[0.98] transition-all cursor-pointer select-none relative overflow-hidden group"
              >
                {/* Status Indicator */}
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${isOverdue ? 'bg-destructive' : 'bg-amber-500'}`} />
                
                <div className="pl-2 flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-semibold text-foreground truncate max-w-[200px]">
                      {customer?.name || 'Unknown'}
                    </h3>
                    <p className="text-xs font-medium text-muted-foreground mt-0.5">
                      {isOverdue ? t('loans.status_overdue') || 'OVERDUE' : t('loans.status_pending') || 'PENDING'} 
                      {' • '} Parcela #{inst.installment_number}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-bold ${isOverdue ? 'text-destructive' : 'text-amber-500'}`}>
                      ${formatMoney(remaining)}
                    </p>
                  </div>
                </div>

                <div className="pl-2 space-y-1.5 mt-3">
                  {customer?.address && (
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                      <span className="line-clamp-2">{customer.address}</span>
                    </div>
                  )}
                  {customer?.phone && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Phone className="h-4 w-4 shrink-0" />
                      <span>{customer.phone}</span>
                    </div>
                  )}
                </div>

                <div className="pl-2 mt-4 pt-3 border-t border-border/50 flex justify-between items-center group-hover:text-primary transition-colors">
                  <span className="text-sm font-medium">{t('loans.receive_btn') || 'Receive Payment'}</span>
                  <ChevronRight className="h-4 w-4" />
                </div>
              </div>
            )
          })
        )}
      </div>

      {selectedLoanId && (
        <InstallmentsDrawer 
          loanId={selectedLoanId}
          customerName={installments.find(i => i.loans.id === selectedLoanId)?.loans.customers?.name || 'Unknown'}
          onClose={() => {
            setSelectedLoanId(null)
            fetchRoute()
          }} 
        />
      )}
    </div>
  )
}
