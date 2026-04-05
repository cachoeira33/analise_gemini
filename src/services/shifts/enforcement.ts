export interface ShiftData {
  start_time: string | null
  end_time: string | null
  days_of_week: number[] | null
  is_active: boolean | null
}

function parseMinutes(value: string | null): number | null {
  if (!value) return null
  const [hours, minutes] = value.split(':').map(Number)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return hours * 60 + minutes
}

export function isUserOnShift(shift: ShiftData | null, now: Date = new Date()): boolean {
  if (!shift || shift.is_active === false) return false

  const allowedDays = Array.isArray(shift.days_of_week) ? shift.days_of_week : []
  if (allowedDays.length > 0 && !allowedDays.includes(now.getDay())) {
    return false
  }

  const startMinutes = parseMinutes(shift.start_time)
  const endMinutes = parseMinutes(shift.end_time)

  if (startMinutes == null || endMinutes == null) {
    return true
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes
  }

  return currentMinutes >= startMinutes || currentMinutes <= endMinutes
}
