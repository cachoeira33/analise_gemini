-- =============================================================================
-- Sprint 39 — Loans Phase 2: Stealth GPS + Late Fee Configuration
-- Migration: 20260325000002_loans_gps_late_fees.sql
-- Author: AI Architect (TheAdvisor DevOS)
-- Date: 2026-03-25
-- =============================================================================

-- ── 1. GPS tracking on installment payments ───────────────────────────────────
-- Captures WHERE the employee was when the payment was registered.
-- Populated by navigator.geolocation in the browser (stealth, no UI feedback).
-- NULL when permission is denied or browser/device has no GPS.

ALTER TABLE public.loan_installments
  ADD COLUMN IF NOT EXISTS lat  numeric,
  ADD COLUMN IF NOT EXISTS lng  numeric;

COMMENT ON COLUMN public.loan_installments.lat IS 'GPS latitude captured at payment receipt (stealth, owner-visible only)';
COMMENT ON COLUMN public.loan_installments.lng IS 'GPS longitude captured at payment receipt (stealth, owner-visible only)';

-- ── 2. Late-fee configuration on loans ────────────────────────────────────────
-- late_fee_fixed     — one-time fixed penalty per overdue installment (e.g. $10)
-- late_fee_daily_pct — daily percentage rate on remaining balance (e.g. 0.5 = 0.5%/day)

ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS late_fee_fixed     numeric NOT NULL DEFAULT 0 CHECK (late_fee_fixed >= 0),
  ADD COLUMN IF NOT EXISTS late_fee_daily_pct numeric NOT NULL DEFAULT 0 CHECK (late_fee_daily_pct >= 0);

COMMENT ON COLUMN public.loans.late_fee_fixed     IS 'One-time fixed penalty applied per overdue installment (Multa)';
COMMENT ON COLUMN public.loans.late_fee_daily_pct IS 'Daily percentage mora applied on remaining balance (e.g. 0.5 = 0.5%/day)';
