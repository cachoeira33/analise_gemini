import { format, parseISO } from 'date-fns'

export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'

/**
 * Formats a date string (YYYY-MM-DD or ISO) using the user's preferred format.
 * Falls back to the raw string if parsing fails.
 */
export function formatDateGlobal(dateString: string | null | undefined, fmt: DateFormat = 'DD/MM/YYYY'): string {
  if (!dateString) return '—'
  try {
    // Normalise: if the string has a time component, strip it first
    const datePart = dateString.includes('T') ? dateString.split('T')[0] : dateString
    const parsed = parseISO(datePart)
    if (isNaN(parsed.getTime())) return dateString

    switch (fmt) {
      case 'DD/MM/YYYY': return format(parsed, 'dd/MM/yyyy')
      case 'MM/DD/YYYY': return format(parsed, 'MM/dd/yyyy')
      case 'YYYY-MM-DD': return format(parsed, 'yyyy-MM-dd')
      default:           return format(parsed, 'dd/MM/yyyy')
    }
  } catch {
    return dateString
  }
}
