import type { StatsOverview, StatsPeriod } from '../types/application'
import { apiRequest } from './client'

export function buildStatsUrl(period: StatsPeriod, today: string): string {
  return `/api/stats?${new URLSearchParams({ period, today }).toString()}`
}

export function getStats(
  period: StatsPeriod,
  today: string,
  signal?: AbortSignal,
): Promise<StatsOverview> {
  return apiRequest<StatsOverview>(buildStatsUrl(period, today), { signal })
}
