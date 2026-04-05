'use client'

import { X, Check, Minus, Zap, Star, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/hooks/useTranslation'

interface Props {
  isOpen: boolean
  onClose: () => void
  onUpgrade?: (planKey: 'starter' | 'professional' | 'enterprise') => Promise<void>
}

const FEATURES = [
  { name: 'Multi-business info', starter: '1 Business', pro: '3 Businesses', enterprise: 'Unlimited' },
  { name: 'Team Members', starter: '1 User', pro: '3 Users', enterprise: 'Unlimited' },
  { name: 'Monthly Transactions', starter: '500', pro: '5,000', enterprise: 'Unlimited' },
  { name: 'Monte Carlo Forecasting', starter: false, pro: true, enterprise: true },
  { name: 'Financial Kanban Board', starter: true, pro: true, enterprise: true },
  { name: 'Hiring Cost Simulator', starter: false, pro: false, enterprise: true },
  { name: 'Collector Routing', starter: false, pro: 'Up to 2', enterprise: 'Unlimited' },
  { name: 'Automated WhatsApp', starter: 'Add-on', pro: 'Add-on', enterprise: 'Included' },
  { name: 'Shift Control', starter: false, pro: false, enterprise: true },
  { name: 'Stealth GPS Auditor', starter: false, pro: 'Add-on', enterprise: true },
  { name: 'White-label Branding', starter: false, pro: false, enterprise: true },
  { name: 'Priority Support', starter: 'Email', pro: 'Email', enterprise: '24/7 Priority' },
]

export function PricingComparisonModal({ isOpen, onClose, onUpgrade }: Props) {
  const { t } = useTranslation()
  const [upgrading, setUpgrading] = useState<'starter' | 'professional' | 'enterprise' | null>(null)

  if (!isOpen) return null

  async function handleUpgrade(planKey: 'starter' | 'professional' | 'enterprise') {
    if (!onUpgrade || upgrading) return
    setUpgrading(planKey)
    try {
      await onUpgrade(planKey)
    } finally {
      setUpgrading(null)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-4xl bg-card border border-border rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-border flex items-center justify-between bg-muted/30">
          <div>
            <h2 className="text-2xl font-bold text-foreground">{t('pricing_modal.title')}</h2>
            <p className="text-sm text-muted-foreground">{t('pricing_modal.subtitle')}</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="sticky top-0 bg-card/80 backdrop-blur-md z-10">
                <th className="p-6 text-sm font-medium text-muted-foreground border-b border-border w-1/3">{t('pricing_modal.col_feature')}</th>
                <th className="p-6 text-center border-b border-border">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('billing.plans.starter')}</span>
                    <span className="text-lg font-bold text-foreground">£97</span>
                    <span className="text-[10px] text-muted-foreground">{t('pricing_modal.lifetime')}</span>
                    {onUpgrade && (
                      <button
                        onClick={() => handleUpgrade('starter')}
                        disabled={!!upgrading}
                        className="mt-2 flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                      >
                        {upgrading === 'starter' && <Loader2 className="h-3 w-3 animate-spin" />}
                        Buy once
                      </button>
                    )}
                  </div>
                </th>
                <th className="p-6 text-center border-b border-border bg-indigo-500/5">
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-1 text-indigo-400">
                      <Star className="h-3 w-3 fill-indigo-400" />
                      <span className="text-xs font-bold uppercase tracking-wider">{t('billing.plans.professional')}</span>
                    </div>
                    <span className="text-lg font-bold text-foreground">£29</span>
                    <span className="text-[10px] text-muted-foreground">{t('pricing_modal.monthly')}</span>
                    {onUpgrade && (
                      <button
                        onClick={() => handleUpgrade('professional')}
                        disabled={!!upgrading}
                        className="mt-2 flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 transition-colors disabled:opacity-50"
                      >
                        {upgrading === 'professional' && <Loader2 className="h-3 w-3 animate-spin" />}
                        {t('pricing_modal.upgrade_now')}
                      </button>
                    )}
                  </div>
                </th>
                <th className="p-6 text-center border-b border-border">
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-1 text-violet-400">
                      <Zap className="h-3 w-3 fill-violet-400" />
                      <span className="text-xs font-bold uppercase tracking-wider">{t('billing.plans.enterprise')}</span>
                    </div>
                    <span className="text-lg font-bold text-foreground">£99</span>
                    <span className="text-[10px] text-muted-foreground">{t('pricing_modal.monthly')}</span>
                    {onUpgrade && (
                      <button
                        onClick={() => handleUpgrade('enterprise')}
                        disabled={!!upgrading}
                        className="mt-2 flex items-center gap-1 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs font-semibold text-violet-300 hover:bg-violet-500/20 transition-colors disabled:opacity-50"
                      >
                        {upgrading === 'enterprise' && <Loader2 className="h-3 w-3 animate-spin" />}
                        Get started
                      </button>
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {FEATURES.map((f, i) => (
                <tr key={f.name} className={cn("hover:bg-muted/30 transition-colors", i % 2 === 0 ? "bg-muted/10" : "bg-transparent")}>
                  <td className="p-4 pl-6 text-sm font-medium text-foreground">{f.name}</td>
                  <td className="p-4 text-center text-sm text-slate-400">
                    <CellContent value={f.starter} />
                  </td>
                  <td className="p-4 text-center text-sm text-slate-300 bg-indigo-500/5">
                    <CellContent value={f.pro} />
                  </td>
                  <td className="p-4 text-center text-sm text-slate-300">
                    <CellContent value={f.enterprise} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer CTAs */}
        <div className="p-6 bg-muted/30 border-t border-border flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2.5 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('common.actions.close')}
          </button>
          {onUpgrade ? (
            <button
              onClick={() => handleUpgrade('professional')}
              disabled={!!upgrading}
              className="btn-primary flex items-center gap-2 px-8 py-2.5 text-sm disabled:opacity-60"
            >
              {upgrading === 'professional' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {t('pricing_modal.upgrade_now')}
            </button>
          ) : (
            <button
              onClick={onClose}
              className="btn-primary px-8 py-2.5 text-sm"
            >
              {t('pricing_modal.upgrade_now')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function CellContent({ value }: { value: string | boolean }) {
  if (typeof value === 'boolean') {
    return value ? (
      <div className="flex justify-center">
        <div className="h-5 w-5 rounded-full bg-emerald-500/10 flex items-center justify-center">
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        </div>
      </div>
    ) : (
      <div className="flex justify-center">
        <Minus className="h-4 w-4 text-muted-foreground/30" />
      </div>
    )
  }
  return <span>{value}</span>
}
