-- =============================================================================
-- Sprint 40 — Loans Phase 3: Frequency, Flat Daily Fee, Renegotiation Engine
-- Migration: 20260325000003_loans_frequency_flat_fee.sql
-- Author: AI Architect (TheAdvisor DevOS)
-- Date: 2026-03-25
-- =============================================================================

-- ── 1. Add 'cancelled' to installment_status enum ────────────────────────────
ALTER TYPE public.installment_status ADD VALUE IF NOT EXISTS 'cancelled';

-- ── 2. Loan frequency column ─────────────────────────────────────────────────
-- Controls the due_date interval used by generate_loan_installments().
-- daily=1d, weekly=7d, biweekly=14d, monthly=30d

ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS frequency TEXT NOT NULL DEFAULT 'monthly'
    CHECK (frequency IN ('daily', 'weekly', 'biweekly', 'monthly'));

COMMENT ON COLUMN public.loans.frequency IS
  'Payment frequency. Controls due_date spacing in generate_loan_installments(). '
  'daily=+1d, weekly=+7d, biweekly=+14d, monthly=+30d.';

-- ── 3. Flat daily late fee column ─────────────────────────────────────────────
-- A fixed dollar amount charged per calendar day an installment is overdue.
-- Example: $15.00/day → 3 days late = $45 charged on top of principal.
-- Additive to late_fee_fixed and late_fee_daily_pct (set those to 0 if unused).

ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS late_fee_flat_daily NUMERIC NOT NULL DEFAULT 0
    CHECK (late_fee_flat_daily >= 0);

COMMENT ON COLUMN public.loans.late_fee_flat_daily IS
  'Fixed dollar amount charged per calendar day overdue (e.g. 15.00 = $15/day). '
  'Additive to late_fee_fixed and late_fee_daily_pct. Set to 0 to disable.';

-- ── 4. Replace generate_loan_installments with frequency-aware version ────────
CREATE OR REPLACE FUNCTION public.generate_loan_installments(p_loan_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_loan              RECORD;
    v_pmt               NUMERIC(15, 2);
    v_power             NUMERIC;
    v_interval_days     INT;
    v_installment_num   INT;
    v_inserted          INT := 0;
BEGIN
    -- 1. Fetch and lock the loan row
    SELECT *
    INTO   v_loan
    FROM   public.loans
    WHERE  id = p_loan_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Loan not found: %', p_loan_id;
    END IF;

    -- 2. Guard: do not regenerate if installments already exist
    IF EXISTS (
        SELECT 1 FROM public.loan_installments WHERE loan_id = p_loan_id
    ) THEN
        RAISE EXCEPTION
            'Installments already generated for loan %. Delete existing rows first.', p_loan_id;
    END IF;

    -- 3. Resolve due_date interval from frequency
    v_interval_days := CASE v_loan.frequency
        WHEN 'daily'     THEN 1
        WHEN 'weekly'    THEN 7
        WHEN 'biweekly'  THEN 14
        ELSE 30   -- 'monthly' (default)
    END;

    -- 4. Calculate per-installment payment amount
    IF v_loan.interest_type = 'simple' THEN
        -- Simple interest: spread P×(1 + r×n) evenly
        v_pmt := ROUND(
            v_loan.principal_amount * (1 + v_loan.interest_rate * v_loan.total_installments)
            / v_loan.total_installments,
            2
        );
    ELSE
        -- Compound interest (PMT / French amortisation)
        IF v_loan.interest_rate = 0 THEN
            v_pmt := ROUND(v_loan.principal_amount / v_loan.total_installments, 2);
        ELSE
            v_power := POWER(
                (1 + v_loan.interest_rate)::NUMERIC,
                v_loan.total_installments::NUMERIC
            );
            v_pmt := ROUND(
                v_loan.principal_amount * v_loan.interest_rate * v_power / (v_power - 1),
                2
            );
        END IF;
    END IF;

    -- 5. Insert one row per installment
    FOR v_installment_num IN 1 .. v_loan.total_installments LOOP
        INSERT INTO public.loan_installments (
            loan_id,
            installment_number,
            due_date,
            expected_amount,
            paid_amount,
            status
        ) VALUES (
            p_loan_id,
            v_installment_num,
            v_loan.start_date + (v_installment_num * v_interval_days),
            v_pmt,
            0,
            'pending'
        );
        v_inserted := v_inserted + 1;
    END LOOP;

    RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION public.generate_loan_installments(UUID) IS
    'Calculates equal periodic payments (PMT or simple-interest slice) and inserts '
    'loan_installments rows spaced by the loan frequency: '
    'daily=+1d, weekly=+7d, biweekly=+14d, monthly=+30d. '
    'Returns the count of rows inserted. Raises if loan not found or already has installments.';

GRANT EXECUTE ON FUNCTION public.generate_loan_installments(UUID) TO authenticated;

-- ── 5. Ensure audit_logs allows the RENEGOTIATE action ───────────────────────
-- Attempt to expand the action CHECK constraint to include 'RENEGOTIATE'.
-- We drop the old constraint by its auto-generated name and recreate it.
DO $$
BEGIN
    ALTER TABLE public.audit_logs DROP CONSTRAINT audit_logs_action_check;
EXCEPTION WHEN undefined_object THEN
    -- Constraint did not exist under that name — safe to proceed
    NULL;
END $$;

ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_action_check
    CHECK (action IN (
        'INSERT', 'UPDATE', 'DELETE',
        'RECONCILE', 'UNRECONCILE', 'SPLIT',
        'RENEGOTIATE'
    ));

-- Ensure authenticated role can insert audit records
GRANT INSERT, SELECT ON public.audit_logs TO authenticated;

-- =============================================================================
-- END OF MIGRATION: 20260325000003_loans_frequency_flat_fee.sql
-- =============================================================================
