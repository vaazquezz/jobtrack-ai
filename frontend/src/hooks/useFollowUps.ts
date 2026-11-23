import { useEffect, useState } from 'react'
import { getFollowUps } from '../api/followUps'
import { todayIso } from '../lib/format'
import type { ApplicationFilters, FollowUpOverview } from '../types/application'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: FollowUpOverview }

/**
 * Loads the follow-ups overview for the active filters, using the user's local date as
 * "today". Reloads when the filters or `version` change.
 */
export function useFollowUps(filters: ApplicationFilters, version: number) {
  const query = filters.query?.trim() ?? ''
  const status = filters.status ?? null
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    getFollowUps({ query, status }, todayIso(), controller.signal)
      .then((data) => setState({ status: 'ready', data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        const message = error instanceof Error ? error.message : 'Error desconocido.'
        setState({ status: 'error', message })
      })
    return () => controller.abort()
  }, [query, status, version, retryKey])

  const retry = () => {
    setState({ status: 'loading' })
    setRetryKey((key) => key + 1)
  }

  return { state, retry }
}
