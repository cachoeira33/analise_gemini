import type { SupabaseClient } from '@supabase/supabase-js'

type AgreementKind = 'initial' | 'renegotiation' | 'renewal' | 'manual_restructure'

export async function ensureInitialLoanAgreement(
  sb: SupabaseClient,
  loanId: string,
): Promise<string> {
  const { data, error } = await sb.rpc('create_initial_loan_agreement', {
    p_loan_id: loanId,
  })

  if (error) throw error
  return data as string
}

export async function getActiveLoanAgreementId(
  sb: SupabaseClient,
  loanId: string,
): Promise<string | null> {
  const { data, error } = await sb
    .from('loan_agreements')
    .select('id')
    .eq('loan_id', loanId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw error
  return data?.id ?? null
}

export async function replaceActiveLoanAgreement(
  sb: SupabaseClient,
  params: {
    loanId: string
    kind: AgreementKind
    principalBase: number
    penaltyBase: number
    interestRatePct: number
    interestAmount: number
    totalAmount: number
    totalInstallments: number
    frequency: string
    firstDueDate: string
    metadata?: Record<string, unknown>
  },
): Promise<string> {
  const { data, error } = await sb.rpc('replace_active_loan_agreement', {
    p_loan_id: params.loanId,
    p_kind: params.kind,
    p_principal_base: params.principalBase,
    p_penalty_base: params.penaltyBase,
    p_interest_rate_pct: params.interestRatePct,
    p_interest_amount: params.interestAmount,
    p_total_amount: params.totalAmount,
    p_total_installments: params.totalInstallments,
    p_frequency: params.frequency,
    p_first_due_date: params.firstDueDate,
    p_metadata: params.metadata ?? {},
  })

  if (error) throw error
  return data as string
}
