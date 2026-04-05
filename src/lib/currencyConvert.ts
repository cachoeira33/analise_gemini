/**
 * Currency conversion helper using the free Frankfurter API.
 * Rates are fetched once per session and cached in memory.
 * Falls back to 1:1 (no conversion) if the API is unavailable.
 */

interface FrankfurterResponse {
  base:  string
  rates: Record<string, number>
}

// Module-level cache — lives as long as the browser session
const rateCache = new Map<string, { rates: Record<string, number>; fetchedAt: number }>()
const CACHE_TTL_MS = 30 * 60 * 1_000   // 30 minutes

/**
 * Fetch exchange rates with `baseCurrency` as the base.
 * Returns a map of { targetCurrency → rate } so that:
 *   amount_in_base = amount_in_foreign / rates[foreign]
 * or equivalently:
 *   amount_in_base = amount_in_foreign * (1 / rates[foreign])
 */
export async function getRates(baseCurrency: string): Promise<Record<string, number>> {
  const cached = rateCache.get(baseCurrency)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.rates
  }
  try {
    // Route through our server-side proxy to avoid CORS errors in the browser.
    // Falls back to direct URL in non-browser (SSR/server actions) environments.
    const url = typeof window !== 'undefined'
      ? `/api/currency?base=${encodeURIComponent(baseCurrency)}`
      : `https://api.frankfurter.app/latest?base=${encodeURIComponent(baseCurrency)}`
    const res = await fetch(url, {
      next: { revalidate: 1800 },  // Next.js cache hint — harmless in browser
    })
    if (!res.ok) throw new Error('Frankfurter returned ' + res.status)
    const json: FrankfurterResponse = await res.json()
    const rates = { ...json.rates, [baseCurrency]: 1 }
    rateCache.set(baseCurrency, { rates, fetchedAt: Date.now() })
    return rates
  } catch {
    // Fallback — return identity so no conversion happens
    return { [baseCurrency]: 1 }
  }
}

/**
 * Convert `amount` from `fromCurrency` to `toCurrency`.
 * Returns the original amount unchanged if currencies match or rates are missing.
 */
export async function convertToBase(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
): Promise<number> {
  if (!fromCurrency || !toCurrency || fromCurrency === toCurrency) return amount
  const rates = await getRates(toCurrency)
  const rate = rates[fromCurrency]   // 1 toCurrency = rate[fromCurrency]
  return rate ? amount / rate : amount
}
