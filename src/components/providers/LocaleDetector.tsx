'use client'

/**
 * LocaleDetector — auto-detects browser language on first visit.
 * Place this component once in the root layout (client boundary).
 * It reads navigator.language and sets the locale in usePreferencesStore
 * ONLY when the persisted value is still the default 'en' and the user
 * has not manually changed it yet (checked via localStorage key absence).
 */
import { useEffect } from 'react'
import { usePreferencesStore, type AppLocale } from '@/lib/stores/usePreferencesStore'

const SUPPORTED: AppLocale[] = ['en', 'pt', 'es', 'it']
const STORAGE_KEY = 'advisor-locale-detected'

function detectLocale(): AppLocale {
  const lang = (navigator.language ?? 'en').toLowerCase()
  if (lang.startsWith('pt')) return 'pt'
  if (lang.startsWith('es')) return 'es'
  if (lang.startsWith('it')) return 'it'
  // Check for any other supported locale exact match
  const base = lang.split('-')[0] as AppLocale
  if (SUPPORTED.includes(base)) return base
  return 'en'
}

export function LocaleDetector() {
  const setLocale = usePreferencesStore(s => s.setLocale)

  useEffect(() => {
    // Only auto-detect once — if user has already manually set a locale, skip.
    if (sessionStorage.getItem(STORAGE_KEY)) return
    const stored = localStorage.getItem('advisor-preferences')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        // If user explicitly saved a non-default locale, respect it
        if (parsed?.state?.locale && parsed.state.locale !== 'en') return
      } catch { /* ignore */ }
    }
    const detected = detectLocale()
    if (detected !== 'en') {
      setLocale(detected)
    }
    sessionStorage.setItem(STORAGE_KEY, '1')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}
