'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'
import { Monitor, Moon, Sun, Type } from 'lucide-react'
import { usePreferencesStore, FONT_LABELS, type FontChoice } from '@/lib/stores/usePreferencesStore'

const THEME_OPTIONS = [
  { value: 'light',  label: 'Light',  icon: Sun     },
  { value: 'system', label: 'Auto',   icon: Monitor },
  { value: 'dark',   label: 'Dark',   icon: Moon    },
] as const

const FONT_OPTIONS = Object.entries(FONT_LABELS) as [FontChoice, string][]

/**
 * Compact theme + font control panel for the sidebar footer.
 * Uses next-themes for light/dark/system switching and the
 * usePreferencesStore (Zustand) for font family selection.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const { font, setFont }   = usePreferencesStore()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch — theme is unknown until mounted
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null

  return (
    <div className="space-y-2 px-3 pb-2">
      {/* Theme switcher */}
      <div className="flex items-center gap-1.5 rounded-lg border border-border bg-muted p-0.5">
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => setTheme(value)}
            title={label}
            className={`flex flex-1 items-center justify-center rounded-md py-1.5 transition-all duration-150 ${
              theme === value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>

      {/* Font selector */}
      <div className="flex items-center gap-2">
        <Type className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <select
          value={font}
          onChange={(e) => setFont(e.target.value as FontChoice)}
          className="flex-1 rounded-lg border border-border bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {FONT_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
