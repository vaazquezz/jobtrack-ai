import { useEffect, useState } from 'react'
import {
  createApplication,
  deleteApplication,
  listApplications,
  updateApplication,
} from '../api/applications'
import type { Application, ApplicationFilters, ApplicationPayload } from '../types/application'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready' }

/**
 * Loads applications matching `filters` from the API and reloads whenever the filters
 * change or after a create/update/delete. Stale requests are aborted, so only the
 * response for the latest filters is shown.
 */
export function useApplications(filters: ApplicationFilters = {}) {
  const query = filters.query?.trim() ?? ''
  const status = filters.status ?? null

  const [applications, setApplications] = useState<Application[]>([])
  const [total, setTotal] = useState(0)
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)
  // Key of the request whose results are on screen; differs from the current key while
  // a new request is in flight, which lets the UI show a "refreshing" hint.
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const requestKey = JSON.stringify([query, status, reloadKey])

  useEffect(() => {
    const controller = new AbortController()
    listApplications({ query, status }, controller.signal)
      .then((page) => {
        setApplications(page.items)
        setTotal(page.total)
        setLoadState({ status: 'ready' })
        setLoadedKey(requestKey)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        const message = error instanceof Error ? error.message : 'Error desconocido.'
        setLoadState({ status: 'error', message })
        setLoadedKey(requestKey)
      })
    return () => controller.abort()
  }, [query, status, reloadKey, requestKey])

  /** Reload showing the loading state (e.g. "retry" after an error). */
  const reload = () => {
    setLoadState({ status: 'loading' })
    setReloadKey((key) => key + 1)
  }

  /** Reload in the background, keeping the current list visible. */
  const refresh = () => setReloadKey((key) => key + 1)

  const create = async (payload: ApplicationPayload) => {
    const created = await createApplication(payload)
    refresh()
    return created
  }

  const update = async (id: number, payload: Partial<ApplicationPayload>) => {
    const updated = await updateApplication(id, payload)
    // Show the change at once; the refresh then applies the active filters.
    setApplications((current) => current.map((item) => (item.id === id ? updated : item)))
    refresh()
    return updated
  }

  const remove = async (id: number) => {
    await deleteApplication(id)
    setApplications((current) => current.filter((item) => item.id !== id))
    setTotal((current) => Math.max(0, current - 1))
    refresh()
  }

  const refreshing = loadState.status === 'ready' && loadedKey !== requestKey

  return { applications, total, loadState, refreshing, reload, create, update, remove }
}
