-- =============================================================================
-- Loan agreements chain
-- =============================================================================
-- Adds a first-class agreement history to each loan so renegotiations and
-- renewals can be tracked without mutating the original contract semantics.

DO $$ BEGIN
  CREATE TYPE public.loan_agreement_status AS ENUM (
    'active',
    'superseded',
    'closed',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.loan_agreement_kind AS ENUM (
    'initial',
    'renegotiation',
    'renewal',
    'manual_restructure'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.loan_agreements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id             UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  business_id         UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  agreement_number    INTEGER NOT NULL CHECK (agreement_number > 0),
  kind                public.loan_agreement_kind NOT NULL DEFAULT 'initial',
  status              public.loan_agreement_status NOT NULL DEFAULT 'active',
  replaces_agreement_id UUID REFERENCES public.loan_agreements(id) ON DELETE SET NULL,
  principal_base      NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (principal_base >= 0),
  penalty_base        NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (penalty_base >= 0),
  interest_rate_pct   NUMERIC(8, 4) NOT NULL DEFAULT 0 CHECK (interest_rate_pct >= 0),
  interest_amount     NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (interest_amount >= 0),
  total_amount        NUMERIC(15, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  total_installments  INTEGER NOT NULL DEFAULT 1 CHECK (total_installments > 0),
  frequency           TEXT,
  first_due_date      DATE,
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  superseded_at       TIMESTAMPTZ,

  CONSTRAINT uq_loan_agreements_number UNIQUE (loan_id, agreement_number)
);

CREATE INDEX IF NOT EXISTS idx_loan_agreements_loan_id
  ON public.loan_agreements (loan_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_loan_agreements_active
  ON public.loan_agreements (loan_id)
  WHERE status = 'active';

ALTER TABLE public.loan_installments
  ADD COLUMN IF NOT EXISTS agreement_id UUID REFERENCES public.loan_agreements(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_loan_installments_agreement_id
  ON public.loan_installments (agreement_id);

ALTER TABLE public.loan_agreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY loan_agreements_select_business_member
  ON public.loan_agreements
  FOR SELECT
  USING (business_id IN (SELECT public.get_my_business_ids()));

CREATE POLICY loan_agreements_insert_business_member
  ON public.loan_agreements
  FOR INSERT
  WITH CHECK (business_id IN (SELECT public.get_my_business_ids()));

CREATE POLICY loan_agreements_update_business_member
  ON public.loan_agreements
  FOR UPDATE
  USING (business_id IN (SELECT public.get_my_business_ids()))
  WITH CHECK (business_id IN (SELECT public.get_my_business_ids()));

REVOKE ALL ON public.loan_agreements FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.loan_agreements TO authenticated;

CREATE OR REPLACE FUNCTION public.create_initial_loan_agreement(p_loan_id UUID)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_loan RECORD;
  v_existing UUID;
  v_total NUMERIC(15, 2);
  v_first_due DATE;
  v_installment_count INTEGER;
  v_interest_amount NUMERIC(15, 2);
BEGIN
  SELECT id
    INTO v_existing
  FROM public.loan_agreements
  WHERE loan_id = p_loan_id
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    UPDATE public.loan_installments
      SET agreement_id = v_existing
    WHERE loan_id = p_loan_id
      AND agreement_id IS NULL;

    RETURN v_existing;
  END IF;

  SELECT l.*,
         COALESCE(SUM(CASE WHEN li.status <> 'cancelled' THEN li.expected_amount ELSE 0 END), 0)::NUMERIC(15, 2) AS installment_total,
         MIN(CASE WHEN li.status <> 'cancelled' THEN li.due_date ELSE NULL END) AS first_due_date,
         GREATEST(COUNT(*) FILTER (WHERE li.status <> 'cancelled'), 1)::INTEGER AS installment_count
    INTO v_loan
  FROM public.loans l
  LEFT JOIN public.loan_installments li ON li.loan_id = l.id
  WHERE l.id = p_loan_id
  GROUP BY l.id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan % not found', p_loan_id;
  END IF;

  v_total := COALESCE(v_loan.installment_total, v_loan.principal_amount);
  v_first_due := v_loan.first_due_date;
  v_installment_count := COALESCE(v_loan.installment_count, v_loan.total_installments);
  v_interest_amount := GREATEST(0, v_total - v_loan.principal_amount);

  INSERT INTO public.loan_agreements (
    loan_id,
    business_id,
    agreement_number,
    kind,
    status,
    principal_base,
    penalty_base,
    interest_rate_pct,
    interest_amount,
    total_amount,
    total_installments,
    frequency,
    first_due_date,
    metadata
  ) VALUES (
    v_loan.id,
    v_loan.business_id,
    1,
    'initial',
    CASE
      WHEN v_loan.status = 'paid' THEN 'closed'::public.loan_agreement_status
      WHEN v_loan.status = 'cancelled' THEN 'cancelled'::public.loan_agreement_status
      ELSE 'active'::public.loan_agreement_status
    END,
    COALESCE(v_loan.principal_amount, 0),
    0,
    COALESCE(v_loan.interest_rate, 0) * 100,
    v_interest_amount,
    v_total,
    v_installment_count,
    v_loan.frequency,
    v_first_due,
    jsonb_build_object(
      'source', 'migration_or_create',
      'loan_status', v_loan.status,
      'interest_type', v_loan.interest_type
    )
  )
  RETURNING id INTO v_existing;

  UPDATE public.loan_installments
    SET agreement_id = v_existing
  WHERE loan_id = p_loan_id
    AND agreement_id IS NULL;

  RETURN v_existing;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_active_loan_agreement(
  p_loan_id UUID,
  p_kind public.loan_agreement_kind,
  p_principal_base NUMERIC,
  p_penalty_base NUMERIC,
  p_interest_rate_pct NUMERIC,
  p_interest_amount NUMERIC,
  p_total_amount NUMERIC,
  p_total_installments INTEGER,
  p_frequency TEXT,
  p_first_due_date DATE,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_loan RECORD;
  v_previous UUID;
  v_new_id UUID;
  v_next_number INTEGER;
BEGIN
  PERFORM public.create_initial_loan_agreement(p_loan_id);

  SELECT l.id, l.business_id
    INTO v_loan
  FROM public.loans l
  WHERE l.id = p_loan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Loan % not found', p_loan_id;
  END IF;

  SELECT id, agreement_number
    INTO v_previous, v_next_number
  FROM public.loan_agreements
  WHERE loan_id = p_loan_id
    AND status = 'active'
  ORDER BY created_at DESC
  LIMIT 1;

  UPDATE public.loan_agreements
    SET status = 'superseded',
        superseded_at = NOW()
  WHERE id = v_previous;

  INSERT INTO public.loan_agreements (
    loan_id,
    business_id,
    agreement_number,
    kind,
    status,
    replaces_agreement_id,
    principal_base,
    penalty_base,
    interest_rate_pct,
    interest_amount,
    total_amount,
    total_installments,
    frequency,
    first_due_date,
    metadata
  ) VALUES (
    p_loan_id,
    v_loan.business_id,
    COALESCE(v_next_number, 0) + 1,
    p_kind,
    'active',
    v_previous,
    COALESCE(p_principal_base, 0),
    COALESCE(p_penalty_base, 0),
    COALESCE(p_interest_rate_pct, 0),
    COALESCE(p_interest_amount, 0),
    COALESCE(p_total_amount, 0),
    GREATEST(COALESCE(p_total_installments, 1), 1),
    p_frequency,
    p_first_due_date,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_initial_loan_agreement(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_active_loan_agreement(UUID, public.loan_agreement_kind, NUMERIC, NUMERIC, NUMERIC, NUMERIC, NUMERIC, INTEGER, TEXT, DATE, JSONB) TO authenticated;

WITH seeded AS (
  SELECT public.create_initial_loan_agreement(id) AS agreement_id
  FROM public.loans
)
SELECT COUNT(*) FROM seeded;
