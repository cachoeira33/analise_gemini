-- =============================================================================
-- Sprint 38 — Loans Phase 1: CRUD, Partial Payments, CSV Portability
-- Migration: 20260325000001_loans_crud_partial_payments.sql
-- Author: AI Architect (TheAdvisor DevOS)
-- Date: 2026-03-25
--
-- Changes:
--   1. DELETE RLS policy for loans — owner-only (business_members.role = 'owner')
--   2. DELETE RLS policy for loan_installments — cascades via loan ownership
--   3. GRANT DELETE on both tables to authenticated
--   4. Helper function: get_my_owned_business_ids() — SECURITY DEFINER
-- =============================================================================

-- =============================================================================
-- SECTION 1: Helper — owned business IDs (role = 'owner' in business_members)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_my_owned_business_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT business_id
    FROM   public.business_members
    WHERE  user_id = auth.uid()
      AND  role    = 'owner';
$$;

GRANT EXECUTE ON FUNCTION public.get_my_owned_business_ids() TO authenticated;

COMMENT ON FUNCTION public.get_my_owned_business_ids() IS
    'Returns the business_ids where the current user is role=owner in business_members. '
    'Used to gate owner-only destructive operations such as DELETE on loans.';

-- =============================================================================
-- SECTION 2: DELETE policies — loans
-- =============================================================================

-- Only the business owner may delete a loan contract.
-- Cascade in loan_installments (ON DELETE CASCADE) handles child rows automatically.
CREATE POLICY loans_delete_owner_only
    ON public.loans
    FOR DELETE
    USING (business_id IN (SELECT public.get_my_owned_business_ids()));

-- =============================================================================
-- SECTION 3: DELETE policies — loan_installments
-- =============================================================================

-- Allow owners to explicitly delete individual installments
-- (needed for partial-payment remainder rows if user wants to clean them up).
CREATE POLICY loan_installments_delete_owner_only
    ON public.loan_installments
    FOR DELETE
    USING (
        loan_id IN (
            SELECT id FROM public.loans
            WHERE  business_id IN (SELECT public.get_my_owned_business_ids())
        )
    );

-- =============================================================================
-- SECTION 4: GRANT statements
-- =============================================================================

GRANT DELETE ON public.loans             TO authenticated;
GRANT DELETE ON public.loan_installments TO authenticated;

-- =============================================================================
-- END OF MIGRATION: 20260325000001_loans_crud_partial_payments.sql
-- =============================================================================
