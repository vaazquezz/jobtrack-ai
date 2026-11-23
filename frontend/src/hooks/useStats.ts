import { useEffect, useState } from 'react'
import { getStats } from '../api/stats'
import { todayIso } from '../lib/format'
import type { StatsOverview, StatsPeriod } from '../types/application'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: StatsOverview }

/**
 * Loads GET /api/stats for `period`, using the user's local date. Reloads when the
 * period or `version` (bumped after any change in other tabs) changes. Nothing is
 * fetched while `enabled` is false (the statistics tab is not visible).
 */
export function useStats(period: StatsPeriod, version: number, enabled: boolean) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    getStats(period, todayIso(), controller.signal)
      .then((data) => setState({ status: 'ready', data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        const message = error instanceof Error ? error.message : 'Error desconocido.'
        setState({ status: 'error', message })
      })
    return () => controller.abort()
  }, [period, version, retryKey, enabled])

  const retry = () => {
    setState({ status: 'loading' })
    setRetryKey((key) => key + 1)
  }

  return { state, retry }
}
