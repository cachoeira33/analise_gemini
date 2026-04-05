/**
 * WhatsApp Feature Gate — Server-side only
 *
 * Determines whether a given business may send automated WhatsApp messages.
 * Checks the account's active subscription plan + active_addons list.
 *
 * Returns true if:
 *   - plan_key === 'enterprise'  (always included)
 *   - plan_key === 'professional' AND metadata.active_addons includes 'whatsapp'
 *
 * Always returns false gracefully on any DB error.
 *
 * Usage:
 *   import { canUseWhatsApp } from '@/lib/whatsapp/gate'
 *   if (await canUseWhatsApp(businessId)) { ... }
 */

import { getSupabaseAdmin } from '@/lib/supabase/admin'

export async function canUseWhatsApp(businessId: string): Promise<boolean> {
  try {
    // 1. Resolve business → account_id
    const { data: biz, error: bizErr } = await getSupabaseAdmin()
      .from('businesses')
      .select('account_id')
      .eq('id', businessId)
      .single()

    if (bizErr || !biz?.account_id) return false

    // 2. Fetch the account's active subscription
    const { data: sub, error: subErr } = await getSupabaseAdmin()
      .from('subscriptions')
      .select('plan_key, metadata')
      .eq('account_id', biz.account_id)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (subErr || !sub) return false

    const planKey    = sub.plan_key as string
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const addons: string[] = (sub.metadata as any)?.active_addons ?? []

    // Enterprise — always has WhatsApp
    if (planKey === 'enterprise') return true

    // Professional + whatsapp add-on
    if (planKey === 'professional' && addons.includes('whatsapp')) return true

    return false
  } catch (err) {
    console.error('[whatsapp/gate] canUseWhatsApp error:', err)
    return false
  }
}
