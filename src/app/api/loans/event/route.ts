/**
 * POST /api/loans/event
 *
 * Server-side handler for auditable loan lifecycle events.
 * Called fire-and-forget from client components after DB mutations.
 *
 * Body:
 *   action_type  'LOAN_CREATED' | 'PAYMENT_RECEIVED'
 *   loan_id      string
 *   business_id  string
 *   amount?      number   (PAYMENT_RECEIVED only)
 *   currency?    string   (PAYMENT_RECEIVED only — defaults to GBP)
 *   pay_date?    string   (PAYMENT_RECEIVED only — YYYY-MM-DD)
 *
 * On PAYMENT_RECEIVED this handler also:
 *  - Sends an email receipt via /api/emails/send (best-effort)
 *  - Sends a WhatsApp receipt via Evolution API if the business has the
 *    WhatsApp feature enabled (enterprise plan OR professional + add-on)
 */

import { NextRequest, NextResponse }  from 'next/server'
import { createClient }               from '@/lib/supabase/server'
import { getSupabaseAdmin }           from '@/lib/supabase/admin'
import { logAudit, getClientIp }     from '@/lib/logger'
import { canUseWhatsApp }            from '@/lib/whatsapp/gate'
import { sendWhatsAppMessage }       from '@/lib/whatsapp/evolution'
import { sendLoanNotification }      from '@/lib/whatsapp/dispatcher'

// ── Helper: format currency amount ───────────────────────────────────────────
function fmtMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-GB', {
      style:    'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  }

  // ── Parse ─────────────────────────────────────────────────────────────────
  const body = await req.json().catch(() => null)
  if (!body || !body.action_type || !body.loan_id || !body.business_id) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { action_type, loan_id, business_id, amount, currency = 'GBP', pay_date } = body

  // ── Audit log ─────────────────────────────────────────────────────────────
  await logAudit({
    businessId:  business_id,
    userId:      user.id,
    actionType:  action_type,
    entityName:  action_type === 'PAYMENT_RECEIVED' ? 'loan_installments' : 'loans',
    entityId:    loan_id,
    newData:     amount !== undefined ? { amount, currency, pay_date } : null,
    details:     { loan_id, ...(amount !== undefined ? { amount, currency, pay_date } : {}) },
    ipAddress:   getClientIp(req),
  })

  // ── LOAN_CREATED: WhatsApp notification (feature-gated, best-effort) ────────
  if (action_type === 'LOAN_CREATED') {
    try {
      const whatsappEnabled = await canUseWhatsApp(business_id)
      if (whatsappEnabled) {
        const { data: loan } = await getSupabaseAdmin()
          .from('loans')
          .select('principal_amount, currency, customers ( name, phone )')
          .eq('id', loan_id)
          .single()

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const customer = (loan as any)?.customers as { name: string; phone: string | null } | null
        const principal = Number((loan as unknown as { principal_amount?: number })?.principal_amount ?? 0)
        const currency  = (loan as unknown as { currency?: string })?.currency ?? 'GBP'

        if (customer?.phone) {
          sendLoanNotification(customer.phone, principal, 'new_loan', currency, customer.name)
            .catch(err => console.warn('[loans/event] LOAN_CREATED WhatsApp error:', err))
        }
      }
    } catch (err) {
      console.warn('[loans/event] LOAN_CREATED notification error:', err)
    }
  }

  // ── PAYMENT_RECEIVED: email + WhatsApp receipts ───────────────────────────
  if (action_type === 'PAYMENT_RECEIVED' && amount !== undefined) {
    try {
      // Look up customer (email + phone) and remaining balance
      const { data: loan } = await getSupabaseAdmin()
        .from('loans')
        .select('id, customers ( name, email, phone )')
        .eq('id', loan_id)
        .single()

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const customer = (loan as any)?.customers as {
        name:  string
        email: string | null
        phone: string | null
      } | null

      // Calculate remaining balance from installments
      const { data: installments } = await getSupabaseAdmin()
        .from('loan_installments')
        .select('expected_amount, paid_amount, status')
        .eq('loan_id', loan_id)
        .neq('status', 'cancelled')

      const remaining = (installments ?? []).reduce(
        (acc, i) => acc + Math.max(0, Number(i.expected_amount) - Number(i.paid_amount)),
        0,
      )

      // ── Email receipt (best-effort) ─────────────────────────────────────
      if (customer?.email) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
        fetch(`${appUrl}/api/emails/send`, {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'x-cron-secret': process.env.CRON_SECRET ?? '',
          },
          body: JSON.stringify({
            template:         'payment_receipt',
            to:               customer.email,
            borrowerName:     customer.name,
            amount,
            currency,
            paymentDate:      pay_date ?? new Date().toISOString().split('T')[0],
            remainingBalance: remaining,
            loanRef:          loan_id.slice(0, 8).toUpperCase(),
          }),
        }).catch(err => console.warn('[loans/event] Email send failed:', err))
      }

      // ── WhatsApp receipt (feature-gated, best-effort) ───────────────────
      if (customer?.phone) {
        // Check feature gate before making any Evolution API call
        const whatsappEnabled = await canUseWhatsApp(business_id)

        if (whatsappEnabled) {
          const amountFmt    = fmtMoney(amount, currency)
          const remainingFmt = fmtMoney(remaining, currency)
          const loanRef      = loan_id.slice(0, 8).toUpperCase()
          const name         = customer.name || 'Cliente'

          const message =
            `Olá ${name}! ✅\n\n` +
            `O pagamento de *${amountFmt}* foi recebido com sucesso.\n` +
            `Seu saldo restante é de *${remainingFmt}*.\n` +
            `Referência: ${loanRef}\n\n` +
            `Obrigado! — Enviado via *MyVizo*`

          // Fire-and-forget — never block the response
          sendWhatsAppMessage(customer.phone, message)
            .then(result => {
              if (!result.ok) {
                console.warn('[loans/event] WhatsApp send failed:', result.error)
              } else {
                console.log('[loans/event] WhatsApp sent, msgId:', result.msgId)
              }
            })
            .catch(err => console.warn('[loans/event] WhatsApp unexpected error:', err))
        }
      }
    } catch (err) {
      // Never block the response for comms failures
      console.warn('[loans/event] Post-payment comms error:', err)
    }
  }

  return NextResponse.json({ ok: true })
}
