'use client'

import { useState, useRef, useMemo } from 'react'
import { X, Upload, Loader2, CheckCircle2, AlertCircle, FileText } from 'lucide-react'
import { toast } from 'sonner'
import Papa from 'papaparse'
import { createClient } from '@/lib/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { useTranslation } from '@/hooks/useTranslation'

interface CsvRow {
  'Customer Name': string
  'Principal': string
  'Rate': string
  'Installments': string
  'Interest Type'?: string
  'Start Date'?: string
}

interface ImportResult {
  row: number
  customer: string
  status: 'success' | 'error'
  message?: string
}

export function ImportLoansModal({
  onClose,
  onImported
}: {
  onClose: () => void
  onImported: () => void
}) {
  const sb = useMemo(() => createClient(), [])
  const { businessId } = useTenant()
  const { t } = useTranslation()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<CsvRow[]>([])
  const [fileName, setFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [results, setResults] = useState<ImportResult[]>([])
  const [done, setDone] = useState(false)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setResults([])
    setDone(false)

    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        setRows(result.data)
      },
      error: (err) => {
        toast.error(`CSV parse error: ${err.message}`)
      }
    })
  }

  // ── Customer Resolution ────────────────────────────────────────────────────
  // Strategy: match by exact name within the business. If not found, create a
  // minimal customer record in the CRM so the loan has a proper FK reference.
  const resolveCustomer = async (name: string): Promise<string | null> => {
    const trimmed = name.trim()
    if (!trimmed || !businessId) return null

    // 1. Try to find existing customer
    const { data: existing } = await sb
      .from('customers')
      .select('id')
      .eq('business_id', businessId)
      .ilike('name', trimmed)
      .limit(1)
      .single()

    if (existing) return existing.id

    // 2. Create new CRM customer on the fly
    const { data: created, error } = await sb
      .from('customers')
      .insert({
        business_id: businessId,
        name: trimmed,
        status: 'lead'
      })
      .select('id')
      .single()

    if (error) return null
    return created.id
  }

  // ── Import Handler ─────────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!rows.length || !businessId) return
    setImporting(true)
    const newResults: ImportResult[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const rowNum = i + 1
      const customerName = row['Customer Name'] || ''
      const principal = parseFloat(row['Principal'])
      const ratePercent = parseFloat(row['Rate'])
      const installments = parseInt(row['Installments'], 10)
      const interestType = (row['Interest Type'] || 'compound').toLowerCase()
      const startDate = row['Start Date'] || new Date().toISOString().split('T')[0]

      // Validate
      if (isNaN(principal) || principal <= 0) {
        newResults.push({ row: rowNum, customer: customerName, status: 'error', message: t('loans.import_err_principal') })
        continue
      }
      if (isNaN(ratePercent) || ratePercent < 0) {
        newResults.push({ row: rowNum, customer: customerName, status: 'error', message: t('loans.import_err_rate') })
        continue
      }
      if (isNaN(installments) || installments <= 0) {
        newResults.push({ row: rowNum, customer: customerName, status: 'error', message: t('loans.import_err_installments') })
        continue
      }

      try {
        // Resolve / create customer
        const customerId = customerName ? await resolveCustomer(customerName) : null

        // Insert loan
        const { data: loan, error: loanErr } = await sb
          .from('loans')
          .insert({
            business_id: businessId,
            customer_id: customerId,
            principal_amount: principal,
            interest_rate: ratePercent / 100,
            interest_type: interestType === 'simple' ? 'simple' : 'compound',
            total_installments: installments,
            start_date: startDate,
            status: 'active'
          })
          .select('id')
          .single()

        if (loanErr) throw new Error(loanErr.message)

        // Generate installments via RPC
        const { error: rpcErr } = await sb.rpc('generate_loan_installments', {
          p_loan_id: loan.id
        })
        if (rpcErr) throw new Error(rpcErr.message)

        newResults.push({ row: rowNum, customer: customerName || t('loans.customer_anonymous'), status: 'success' })
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        newResults.push({ row: rowNum, customer: customerName, status: 'error', message })
      }
    }

    setResults(newResults)
    setImporting(false)
    setDone(true)

    const successCount = newResults.filter(r => r.status === 'success').length
    if (successCount > 0) {
      toast.success(t('loans.import_success').replace('{n}', String(successCount)))
      onImported()
    }
  }

  const successCount = results.filter(r => r.status === 'success').length
  const errorCount = results.filter(r => r.status === 'error').length

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-popover ring-1 ring-border rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border shrink-0">
          <div>
            <h3 className="text-lg font-bold text-foreground">{t('loans.import_modal_title')}</h3>
            <p className="text-sm text-muted-foreground mt-0.5">{t('loans.import_modal_subtitle')}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* CSV Format hint */}
          <div className="bg-muted/30 border border-border rounded-lg p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{t('loans.import_format_label')}</p>
            <code className="text-[11px] text-foreground font-mono leading-relaxed block">
              Customer Name, Principal, Rate, Installments, Interest Type, Start Date
            </code>
            <p className="text-[11px] text-muted-foreground mt-2">{t('loans.import_format_hint')}</p>
          </div>

          {/* File picker */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-border rounded-xl py-8 flex flex-col items-center gap-3 hover:border-primary/50 hover:bg-primary/5 transition-colors"
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  {fileName || t('loans.import_pick_file')}
                </p>
                {rows.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {t('loans.import_rows_found').replace('{n}', String(rows.length))}
                  </p>
                )}
              </div>
            </button>
          </div>

          {/* Preview table */}
          {rows.length > 0 && !done && (
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/30 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-muted-foreground font-semibold">{t('loans.col_customer')}</th>
                      <th className="px-3 py-2 text-left text-muted-foreground font-semibold">{t('loans.col_principal')}</th>
                      <th className="px-3 py-2 text-left text-muted-foreground font-semibold">{t('loans.col_rate')}</th>
                      <th className="px-3 py-2 text-left text-muted-foreground font-semibold">#</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.slice(0, 10).map((r, i) => (
                      <tr key={i} className="hover:bg-muted/20">
                        <td className="px-3 py-2 text-foreground">{r['Customer Name'] || '—'}</td>
                        <td className="px-3 py-2 text-foreground">{r['Principal']}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r['Rate']}%</td>
                        <td className="px-3 py-2 text-muted-foreground">{r['Installments']}</td>
                      </tr>
                    ))}
                    {rows.length > 10 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-2 text-center text-muted-foreground">
                          +{rows.length - 10} {t('loans.import_more_rows')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Results */}
          {done && results.length > 0 && (
            <div className="space-y-3">
              <div className="flex gap-3">
                {successCount > 0 && (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {successCount} {t('loans.import_ok')}
                  </span>
                )}
                {errorCount > 0 && (
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-rose-600 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-lg">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {errorCount} {t('loans.import_fail')}
                  </span>
                )}
              </div>
              <div className="rounded-lg border border-border overflow-hidden max-h-48 overflow-y-auto">
                {results.map((r, i) => (
                  <div key={i} className={`flex items-start gap-3 px-4 py-3 text-xs border-b border-border last:border-0 ${r.status === 'error' ? 'bg-rose-500/5' : 'bg-emerald-500/5'}`}>
                    {r.status === 'success'
                      ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mt-0.5 shrink-0" />
                      : <AlertCircle className="h-3.5 w-3.5 text-rose-500 mt-0.5 shrink-0" />
                    }
                    <div>
                      <span className="font-semibold text-foreground">Row {r.row} — {r.customer}</span>
                      {r.message && <p className="text-muted-foreground mt-0.5">{r.message}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex gap-3 shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors border border-border"
          >
            {done ? t('loans.import_close') : t('loans.cancel_btn')}
          </button>
          {!done && (
            <button
              onClick={handleImport}
              disabled={importing || rows.length === 0}
              className="flex-1 btn-primary gap-2 px-4 py-2 text-sm disabled:opacity-50"
            >
              {importing ? (
                <><Loader2 className="h-4 w-4 animate-spin" />{t('loans.import_progress')}</>
              ) : (
                <><FileText className="h-4 w-4" />{t('loans.import_btn')}</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
