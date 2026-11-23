import { relativeDayLabel, type FollowUpState } from '../lib/followUps'
import { formatDate } from '../lib/format'
import type { Application, FollowUpOverview } from '../types/application'
import { StatusBadge } from './StatusBadge'
import { Button, CalendarIcon, CheckIcon, PencilIcon } from './ui'

interface FollowUpsViewProps {
  overview: FollowUpOverview
  filtered: boolean
  onComplete: (application: Application) => void
  onChangeDate: (application: Application) => void
  onEdit: (application: Application) => void
  onClearFilters: () => void
}

const GROUPS: {
  key: 'overdue' | 'due_today' | 'upcoming'
  state: FollowUpState
  title: string
  empty: string
  accent: string
  dot: string
  dateText: string
}[] = [
  {
    key: 'overdue',
    state: 'overdue',
    title: 'Vencidos',
    empty: 'No tienes seguimientos atrasados.',
    accent: 'border-l-rose-500',
    dot: 'bg-rose-500',
    dateText: 'text-rose-700',
  },
  {
    key: 'due_today',
    state: 'today',
    title: 'Para hoy',
    empty: 'Nada programado para hoy.',
    accent: 'border-l-amber-500',
    dot: 'bg-amber-500',
    dateText: 'text-amber-700',
  },
  {
    key: 'upcoming',
    state: 'upcoming',
    title: 'Próximos',
    empty: 'No hay seguimientos programados más adelante.',
    accent: 'border-l-sky-500',
    dot: 'bg-sky-500',
    dateText: 'text-slate-600',
  },
]

const iconButton =
  'rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-indigo-600 focus-visible:outline-2 focus-visible:outline-indigo-600'

export function FollowUpsView({
  overview,
  filtered,
  onComplete,
  onChangeDate,
  onEdit,
  onClearFilters,
}: FollowUpsViewProps) {
  const total = overview.counts.pending + overview.counts.upcoming

  if (total === 0) {
    return (
      <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <CheckIcon className="h-6 w-6" />
        </span>
        <h3 className="mt-4 font-semibold text-slate-900">
          {filtered ? 'No hay seguimientos que coincidan' : 'No tienes seguimientos programados'}
        </h3>
        <p className="mt-1 max-w-sm text-sm text-slate-500">
          {filtered
            ? 'Prueba con otro texto o cambia el filtro de estado.'
            : 'Añade una fecha de seguimiento a una candidatura para verla aquí.'}
        </p>
        {filtered && (
          <Button variant="secondary" className="mt-6" onClick={onClearFilters}>
            Limpiar filtros
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {GROUPS.map((group) => {
        const items = overview[group.key]
        const headingId = `follow-ups-${group.key}`
        return (
          <section key={group.key} aria-labelledby={headingId}>
            <h2
              id={headingId}
              className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700"
            >
              <span className={`h-2 w-2 rounded-full ${group.dot}`} aria-hidden="true" />
              {group.title}
              <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-xs font-medium text-slate-600">
                {items.length}
              </span>
            </h2>
            {items.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-4 py-3 text-sm text-slate-400">
                {group.empty}
              </p>
            ) : (
              <ul className="space-y-2" aria-labelledby={headingId}>
                {items.map((application) => {
                  const label = `${application.position} en ${application.company}`
                  const date = application.follow_up_date as string
                  return (
                    <li
                      key={application.id}
                      className={`flex flex-col gap-3 rounded-xl border border-l-4 border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:gap-4 ${group.accent}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="truncate font-semibold text-slate-900">
                            {application.company}
                          </span>
                          <StatusBadge status={application.status} />
                        </div>
                        <p className="mt-0.5 truncate text-sm text-slate-600">
                          {application.position}
                        </p>
                      </div>

                      <div className={`flex items-center gap-1.5 text-sm ${group.dateText} sm:w-44`}>
                        <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          <span className="font-medium">
                            {relativeDayLabel(date, overview.today)}
                          </span>
                          <span className="text-slate-400"> · {formatDate(date)}</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-1 sm:justify-end">
                        <Button
                          variant="secondary"
                          className="flex-1 py-1.5 sm:flex-none"
                          onClick={() => onComplete(application)}
                          aria-label={`Marcar como hecho el seguimiento de ${label}`}
                        >
                          <CheckIcon />
                          Hecho
                        </Button>
                        <button
                          type="button"
                          className={iconButton}
                          onClick={() => onChangeDate(application)}
                          aria-label={`Cambiar fecha de seguimiento de ${label}`}
                          title="Cambiar fecha"
                        >
                          <CalendarIcon />
                        </button>
                        <button
                          type="button"
                          className={iconButton}
                          onClick={() => onEdit(application)}
                          aria-label={`Editar ${label}`}
                          title="Editar candidatura"
                        >
                          <PencilIcon />
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
