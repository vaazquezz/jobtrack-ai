/** Date helpers for follow-ups. All dates are ISO calendar dates (YYYY-MM-DD). */

export type FollowUpState = 'overdue' | 'today' | 'upcoming'

const DAY_MS = 86_400_000

function toUtc(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`)
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS)
}

export function addDays(iso: string, days: number): string {
  return new Date(toUtc(iso) + days * DAY_MS).toISOString().slice(0, 10)
}

export function followUpState(date: string | null, today: string): FollowUpState | null {
  if (!date) return null
  if (date < today) return 'overdue'
  if (date === today) return 'today'
  return 'upcoming'
}

/** Human label relative to today, e.g. "Hoy", "Mañana", "Hace 3 días", "En 5 días". */
export function relativeDayLabel(date: string, today: string): string {
  const diff = daysBetween(today, date)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Mañana'
  if (diff === -1) return 'Ayer'
  return diff < 0 ? `Hace ${-diff} días` : `En ${diff} días`
}
