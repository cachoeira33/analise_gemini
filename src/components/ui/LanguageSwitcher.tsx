'use client'

import { Globe } from 'lucide-react'
import { usePreferencesStore, LOCALE_LABELS, type AppLocale } from '@/lib/stores/usePreferencesStore'

const LOCALES: AppLocale[] = ['en', 'pt', 'es', 'it']

interface Props {
  /** 'sidebar' renders a compact row; 'navbar' renders a lighter pill for dark landing page */
  variant?: 'sidebar' | 'navbar'
}

export function LanguageSwitcher({ variant = 'sidebar' }: Props) {
  const locale    = usePreferencesStore(s => s.locale)
  const setLocale = usePreferencesStore(s => s.setLocale)

  if (variant === 'navbar') {
    return (
      <div className="relative flex items-center gap-1.5">
        <Globe className="h-3.5 w-3.5 text-slate-400 shrink-0" />
        <select
          value={locale}
          onChange={e => setLocale(e.target.value as AppLocale)}
          className="appearance-none bg-transparent text-sm text-slate-300 cursor-pointer focus:outline-none hover:text-white transition-colors pr-1"
          aria-label="Language"
        >
          {LOCALES.map(l => (
            <option key={l} value={l} className="bg-slate-900 text-white">
              {LOCALE_LABELS[l]}
            </option>
          ))}
        </select>
      </div>
    )
  }

  // sidebar variant
  return (
    <div className="flex items-center gap-2.5 px-3 py-2">
      <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
      <select
        value={locale}
        onChange={e => setLocale(e.target.value as AppLocale)}
        className="flex-1 bg-transparent text-sm text-muted-foreground cursor-pointer focus:outline-none hover:text-foreground transition-colors"
        aria-label="Language"
      >
        {LOCALES.map(l => (
          <option key={l} value={l}>
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </div>
  )
}
