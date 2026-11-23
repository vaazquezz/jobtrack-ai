/** Loading, error and empty states for the applications list. */

import { AlertIcon, BriefcaseIcon, Button, PlusIcon } from './ui'

export function LoadingState() {
  return (
    <div role="status" aria-label="Cargando candidaturas" className="space-y-3">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="animate-pulse rounded-xl border border-slate-200 bg-white p-5">
          <div className="h-4 w-1/3 rounded bg-slate-200" />
          <div className="mt-3 h-3 w-1/2 rounded bg-slate-100" />
        </div>
      ))}
      <span className="sr-only">Cargando candidaturas…</span>
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center rounded-xl border border-rose-200 bg-rose-50 px-6 py-10 text-center"
    >
      <AlertIcon className="h-8 w-8 text-rose-500" />
      <h3 className="mt-3 font-semibold text-rose-900">No se pudieron cargar las candidaturas</h3>
      <p className="mt-1 max-w-md text-sm text-rose-700">{message}</p>
      <Button variant="secondary" className="mt-5" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  )
}

export function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-xl border-2 border-dashed border-slate-200 bg-white px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
        <BriefcaseIcon className="h-6 w-6" />
      </span>
      <h3 className="mt-4 font-semibold text-slate-900">Todavía no hay candidaturas</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">
        Registra tu primera candidatura para empezar a seguir tu búsqueda de empleo.
      </p>
      <Button className="mt-6" onClick={onCreate}>
        <PlusIcon />
        Añadir candidatura
      </Button>
    </div>
  )
}
