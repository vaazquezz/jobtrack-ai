import type { ApplicationStatus } from '../types/application'
import { APPLICATION_STATUSES, STATUS_LABELS } from '../types/application'
import { CloseIcon, SearchIcon } from './ui'

export const SEARCH_MAX_LENGTH = 200

interface FilterBarProps {
  query: string
  status: ApplicationStatus | null
  onQueryChange: (query: string) => void
  onStatusChange: (status: ApplicationStatus | null) => void
  onClear: () => void
}

const STATUS_OPTIONS: { value: ApplicationStatus | null; label: string }[] = [
  { value: null, label: 'Todas' },
  ...APPLICATION_STATUSES.map((value) => ({ value, label: STATUS_LABELS[value] })),
]

export function FilterBar({
  query,
  status,
  onQueryChange,
  onStatusChange,
  onClear,
}: FilterBarProps) {
  const hasFilters = query.trim() !== '' || status !== null

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <label htmlFor="application-search" className="sr-only">
            Buscar por empresa o puesto
          </label>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            id="application-search"
            type="search"
            value={query}
            maxLength={SEARCH_MAX_LENGTH}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Buscar por empresa o puesto…"
            autoComplete="off"
            className="block w-full rounded-lg border-0 bg-slate-50 py-2 pr-9 pl-9 text-sm text-slate-900 ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-indigo-600 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
              aria-label="Borrar búsqueda"
            >
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map((option) => {
            const active = option.value === status
            return (
              <button
                key={option.label}
                type="button"
                aria-pressed={active}
                onClick={() => onStatusChange(option.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-indigo-600 ${
                  active
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800'
                }`}
              >
                {option.label}
              </button>
            )
          })}
        </div>
        {hasFilters && (
          <button
            type="button"
            onClick={onClear}
            className="ml-auto rounded-lg px-2 py-1 text-sm font-medium text-indigo-600 hover:bg-indigo-50 focus-visible:outline-2 focus-visible:outline-indigo-600"
          >
            Limpiar filtros
          </button>
        )}
      </div>
    </div>
  )
}
