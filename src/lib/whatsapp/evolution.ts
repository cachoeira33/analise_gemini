/**
 * Evolution API — WhatsApp Gateway Client
 *
 * Server-side only. Wraps POST /message/sendText/{instance} from Evolution API v2.
 *
 * Required environment variables:
 *   EVOLUTION_API_URL          Base URL of your Evolution API server (no trailing slash)
 *                              e.g. https://evo.example.com
 *   EVOLUTION_API_KEY          API key (sent as `apikey` header)
 *   EVOLUTION_INSTANCE_NAME    WhatsApp instance name configured in Evolution
 *   EVOLUTION_DEFAULT_CC       Default country code (digits only, no +). Default: "44" (UK)
 *
 * Usage:
 *   import { sendWhatsAppMessage } from '@/lib/whatsapp/evolution'
 *   await sendWhatsAppMessage('+447700900123', 'Hello!')
 */

// ── Phone normalisation ───────────────────────────────────────────────────────
/**
 * Normalise a raw phone string to the international format expected by
 * Evolution API: digits only, no leading +, country code included.
 *
 * Rules (applied in order):
 *  1. Strip everything that is not a digit.
 *  2. If the result starts with "00", replace the leading "00" with the CC.
 *  3. If the result starts with "0", replace the leading "0" with the CC.
 *  4. Otherwise assume the caller already supplied a full international number.
 */
function normalisePhone(raw: string): string {
  const cc = (process.env.EVOLUTION_DEFAULT_CC ?? '44').replace(/\D/g, '')
  const digits = raw.replace(/\D/g, '')

  if (digits.startsWith('00')) return cc + digits.slice(2)
  if (digits.startsWith('0')) return cc + digits.slice(1)
  return digits
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface EvolutionSendResult {
  ok: boolean
  msgId?: string
  error?: string
}

// ── Client ────────────────────────────────────────────────────────────────────
/**
 * Send a plain-text WhatsApp message via Evolution API.
 *
 * @param phone   Raw phone number in any reasonable format.
 * @param message Plain text body to send.
 * @returns       Result object — never throws.
 */
export async function sendWhatsAppMessage(
  phone: string,
  message: string,
  /** Optional: override the instance name for multi-tenancy (per-business). */
  instanceName?: string,
): Promise<EvolutionSendResult> {
  const rawBaseUrl = process.env.EVOLUTION_API_URL
    || process.env.NEXT_PUBLIC_EVOLUTION_API_URL
    || 'https://api-wa.myvizo.co.uk'
  const apiKey = process.env.EVOLUTION_API_KEY
  const resolvedInstance = instanceName || process.env.EVOLUTION_INSTANCE_NAME

  console.log('[whatsapp-debug] EVOLUTION_URL:', rawBaseUrl)
  console.log('[whatsapp-debug] EVOLUTION_KEY:', apiKey ? `${apiKey.slice(0, 4)}…` : '⚠ UNDEFINED')
  console.log('[whatsapp-debug] INSTANCE_NAME:', resolvedInstance ?? '⚠ UNDEFINED')

  // Gracefully abort if env vars are not configured
  if (!apiKey || !resolvedInstance) {
    console.warn('[whatsapp] Evolution API not configured — skipping send.')
    return { ok: false, error: 'Evolution API not configured' }
  }

  // Force IPv4 — Windows can resolve localhost to ::1 (IPv6) which Evolution may not listen on
  const baseUrl = rawBaseUrl.replace('localhost', '127.0.0.1')

  // Robust digit-only normalisation: strip non-numeric chars, then apply CC prefix
  const cleanPhone = normalisePhone(phone)
  if (!cleanPhone || cleanPhone.length < 7) {
    console.warn('[whatsapp] Invalid phone number — skipping send.', { raw: phone })
    return { ok: false, error: 'Invalid phone number' }
  }

  const url = `${baseUrl}/message/sendText/${encodeURIComponent(resolvedInstance)}`;

  // 15-second timeout via AbortController so Node never hangs on a silent API
  const controller = new AbortController()
  const timer = setTimeout(() => {
    console.log('[whatsapp] Request to Evolution API timed out after 15s.')
    controller.abort()
  }, 15_000)

  try {
    // Minimal payload — extra fields cause internal errors in Evolution API v2.3.7
    const payload = {
      number: cleanPhone,
      text: message,
      linkPreview: false // Recomendado false para evitar lentidão
    };

    console.log('[whatsapp-dispatcher] Sending to Evolution API:', payload)

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    clearTimeout(timer)

    console.log('[whatsapp-dispatcher] Evolution API Status:', res.status)

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`[whatsapp] Evolution API error ${res.status}:`, body)
      return { ok: false, error: `Evolution ${res.status}: ${body.slice(0, 120)}` }
    }

    console.log('[whatsapp-dispatcher] SUCCESS: Message sent to Evolution API')

    const json = await res.json().catch(() => ({}))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msgId = (json as any)?.key?.id ?? (json as any)?.id
    return { ok: true, msgId }
  } catch (err) {
    clearTimeout(timer)
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, error: 'Gateway Timeout' }
    }
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[whatsapp] Fetch failed:', msg)
    return { ok: false, error: msg }
  }
}
