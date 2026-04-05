'use client'

/**
 * Locale-aware i18n hook.
 * Reads the active locale from usePreferencesStore (persisted in localStorage).
 * All 4 locale files are pre-loaded synchronously via require() to avoid
 * async loading states and the Turbopack dual-registration conflict.
 *
 * Auto-detection: the <LocaleDetector> client component placed in the root
 * layout reads navigator.language on first mount and calls setLocale() when
 * no stored preference exists yet.
 *
 * STABILITY: `t` is memoised and only changes when `locale` changes — safe
 * to include in useEffect / useCallback dependency arrays.
 */
import { useMemo } from 'react'
import { usePreferencesStore, type AppLocale } from '@/lib/stores/usePreferencesStore'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const LOCALES: Record<AppLocale, Record<string, unknown>> = {
  en: require('../../public/locales/en.json') as Record<string, unknown>,
  pt: require('../../public/locales/pt.json') as Record<string, unknown>,
  es: require('../../public/locales/es.json') as Record<string, unknown>,
  it: require('../../public/locales/it.json') as Record<string, unknown>,
}

type DeepValue = string | Record<string, unknown>

function getByPath(obj: Record<string, unknown>, path: string): string {
  return path.split('.').reduce<DeepValue>((acc, key) => {
    if (typeof acc === 'object' && acc !== null) {
      return (acc as Record<string, unknown>)[key] as DeepValue
    }
    return ''
  }, obj as Record<string, unknown>) as string
}

export function useTranslation() {
  const locale = usePreferencesStore(s => s.locale)
  const dict   = LOCALES[locale] ?? LOCALES.en

  const t = useMemo(() => (key: string, params?: Record<string, string | number>): string => {
    let value = getByPath(dict, key)

    // Fall back to English when key is missing in the active locale
    if (typeof value !== 'string' || value === '') {
      const enValue = getByPath(LOCALES.en, key)
      if (typeof enValue === 'string') value = enValue
    }

    if (typeof value !== 'string' || value === '') return key

    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        value = (value as string).replace(`{{${k}}}`, String(v))
      })
    }

    return value as string
  }, [dict])

  return { t, locale }
}
