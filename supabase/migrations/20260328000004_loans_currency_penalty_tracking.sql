-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: Multi-currency support + per-installment penalty tracking
--
-- Adds:
--   loans.currency              — ISO 4217 code (e.g. 'GBP', 'USD', 'EUR')
--   loan_installments.penalty_paid    — penalty actually collected
--   loan_installments.penalty_waived  — penalty formally forgiven (Multa Perdoada)
--   loan_installments.penalty_pending — penalty outstanding; may carry over
-- ─────────────────────────────────────────────────────────────────────────────

-- ── loans ────────────────────────────────────────────────────────────────────

ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'GBP';

COMMENT ON COLUMN public.loans.currency IS
  'ISO 4217 currency code for this loan (GBP, USD, EUR, BRL, etc.).
   Determines the currency symbol shown in payment forms and statements.';

-- ── loan_installments ────────────────────────────────────────────────────────

ALTER TABLE public.loan_installments
  ADD COLUMN IF NOT EXISTS penalty_paid    NUMERIC(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS penalty_waived  NUMERIC(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS penalty_pending NUMERIC(15, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.loan_installments.penalty_paid IS
  'Penalty amount actually collected when this installment was paid (Pagar Multa).';

COMMENT ON COLUMN public.loan_installments.penalty_waived IS
  'Penalty amount formally waived by the lender at payment time (Multa Perdoada).';

COMMENT ON COLUMN public.loan_installments.penalty_pending IS
  'Penalty amount left unresolved — not paid or waived.
   A non-zero value here may be carried over to the next installment''s principal.';

-- ── constraints: values must be non-negative ─────────────────────────────────

ALTER TABLE public.loan_installments
  ADD CONSTRAINT chk_penalty_paid_nonneg    CHECK (penalty_paid    >= 0),
  ADD CONSTRAINT chk_penalty_waived_nonneg  CHECK (penalty_waived  >= 0),
  ADD CONSTRAINT chk_penalty_pending_nonneg CHECK (penalty_pending >= 0);
