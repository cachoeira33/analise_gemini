/**
 * Deterministic Loan Status Calculator
 *
 * Design principles:
 *  • Pure function — no side effects, no I/O.
 *  • Integer-cent arithmetic throughout to avoid IEEE-754 drift.
 *    All amounts are stored internally as pence (integer) and only
 *    formatted to 2 d.p. strings at the output boundary.
 *  • Partial payments are summed from the payment_history array;
 *    the denormalised paid_amount field on the installment row is
 *    not trusted (it may lag behind real-time edits).
 *  • Penalties: £15 flat per calendar day overdue (starts the day
 *    AFTER due_date). Percentage-based and one-time fixed penalties
 *    are also supported via PenaltyRules.
 *  • Per-installment manual discounts (penalty waivers) are applied
 *    after penalty calculation, before outstanding is computed.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** A single payment event (one row inside payment_history JSON). */
export interface PaymentEntry {
  /** ISO date string, e.g. "2026-04-15" */
  date: string
  /** Amount in GBP (decimal). Converted to pence internally. */
  amount: number
  /** Optional note: "cash", "transfer", "partial waiver", etc. */
  note?: string
}

/** One installment row as fetched from loan_installments. */
export interface InstallmentInput {
  id: string
  installment_number: number
  /** ISO date string, e.g. "2026-05-01" */
  due_date: string
  /** Scheduled repayment amount in GBP. */
  expected_amount: number
  /**
   * Individual payment events for this installment.
   * Pass the parsed payment_history JSON array here.
   * If the array is empty, the installment is treated as unpaid.
   */
  payment_history: PaymentEntry[]
  /** Current DB status — used as a hint but recalculated internally. */
  status: 'pending' | 'partial' | 'paid' | 'overdue'
}

/**
 * Penalty rules sourced from the loans row.
 * All monetary values in GBP.
 */
export interface PenaltyRules {
  /**
   * Flat GBP amount charged per calendar day overdue.
   * Maps to loans.late_fee_flat_daily.
   * Default: 15 (£15/day per product spec).
   */
  flat_daily: number
  /**
   * Additional daily penalty as a decimal fraction of expected_amount.
   * Maps to loans.late_fee_daily_pct.
   * e.g. 0.001 = 0.1 % per day. Set to 0 to disable.
   */
  daily_pct: number
  /**
   * One-time fixed fee applied on the first day overdue.
   * Maps to loans.late_fee_fixed.
   * Set to 0 to disable.
   */
  fixed_once: number
}

/** Per-installment manual discount (e.g. penalty waiver granted by owner). */
export interface InstallmentDiscount {
  /** Must match InstallmentInput.id */
  installment_id: string
  /**
   * Amount to subtract from the calculated penalty, in GBP.
   * Capped at the penalty total — cannot reduce below 0.
   */
  discount_amount: number
  /** Optional audit note for the discount. */
  note?: string
}

/** Computed status for one installment. All monetary values are strings
 *  formatted to 2 decimal places (GBP). */
export interface InstallmentResult {
  id: string
  installment_number: number
  due_date: string
  /** Scheduled amount, formatted. */
  expected_amount: string
  /** Sum of all payment_history entries, formatted. */
  total_paid: string
  /** Gross penalty before discount, formatted. */
  penalty_gross: string
  /** Manual discount applied against penalty, formatted. */
  discount_applied: string
  /** Net penalty after discount (penalty_gross − discount_applied), formatted. */
  penalty_net: string
  /** Amount still owed: (expected_amount + penalty_net) − total_paid, formatted.
   *  Clamped to "0.00" if fully paid. */
  amount_outstanding: string
  /** Calendar days overdue as of currentDate (0 if not yet due). */
  days_overdue: number
  /** Recalculated status. */
  status: 'pending' | 'partial' | 'paid' | 'overdue'
}

/** Aggregate output for the entire loan. */
export interface LoanStatus {
  installments: InstallmentResult[]
  /** Sum of all expected_amount values, formatted. */
  total_expected: string
  /** Sum of all total_paid values, formatted. */
  total_paid: string
  /** Sum of all penalty_net values, formatted. */
  total_penalties: string
  /** Sum of all discount_applied values, formatted. */
  total_discounts: string
  /** Sum of all amount_outstanding values, formatted. */
  total_outstanding: string
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Convert GBP decimal to integer pence, rounding half-up. */
function toPence(gbp: number): number {
  return Math.round(gbp * 100)
}

/** Format integer pence back to "X.XX" string. */
function formatPence(pence: number): string {
  const abs = Math.abs(pence)
  const sign = pence < 0 ? '-' : ''
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/** Parse an ISO date string to a UTC midnight Date without timezone drift. */
function parseDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

/**
 * Calendar days from dueDate to referenceDate (positive = overdue).
 * Returns 0 if referenceDate <= dueDate (not yet due).
 */
function daysOverdue(dueDateIso: string, reference: Date): number {
  const due = parseDate(dueDateIso)
  const diffMs = reference.getTime() - due.getTime()
  // Penalty starts the day AFTER due_date
  const diffDays = Math.floor(diffMs / 86_400_000)
  return Math.max(0, diffDays)
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Calculate the full repayment status of a loan.
 *
 * @param installments  Installment rows from loan_installments, each with
 *                      its payment_history parsed to PaymentEntry[].
 * @param rules         Penalty configuration from the loans row.
 * @param discounts     Optional per-installment manual penalty waivers.
 * @param currentDate   Reference date for overdue calculation.
 *                      Defaults to today (UTC midnight).
 */
export function calculateLoanStatus(
  installments: InstallmentInput[],
  rules: PenaltyRules,
  discounts: InstallmentDiscount[] = [],
  currentDate: Date = new Date(),
): LoanStatus {
  // Normalise reference to UTC midnight to avoid DST / timezone surprises.
  const refDate = new Date(Date.UTC(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    currentDate.getDate(),
  ))

  // Build discount lookup: installment_id → pence
  const discountMap = new Map<string, number>()
  for (const d of discounts) {
    const existing = discountMap.get(d.installment_id) ?? 0
    discountMap.set(d.installment_id, existing + toPence(d.discount_amount))
  }

  // Accumulator totals (pence)
  let sumExpected    = 0
  let sumPaid        = 0
  let sumPenalties   = 0
  let sumDiscounts   = 0
  let sumOutstanding = 0

  const results: InstallmentResult[] = installments.map(inst => {
    // ── 1. Expected (pence) ──────────────────────────────────────────────────
    const expectedPence = toPence(inst.expected_amount)

    // ── 2. Sum payments from payment_history (trust this, not paid_amount) ──
    let paidPence = 0
    for (const p of inst.payment_history) {
      paidPence += toPence(p.amount)
    }

    // ── 3. Days overdue ──────────────────────────────────────────────────────
    const days = daysOverdue(inst.due_date, refDate)

    // ── 4. Gross penalty ────────────────────────────────────────────────────
    let penaltyGrossPence = 0
    if (days > 0) {
      // One-time fixed fee (applied once, first day overdue)
      penaltyGrossPence += toPence(rules.fixed_once)

      // Flat daily fee: £15/day × days
      penaltyGrossPence += toPence(rules.flat_daily) * days

      // Percentage-based daily: (daily_pct × expected_amount) × days
      // Use pence to keep integer math: round per-day then multiply
      if (rules.daily_pct > 0) {
        const pctDayPence = Math.round(expectedPence * rules.daily_pct)
        penaltyGrossPence += pctDayPence * days
      }
    }

    // ── 5. Discount (cap at penalty gross) ──────────────────────────────────
    const rawDiscount = discountMap.get(inst.id) ?? 0
    const discountPence = Math.min(rawDiscount, penaltyGrossPence)

    // ── 6. Net penalty ───────────────────────────────────────────────────────
    const penaltyNetPence = penaltyGrossPence - discountPence

    // ── 7. Outstanding ───────────────────────────────────────────────────────
    // outstanding = (scheduled + net penalty) − paid, clamped to 0
    const outstandingPence = Math.max(0, expectedPence + penaltyNetPence - paidPence)

    // ── 8. Derived status ────────────────────────────────────────────────────
    let status: InstallmentResult['status']
    if (paidPence >= expectedPence + penaltyNetPence) {
      status = 'paid'
    } else if (paidPence > 0) {
      status = 'partial'
    } else if (days > 0) {
      status = 'overdue'
    } else {
      status = 'pending'
    }

    // ── Accumulate ───────────────────────────────────────────────────────────
    sumExpected    += expectedPence
    sumPaid        += paidPence
    sumPenalties   += penaltyNetPence
    sumDiscounts   += discountPence
    sumOutstanding += outstandingPence

    return {
      id:                  inst.id,
      installment_number:  inst.installment_number,
      due_date:            inst.due_date,
      expected_amount:     formatPence(expectedPence),
      total_paid:          formatPence(paidPence),
      penalty_gross:       formatPence(penaltyGrossPence),
      discount_applied:    formatPence(discountPence),
      penalty_net:         formatPence(penaltyNetPence),
      amount_outstanding:  formatPence(outstandingPence),
      days_overdue:        days,
      status,
    }
  })

  return {
    installments:      results,
    total_expected:    formatPence(sumExpected),
    total_paid:        formatPence(sumPaid),
    total_penalties:   formatPence(sumPenalties),
    total_discounts:   formatPence(sumDiscounts),
    total_outstanding: formatPence(sumOutstanding),
  }
}

/**
 * Build a PenaltyRules object from a loans DB row.
 * Provides the product-spec default of £15/day flat when all fields are 0.
 */
export function rulesFromLoan(loan: {
  late_fee_flat_daily: number
  late_fee_daily_pct: number
  late_fee_fixed: number
}): PenaltyRules {
  return {
    flat_daily:  loan.late_fee_flat_daily > 0 ? loan.late_fee_flat_daily : 15,
    daily_pct:   loan.late_fee_daily_pct,
    fixed_once:  loan.late_fee_fixed,
  }
}
