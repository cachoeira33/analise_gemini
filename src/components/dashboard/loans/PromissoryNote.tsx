'use client'

import { forwardRef } from 'react'
import { formatDateGlobal } from '@/lib/formatDate'
import { useTranslation } from '@/hooks/useTranslation'
import { usePreferencesStore } from '@/lib/stores/usePreferencesStore'

interface PromissoryNoteProps {
  customerName: string
  principalAmount: number
  interestRate: number
  totalInstallments: number
  startDate: string
}

export const PromissoryNote = forwardRef<HTMLDivElement, PromissoryNoteProps>(
  ({ customerName, principalAmount, interestRate, totalInstallments, startDate }, ref) => {
    const { t } = useTranslation()
    const dateFormat = usePreferencesStore(s => s.dateFormat)

    return (
      <div ref={ref} className="hidden print:block print:p-12 print:bg-white print:text-black font-serif fixed inset-0 z-[99999] bg-white">
        <h1 className="text-3xl font-bold text-center mb-10 uppercase tracking-widest">{t('loans.promissory_title')}</h1>
        
        <div className="space-y-6 text-lg leading-relaxed">
          <p>
            {t('loans.promissory_body')
              ?.replace('{date}', formatDateGlobal(new Date().toISOString(), dateFormat))
              ?.replace('{borrower}', customerName || '____________________') || ''}
          </p>

          <table className="w-full mt-8 mb-12 border-collapse border border-black text-left">
            <tbody>
              <tr>
                <th className="border border-black p-3 w-1/2">{t('loans.col_principal')}</th>
                <td className="border border-black p-3">${Number(principalAmount).toFixed(2)}</td>
              </tr>
              <tr>
                <th className="border border-black p-3">{t('loans.col_start_date')}</th>
                <td className="border border-black p-3">{formatDateGlobal(startDate, dateFormat)}</td>
              </tr>
              <tr>
                <th className="border border-black p-3">{t('loans.col_installments')}</th>
                <td className="border border-black p-3">{totalInstallments}</td>
              </tr>
              <tr>
                <th className="border border-black p-3">{t('loans.col_rate')}</th>
                <td className="border border-black p-3">{Number(interestRate).toFixed(2)}%</td>
              </tr>
            </tbody>
          </table>

          <div className="mt-32 pt-8 text-center w-2/3 mx-auto">
            <div className="border-t-2 border-black pt-2 uppercase font-bold tracking-widest">
              {t('loans.borrower_signature')}
            </div>
            <p className="mt-2 font-bold">{customerName || '____________________'}</p>
          </div>
        </div>
      </div>
    )
  }
)

PromissoryNote.displayName = 'PromissoryNote'
