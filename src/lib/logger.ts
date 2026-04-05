/**
 * FinTech Audit Logger
 *
 * Server-side only. Writes to system_audit_logs via the Supabase
 * service-role client (bypasses RLS — inserts are blocked for client users).
 *
 * Usage in any API route or Server Action:
 *
 *   import { logAudit } from '@/lib/logger'
 *
 *   await logAudit({
 *     businessId:  tenant.businessId,
 *     userId:      session.user.id,
 *     actionType:  'PAYMENT_RECEIVED',
 *     entityName:  'loan_installments',
 *     entityId:    installment.id,
 *     newData:     { amount, status: 'paid' },
 *     ipAddress:   req.headers.get('x-forwarded-for') ?? undefined,
 *   })
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin'

// ── Action type registry ────────────────────────────────────────────────────
// Extend this union as new auditable events are added.
export type AuditActionType =
  | 'LOAN_CREATED'
  | 'LOAN_UPDATED'
  | 'LOAN_DELETED'
  | 'PAYMENT_RECEIVED'
  | 'PARTIAL_PAYMENT_RECEIVED'
  | 'LOAN_DEFAULTED'
  | 'LOAN_ROLLED_OVER'
  | 'INSTALLMENT_WAIVED'
  | 'SHIFT_STARTED'
  | 'SHIFT_ENDED'
  | 'PLAN_UPGRADED'
  | 'PLAN_DOWNGRADED'
  | 'PLAN_CANCELLED'
  | 'TEAM_MEMBER_INVITED'
  | 'TEAM_MEMBER_REMOVED'
  | 'BUSINESS_CREATED'
  | 'BUSINESS_UPDATED'
  | 'CUSTOMER_CREATED'
  | 'CUSTOMER_UPDATED'
  | 'COLLATERAL_ACCEPTED'
  | 'REFERRAL_REDEEMED'
  | 'EMAIL_SENT'
  | 'STICKER_APPLICATION_SUBMITTED'
  | 'TRANSACTION_APPROVED'
  | 'TRANSACTION_REJECTED'
  | 'HIRING_SIMULATION_CREATED'
  | string   // allow ad-hoc types without breaking the union

export interface AuditEntry {
  businessId?:  string | null
  userId?:      string | null
  actionType:   AuditActionType
  /** High-level table / entity name, e.g. 'loans', 'loan_installments'. */
  entityName?:  string | null
  /** Primary key of the affected row. */
  entityId?:    string | null
  /** Snapshot of the row before the mutation (UPDATE / DELETE). */
  oldData?:     Record<string, unknown> | null
  /** Snapshot of the row after the mutation (INSERT / UPDATE). */
  newData?:     Record<string, unknown> | null
  /** Catch-all for event-specific metadata not covered by entity fields. */
  details?:     Record<string, unknown>
  ipAddress?:   string
}

/**
 * Insert a single audit log entry.
 * Silently swallows errors — audit logging must never break the main flow.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const { error } = await getSupabaseAdmin()
      .from('system_audit_logs')
      .insert({
        business_id:  entry.businessId  ?? null,
        user_id:      entry.userId      ?? null,
        action_type:  entry.actionType,
        action:       entry.actionType,   // mirrors action_type for the new entity-audit schema
        entity_name:  entry.entityName  ?? null,
        entity_id:    entry.entityId    ?? null,
        old_data:     entry.oldData     ?? null,
        new_data:     entry.newData     ?? null,
        details:      entry.details     ?? {},
        ip_address:   entry.ipAddress   ?? null,
      })

    if (error) {
      console.error('[audit] Insert failed:', error.message)
    }
  } catch (err) {
    console.error('[audit] Unexpected error:', err)
  }
}

/**
 * Helper to extract the client IP from a Next.js Request object.
 * Checks x-forwarded-for first (reverse proxy), then x-real-ip.
 */
export function getClientIp(req: Request): string | undefined {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? undefined
}
