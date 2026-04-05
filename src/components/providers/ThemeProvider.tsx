'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { useEffect } from 'react'
import { usePreferencesStore } from '@/lib/stores/usePreferencesStore'

/**
 * Applies the persisted font preference to the <html> element
 * via a `data-font` attribute. globals.css maps this to --font-active.
 */
function FontApplier() {
  const font = usePreferencesStore((s) => s.font)

  useEffect(() => {
    if (font === 'inter') {
      document.documentElement.removeAttribute('data-font')
    } else {
      document.documentElement.setAttribute('data-font', font)
    }
  }, [font])

  return null
}

/**
 * Applies the persisted font-size preference to the <html> element
 * via a `data-font-size` attribute. globals.css defines rem overrides per value.
 */
function FontSizeApplier() {
  const fontSize = usePreferencesStore((s) => s.fontSize)

  useEffect(() => {
    document.documentElement.setAttribute('data-font-size', fontSize)
  }, [fontSize])

  return null
}

/**
 * Applies the persisted app-theme preference to the <html> element
 * via a `data-app-theme` attribute. globals.css maps this to CSS variable overrides.
 * 'system-default' removes the attribute so the base variables apply unmodified.
 */
function AppThemeApplier() {
  const appTheme = usePreferencesStore((s) => s.appTheme)

  useEffect(() => {
    if (appTheme === 'system-default') {
      document.documentElement.removeAttribute('data-app-theme')
    } else {
      document.documentElement.setAttribute('data-app-theme', appTheme)
    }
  }, [appTheme])

  return null
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <FontApplier />
      <FontSizeApplier />
      <AppThemeApplier />
      {children}
    </NextThemesProvider>
  )
}
