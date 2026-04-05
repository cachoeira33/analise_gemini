export interface LoanPaymentHistoryEntry {
  amount?: number | string | null
  penalty_paid?: number | string | null
  date?: string | null
  forgiven_principal?: number | string | null
  forgiven_penalty?: number | string | null
}

export interface LoanFinancialInstallmentInput {
  id?: string
  installment_number?: number | null
  due_date?: string | null
  expected_amount?: number | string | null
  paid_amount?: number | string | null
  penalty_paid?: number | string | null
  penalty_pending?: number | string | null
  penalty_waived?: number | string | null
  status?: string | null
  payment_history?: LoanPaymentHistoryEntry[] | null
}

export interface LoanFinancialBreakdown {
  grossCollected: number
  principalRecovered: number
  realizedBaseProfit: number
  realizedProfit: number
  futureProfit: number
  totalOperationProfit: number
  activeOutstanding: number
  totalOutstanding: number
  inArrears: number
  penaltiesCollected: number
  penaltiesPending: number
  penaltiesWaived: number
  paidCount: number
  totalCount: number
  principalRemaining: number
}

const ACTIVE_STATUSES = new Set(['pending', 'partial', 'overdue'])

function toSafeNumber(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function sortInstallments(a: LoanFinancialInstallmentInput, b: LoanFinancialInstallmentInput): number {
  const dueA = a.due_date ?? ''
  const dueB = b.due_date ?? ''
  if (dueA !== dueB) return dueA.localeCompare(dueB)

  const numberA = a.installment_number ?? Number.MAX_SAFE_INTEGER
  const numberB = b.installment_number ?? Number.MAX_SAFE_INTEGER
  if (numberA !== numberB) return numberA - numberB

  return 0
}

export function sumPaymentHistoryAmount(history?: LoanPaymentHistoryEntry[] | null): number {
  return (history ?? []).reduce((sum, entry) => sum + Math.max(0, toSafeNumber(entry.amount)), 0)
}

export function sumPaymentHistoryPenalty(history?: LoanPaymentHistoryEntry[] | null): number {
  return (history ?? []).reduce((sum, entry) => sum + Math.max(0, toSafeNumber(entry.penalty_paid)), 0)
}

export function getEffectivePaidAmount(installment: LoanFinancialInstallmentInput): number {
  const historyPaid = sumPaymentHistoryAmount(installment.payment_history)
  const rowPaid = Math.max(0, toSafeNumber(installment.paid_amount))

  return historyPaid > 0 ? historyPaid : rowPaid
}

export function getEffectivePenaltyPaid(installment: LoanFinancialInstallmentInput): number {
  const historyPenalty = sumPaymentHistoryPenalty(installment.payment_history)
  const rowPenalty = Math.max(0, toSafeNumber(installment.penalty_paid))

  return Math.max(historyPenalty, rowPenalty)
}

export function computeLoanFinancialBreakdown({
  principalAmount,
  installments,
  today,
}: {
  principalAmount: number
  installments: LoanFinancialInstallmentInput[]
  today?: string
}): LoanFinancialBreakdown {
  const safePrincipal = Math.max(0, toSafeNumber(principalAmount))
  const ordered = [...installments].sort(sortInstallments)
  const currentDay = today ?? new Date().toISOString().split('T')[0]

  let principalRemaining = safePrincipal
  let principalRecovered = 0
  let realizedBaseProfit = 0
  let grossCollected = 0
  let penaltiesCollected = 0
  let penaltiesPending = 0
  let penaltiesWaived = 0
  let activeOutstanding = 0
  let inArrears = 0
  let paidCount = 0

  for (const installment of ordered) {
    const expectedAmount = Math.max(0, toSafeNumber(installment.expected_amount))
    const paidAmount = getEffectivePaidAmount(installment)
    const penaltyPaid = getEffectivePenaltyPaid(installment)
    const penaltyPending = Math.max(0, toSafeNumber(installment.penalty_pending))
    const penaltyWaived = Math.max(0, toSafeNumber(installment.penalty_waived))
    const status = installment.status ?? 'pending'
    const isActive = ACTIVE_STATUSES.has(status)
    const isPaid = status === 'paid'

    if (isPaid) paidCount += 1

    grossCollected += paidAmount + penaltyPaid
    penaltiesCollected += penaltyPaid
    penaltiesWaived += penaltyWaived

    const principalPaid = Math.min(principalRemaining, paidAmount)
    principalRecovered += principalPaid
    principalRemaining -= principalPaid
    realizedBaseProfit += Math.max(0, paidAmount - principalPaid)

    const baseRemaining = Math.max(0, expectedAmount - paidAmount)
    if (isActive) {
      activeOutstanding += baseRemaining
      penaltiesPending += penaltyPending
    }

    const isLate =
      status === 'overdue' ||
      ((status === 'pending' || status === 'partial') &&
        typeof installment.due_date === 'string' &&
        installment.due_date < currentDay)

    if (isLate) {
      inArrears += baseRemaining + penaltyPending
    }
  }

  const totalOutstanding = activeOutstanding + penaltiesPending
  const futureProfit = Math.max(0, activeOutstanding - principalRemaining)
  const realizedProfit = realizedBaseProfit + penaltiesCollected

  return {
    grossCollected,
    principalRecovered,
    realizedBaseProfit,
    realizedProfit,
    futureProfit,
    totalOperationProfit: realizedProfit + futureProfit,
    activeOutstanding,
    totalOutstanding,
    inArrears,
    penaltiesCollected,
    penaltiesPending,
    penaltiesWaived,
    paidCount,
    totalCount: ordered.filter(installment => installment.status !== 'cancelled').length,
    principalRemaining: Math.max(0, principalRemaining),
  }
}

export function computeInstallmentDueAmount(installment: Pick<LoanFinancialInstallmentInput, 'expected_amount' | 'paid_amount' | 'payment_history' | 'penalty_pending'>) {
  const baseRemaining = Math.max(0, toSafeNumber(installment.expected_amount) - getEffectivePaidAmount(installment))
  const penaltyPending = Math.max(0, toSafeNumber(installment.penalty_pending))

  return {
    baseRemaining,
    penaltyPending,
    totalDue: baseRemaining + penaltyPending,
  }
}
