/**
 * src/lib/services/currency.ts
 *
 * Lightweight currency conversion service that proxies through /api/currency
 * (Frankfurter API) with a 24-hour localStorage cache to stay within free-tier
 * request limits.
 *
 * Usage:
 *   import { getRates, convert, convertSync } from '@/lib/services/currency'
 *
 *   // Async — fetches rates lazily and caches them
 *   const gbp = await convert(1000, 'BRL', 'GBP')
 *
 *   // Sync — use after calling getRates() yourself
 *   const rates = await getRates('GBP')
 *   const gbp = convertSync(1000, 'BRL', rates, 'GBP')
 */

const CACHE_KEY_PREFIX = 'myvizo_fx_'
const CACHE_TTL_MS     = 24 * 60 * 60 * 1000   // 24 hours

interface RateCache {
  rates:     Record<string, number>
  timestamp: number
}

// ── LocalStorage helpers ─────────────────────────────────────────────────────

function loadCache(base: string): Record<string, number> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + base)
    if (!raw) return null
    const cache: RateCache = JSON.parse(raw)
    if (Date.now() - cache.timestamp > CACHE_TTL_MS) return null
    return cache.rates
  } catch {
    return null
  }
}

function saveCache(base: string, rates: Record<string, number>): void {
  if (typeof window === 'undefined') return
  try {
    const cache: RateCache = { rates, timestamp: Date.now() }
    localStorage.setItem(CACHE_KEY_PREFIX + base, JSON.stringify(cache))
  } catch { /* ignore storage quota errors */ }
}

// ── In-flight deduplication ──────────────────────────────────────────────────

const pendingFetches = new Map<string, Promise<Record<string, number>>>()

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch (or return cached) exchange rates for `base` currency.
 * Example: getRates('GBP') returns { USD: 1.28, BRL: 6.45, EUR: 1.17, ... }
 * meaning 1 GBP = X target_currency.
 *
 * Returns {} on failure — callers should treat missing keys as 1:1.
 */
export async function getRates(base: string): Promise<Record<string, number>> {
  if (!base) return {}

  const cached = loadCache(base)
  if (cached) return cached

  const existing = pendingFetches.get(base)
  if (existing) return existing

  const promise = fetch(`/api/currency?base=${encodeURIComponent(base)}`)
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json() as Promise<{ rates?: Record<string, number> }>
    })
    .then(data => {
      const rates = data.rates ?? {}
      saveCache(base, rates)
      return rates
    })
    .catch(() => ({}))                       // fallback: empty map → 1:1 fallback
    .finally(() => { pendingFetches.delete(base) })

  pendingFetches.set(base, promise)
  return promise
}

/**
 * Asynchronously convert `amount` from currency `from` to currency `to`.
 * Falls back to 1:1 (returns original amount) if rates are unavailable.
 */
export async function convert(
  amount: number,
  from:   string,
  to:     string,
): Promise<number> {
  if (!from || !to || from === to || amount === 0) return amount
  // Fetch rates with `to` as base: rates[from] = how many [from] per 1 [to]
  const rates = await getRates(to)
  const rate  = rates[from]
  if (!rate || rate === 0) return amount     // fallback 1:1
  return amount / rate
}

/**
 * Synchronous conversion using a pre-fetched rates map returned by getRates(baseCurrency).
 *
 * @param amount       The amount in `from` currency
 * @param from         Source currency code (ISO 4217, e.g. 'BRL')
 * @param rates        Exchange rates map from getRates(baseCurrency)
 *                     rates[X] = how many X per 1 baseCurrency
 * @param baseCurrency The target currency (same as the base used to fetch rates)
 * @returns            Amount in baseCurrency, or original amount on rate-not-found
 */
export function convertSync(
  amount:       number,
  from:         string,
  rates:        Record<string, number>,
  baseCurrency: string,
): number {
  if (!from || from === baseCurrency || amount === 0) return amount
  const rate = rates[from]
  if (!rate || rate === 0) return amount     // fallback 1:1
  return amount / rate
}
