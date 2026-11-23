import { formatDate } from '../lib/format'
import type { Application } from '../types/application'
import { StatusBadge } from './StatusBadge'
import { CalendarIcon, ExternalLinkIcon, PencilIcon, TrashIcon } from './ui'

interface ApplicationListProps {
  applications: Application[]
  onEdit: (application: Application) => void
  onDelete: (application: Application) => void
}

const iconButton =
  'rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-indigo-600'

export function ApplicationList({ applications, onEdit, onDelete }: ApplicationListProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div
        className="application-row hidden gap-x-4 border-b border-slate-200 bg-slate-50 px-6 py-3 text-xs font-medium uppercase tracking-wide text-slate-500 md:grid"
        aria-hidden="true"
      >
        <span className="[grid-area:company]">Empresa</span>
        <span className="[grid-area:position]">Puesto</span>
        <span className="[grid-area:date]">Fecha</span>
        <span className="[grid-area:status]">Estado</span>
        <span className="text-right [grid-area:actions]">Acciones</span>
      </div>

      <ul className="divide-y divide-slate-100" aria-label="Candidaturas">
        {applications.map((application) => {
          const applied = formatDate(application.applied_date)
          const followUp = formatDate(application.follow_up_date)
          const label = `${application.position} en ${application.company}`
          return (
            <li
              key={application.id}
              className="application-row gap-x-4 gap-y-1.5 px-4 py-4 transition hover:bg-slate-50/70 sm:px-6"
            >
              <div className="flex min-w-0 items-center gap-1.5 [grid-area:company]">
                <span className="truncate font-semibold text-slate-900" title={application.company}>
                  {application.company}
                </span>
                {application.url && (
                  <a
                    href={application.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded text-slate-400 hover:text-indigo-600"
                    aria-label={`Abrir oferta de ${label}`}
                  >
                    <ExternalLinkIcon className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>

              <p
                className="truncate text-sm text-slate-600 [grid-area:position]"
                title={application.position}
              >
                {application.position}
              </p>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 self-center text-sm text-slate-500 [grid-area:date] md:block">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarIcon className="h-3.5 w-3.5 md:hidden" />
                  {applied ?? <span className="text-slate-400">Sin fecha</span>}
                </span>
                {followUp && (
                  <span className="block text-xs text-slate-400">Seguimiento: {followUp}</span>
                )}
              </div>

              <div className="justify-self-end [grid-area:status] md:justify-self-start">
                <StatusBadge status={application.status} />
              </div>

              <div className="-mr-2 flex items-center justify-end gap-0.5 self-center [grid-area:actions]">
                <button
                  type="button"
                  onClick={() => onEdit(application)}
                  className={`${iconButton} hover:text-indigo-600`}
                  aria-label={`Editar ${label}`}
                  title="Editar"
                >
                  <PencilIcon />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(application)}
                  className={`${iconButton} hover:text-rose-600`}
                  aria-label={`Eliminar ${label}`}
                  title="Eliminar"
                >
                  <TrashIcon />
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
