import type { StatsOverview, StatsPeriod } from '../types/application'
import { APPLICATION_STATUSES, STATUS_LABELS } from '../types/application'

export const PERIOD_OPTIONS: { value: StatsPeriod; label: string }[] = [
  { value: '30d', label: 'Últimos 30 días' },
  { value: '90d', label: 'Últimos 90 días' },
  { value: 'all', label: 'Todo el historial' },
]

const percent = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 1 })

/** "62,5 %" or "—" when the rate cannot be computed (nothing submitted). */
export function formatRate(rate: number | null): string {
  return rate === null ? '—' : percent.format(rate)
}

const weekFormatter = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

/** Short label for a week starting on `weekStart` (YYYY-MM-DD), e.g. "2 nov". */
export function formatWeek(weekStart: string): string {
  return weekFormatter.format(new Date(`${weekStart}T00:00:00Z`))
}

export function statusDistribution(stats: StatsOverview) {
  return APPLICATION_STATUSES.map((status) => ({
    status,
    label: STATUS_LABELS[status],
    count: stats.by_status[status],
  }))
}

/** Stages for the interviews-and-offers comparison, each as a share of submitted. */
export function pipelineStages(stats: StatsOverview) {
  const share = (n: number) => (stats.submitted ? n / stats.submitted : null)
  return [
    { label: 'Enviadas', count: stats.submitted, share: share(stats.submitted) },
    { label: 'Con respuesta', count: stats.responded, share: share(stats.responded) },
    { label: 'Entrevista u oferta', count: stats.interviews, share: share(stats.interviews) },
    { label: 'Oferta', count: stats.offers, share: share(stats.offers) },
  ]
}

export function weeklySeries(stats: StatsOverview) {
  return stats.weekly.map((week) => ({
    weekStart: week.week_start,
    label: formatWeek(week.week_start),
    count: week.count,
  }))
}
