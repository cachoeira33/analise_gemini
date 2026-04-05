/**
 * WhatsApp Dispatcher — high-level notification helpers for MyVizo.
 *
 * Wraps sendWhatsAppMessage with business-specific message templates.
 * Supports multi-tenancy: when a businessId is provided, derives a
 * per-business Evolution API instance name (myvizo_{short_id}).
 * Server-side only.
 */

import { sendWhatsAppMessage } from './evolution'

export { sendWhatsAppMessage }

/**
 * Derive an Evolution API instance name from a business ID and optional name.
 *
 * Priority:
 *   1. WHATSAPP_INSTANCE_OVERRIDE env var (master admin's fixed instance, e.g. "myvizo")
 *   2. Per-business generated name: myvizo-{slug}-{last4}
 *   3. Fallback when name is absent: myvizo-{last4}
 */
export function deriveInstanceName(businessId?: string, businessName?: string): string | undefined {
  if (!businessId) return undefined
  const last4 = businessId.replace(/-/g, '').slice(-4)
  if (businessName) {
    const slug = businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 20)
    return `myvizo-${slug}-${last4}`
  }
  return `myvizo-${last4}`
}

/**
 * Replace {{customer_name}} and {{loan_amount}} in a template string with
 * the actual values. Safe: unknown variables are left as-is.
 */
export function parseWhatsAppMessage(
  template:     string,
  customerName: string,
  loanAmount:   string,
): string {
  return template
    .replace(/\{\{customer_name\}\}/g, customerName)
    .replace(/\{\{loan_amount\}\}/g,   loanAmount)
}

function fmt(amount: number, currency = 'GBP'): string {
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

/**
 * Notify a customer that their loan has been created.
 *
 * @param phone      Customer's phone number (any reasonable format).
 * @param amount     Loan principal amount.
 * @param type       'new_loan' | 'loan_approved' | 'loan_disbursed'
 * @param currency   ISO 4217 currency code. Default: 'GBP'.
 * @param name       Customer name for personalisation. Default: 'Cliente'.
 * @param businessId Optional business ID for multi-tenancy instance selection.
 */
export async function sendLoanNotification(
  phone:      string,
  amount:     number,
  type:       'new_loan' | 'loan_approved' | 'loan_disbursed',
  currency   = 'GBP',
  name       = 'Cliente',
  businessId?: string,
): Promise<void> {
  const amountFmt = fmt(amount, currency)

  const MESSAGES: Record<typeof type, string> = {
    new_loan: (
      `Olá ${name}! 🎉\n\n` +
      `Seu empréstimo de *${amountFmt}* foi criado com sucesso no MyVizo.\n` +
      `Você receberá as informações de pagamento em breve.\n\n` +
      `_Enviado via *MyVizo*_`
    ),
    loan_approved: (
      `Olá ${name}! ✅\n\n` +
      `Seu empréstimo de *${amountFmt}* foi *aprovado*.\n` +
      `O desembolso será processado em breve.\n\n` +
      `_Enviado via *MyVizo*_`
    ),
    loan_disbursed: (
      `Olá ${name}! 💰\n\n` +
      `O valor de *${amountFmt}* foi desembolsado com sucesso.\n` +
      `Acompanhe seu contrato no painel do MyVizo.\n\n` +
      `_Enviado via *MyVizo*_`
    ),
  }

  const instanceName = deriveInstanceName(businessId)
  const result = await sendWhatsAppMessage(phone, MESSAGES[type], instanceName)

  if (!result.ok) {
    console.warn('[dispatcher] sendLoanNotification failed:', result.error)
  } else {
    console.log('[dispatcher] sendLoanNotification sent, msgId:', result.msgId)
  }
}
