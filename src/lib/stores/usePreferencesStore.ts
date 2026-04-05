'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type FontChoice  = 'inter' | 'roboto' | 'playfair'
export type FontSize    = 'small' | 'medium' | 'large'
export type AppTheme    = 'system-default' | 'corporate-blue' | 'midnight-green' | 'material-clean' | 'tailadmin-slate' | 'vora-modern'
export type DateFormat  = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'
export type AppLocale   = 'en' | 'pt' | 'es' | 'it'

export const LOCALE_LABELS: Record<AppLocale, string> = {
  en: 'English',
  pt: 'Português',
  es: 'Español',
  it: 'Italiano',
}

export const FONT_LABELS: Record<FontChoice, string> = {
  inter:    'Inter',
  roboto:   'Roboto',
  playfair: 'Playfair Display',
}

export const FONT_SIZE_LABELS: Record<FontSize, string> = {
  small:  'Small',
  medium: 'Medium',
  large:  'Large',
}

export const APP_THEME_LABELS: Record<AppTheme, string> = {
  'system-default':  'System Default',
  'corporate-blue':  'Corporate Blue',
  'midnight-green':  'Midnight Green',
  'material-clean':  'Material Clean',
  'tailadmin-slate': 'TailAdmin Slate',
  'vora-modern':     'Vora Modern',
}

interface PreferencesState {
  font:          FontChoice
  fontSize:      FontSize
  appTheme:      AppTheme
  dateFormat:    DateFormat
  locale:        AppLocale
  setFont:       (font: FontChoice)      => void
  setFontSize:   (size: FontSize)        => void
  setAppTheme:   (theme: AppTheme)       => void
  setDateFormat: (fmt: DateFormat)       => void
  setLocale:     (locale: AppLocale)     => void
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      font:          'inter',
      fontSize:      'medium',
      appTheme:      'system-default',
      dateFormat:    'DD/MM/YYYY',
      locale:        'en',
      setFont:       (font)       => set({ font }),
      setFontSize:   (fontSize)   => set({ fontSize }),
      setAppTheme:   (appTheme)   => set({ appTheme }),
      setDateFormat: (dateFormat) => set({ dateFormat }),
      setLocale:     (locale)     => set({ locale }),
    }),
    { name: 'myvizo-preferences' },
  ),
)
