import { useEffect, useRef, useState } from 'react'
import { listApplications, updateApplication } from '../api/applications'
import type { Application, ApplicationStatus } from '../types/application'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready' }

export interface MoveError {
  application: Application
  target: ApplicationStatus
  message: string
}

/**
 * Data for the Kanban board: every application matching the search text (the status
 * filter is not applied, since the columns already split by status).
 *
 * `move` is optimistic: the card changes column at once, the new status is saved with
 * PATCH, and if the request fails the card goes back to its previous column and
 * `moveError` describes what failed so it can be retried.
 */
export function useBoard(query: string, version: number, onChanged: () => void) {
  const search = query.trim()
  const [applications, setApplications] = useState<Application[]>([])
  const [total, setTotal] = useState(0)
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' })
  const [retryKey, setRetryKey] = useState(0)
  const [pending, setPending] = useState<ReadonlySet<number>>(new Set())
  const [moveError, setMoveError] = useState<MoveError | null>(null)
  // Moves still waiting for the server; reloads keep these optimistic statuses.
  const inFlight = useRef(new Map<number, ApplicationStatus>())

  useEffect(() => {
    const controller = new AbortController()
    listApplications({ query: search }, controller.signal)
      .then((page) => {
        setApplications(
          page.items.map((item) => {
            const optimistic = inFlight.current.get(item.id)
            return optimistic ? { ...item, status: optimistic } : item
          }),
        )
        setTotal(page.total)
        setLoadState({ status: 'ready' })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        const message = error instanceof Error ? error.message : 'Error desconocido.'
        setLoadState({ status: 'error', message })
      })
    return () => controller.abort()
  }, [search, version, retryKey])

  const retryLoad = () => {
    setLoadState({ status: 'loading' })
    setRetryKey((key) => key + 1)
  }

  const setStatus = (id: number, status: ApplicationStatus) =>
    setApplications((current) =>
      current.map((item) => (item.id === id ? { ...item, status } : item)),
    )

  const move = async (application: Application, target: ApplicationStatus) => {
    const id = application.id
    const current = applications.find((item) => item.id === id) ?? application
    if (current.status === target || inFlight.current.has(id)) return
    const previous = current.status

    inFlight.current.set(id, target)
    setPending((ids) => new Set(ids).add(id))
    setMoveError(null)
    setStatus(id, target)

    try {
      const saved = await updateApplication(id, { status: target })
      inFlight.current.delete(id)
      setApplications((items) => items.map((item) => (item.id === id ? saved : item)))
      onChanged()
    } catch (error) {
      inFlight.current.delete(id)
      setStatus(id, previous)
      setMoveError({
        application: { ...current, status: previous },
        target,
        message: error instanceof Error ? error.message : 'Error desconocido.',
      })
    } finally {
      setPending((ids) => {
        const next = new Set(ids)
        next.delete(id)
        return next
      })
    }
  }

  const retryMove = () => {
    if (moveError) void move(moveError.application, moveError.target)
  }

  const dismissMoveError = () => setMoveError(null)

  return {
    applications,
    total,
    loadState,
    pending,
    moveError,
    move,
    retryMove,
    dismissMoveError,
    retryLoad,
  }
}
