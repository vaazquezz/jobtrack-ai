import { useCallback, useEffect, useState } from 'react'
import {
  createApplication,
  deleteApplication,
  listApplications,
  updateApplication,
} from '../api/applications'
import type { Application, ApplicationPayload } from '../types/application'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready' }

/** Loads applications from the API and keeps the local list in sync after each change. */
export function useApplications() {
  const [applications, setApplications] = useState<Application[]>([])
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    listApplications(controller.signal)
      .then((data) => {
        setApplications(data)
        setLoadState({ status: 'ready' })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        const message = error instanceof Error ? error.message : 'Error desconocido.'
        setLoadState({ status: 'error', message })
      })
    return () => controller.abort()
  }, [reloadKey])

  const reload = useCallback(() => {
    setLoadState({ status: 'loading' })
    setReloadKey((key) => key + 1)
  }, [])

  const create = useCallback(async (payload: ApplicationPayload) => {
    const created = await createApplication(payload)
    setApplications((current) => [created, ...current])
    return created
  }, [])

  const update = useCallback(async (id: number, payload: Partial<ApplicationPayload>) => {
    const updated = await updateApplication(id, payload)
    setApplications((current) => current.map((item) => (item.id === id ? updated : item)))
    return updated
  }, [])

  const remove = useCallback(async (id: number) => {
    await deleteApplication(id)
    setApplications((current) => current.filter((item) => item.id !== id))
  }, [])

  return { applications, loadState, reload, create, update, remove }
}
