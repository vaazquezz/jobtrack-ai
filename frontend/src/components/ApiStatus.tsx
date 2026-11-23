import { useEffect, useState } from 'react'
import { fetchHealth } from '../api/health'

type Status =
  | { state: 'loading' }
  | { state: 'online'; version: string }
  | { state: 'offline' }

const styles = {
  loading: 'bg-slate-100 text-slate-600 ring-slate-200',
  online: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  offline: 'bg-rose-50 text-rose-700 ring-rose-200',
} as const

const dot = {
  loading: 'bg-slate-400 animate-pulse',
  online: 'bg-emerald-500',
  offline: 'bg-rose-500',
} as const

export function ApiStatus() {
  const [status, setStatus] = useState<Status>({ state: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    fetchHealth(controller.signal)
      .then((data) => setStatus({ state: 'online', version: data.version }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setStatus({ state: 'offline' })
      })
    return () => controller.abort()
  }, [])

  const label =
    status.state === 'loading'
      ? 'Comprobando API…'
      : status.state === 'online'
        ? `API conectada · v${status.version}`
        : 'API no disponible'

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${styles[status.state]}`}
      role="status"
    >
      <span className={`h-2 w-2 rounded-full ${dot[status.state]}`} aria-hidden="true" />
      {label}
    </span>
  )
}
