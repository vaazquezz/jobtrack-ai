import { useDraggable } from '@dnd-kit/core'
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { followUpState } from '../lib/followUps'
import { formatDate } from '../lib/format'
import type { Application, ApplicationStatus } from '../types/application'
import { APPLICATION_STATUSES, STATUS_LABELS } from '../types/application'
import { BellIcon, CalendarIcon, GripIcon, PencilIcon, Spinner } from './ui'

const FOLLOW_UP_CLASS = {
  overdue: 'font-medium text-rose-600',
  today: 'font-medium text-amber-700',
  upcoming: 'text-slate-500',
} as const

// Pointer and key events on the controls inside a card must not start a drag.
const stopDrag = (event: PointerEvent | KeyboardEvent) => event.stopPropagation()

interface CardContentProps {
  application: Application
  today: string
  pending?: boolean
  /** Drag handle (keyboard and screen-reader entry point for dragging). */
  handle?: ReactNode
  onMove?: (status: ApplicationStatus) => void
  onEdit?: () => void
}

/** Visual content of a card; also rendered in the drag overlay. */
export function KanbanCardContent({
  application,
  today,
  pending,
  handle,
  onMove,
  onEdit,
}: CardContentProps) {
  const label = `${application.position} en ${application.company}`
  const followUp = application.follow_up_date
  const followUpClass = FOLLOW_UP_CLASS[followUpState(followUp, today) ?? 'upcoming']

  return (
    <>
      <div className="flex items-start gap-1.5">
        {handle}
        <h3
          className="min-w-0 flex-1 truncate font-semibold text-slate-900"
          title={application.company}
        >
          {application.company}
        </h3>
        {pending ? (
          <Spinner className="mt-0.5 h-4 w-4 shrink-0 text-indigo-500" />
        ) : (
          onEdit && (
            <button
              type="button"
              onPointerDown={stopDrag}
              onKeyDown={stopDrag}
              onClick={onEdit}
              className="-mt-1 -mr-1 shrink-0 rounded-md p-1 text-slate-400 opacity-70 transition hover:bg-slate-100 hover:text-indigo-600 hover:opacity-100 focus-visible:opacity-100"
              aria-label={`Editar ${label}`}
            >
              <PencilIcon className="h-3.5 w-3.5" />
            </button>
          )
        )}
      </div>
      <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{application.position}</p>

      <div className="mt-3 space-y-1 text-xs">
        <p className="flex items-center gap-1.5 text-slate-500">
          <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="sr-only">Fecha de solicitud: </span>
          {formatDate(application.applied_date) ?? <span className="text-slate-400">Sin fecha</span>}
        </p>
        {followUp && (
          <p className={`flex items-center gap-1.5 ${followUpClass}`}>
            <BellIcon className="h-3.5 w-3.5 shrink-0" />
            <span className="sr-only">Seguimiento: </span>
            {formatDate(followUp)}
          </p>
        )}
      </div>

      {onMove && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <label className="sr-only" htmlFor={`move-${application.id}`}>
            Mover {label} a
          </label>
          <select
            id={`move-${application.id}`}
            value={application.status}
            disabled={pending}
            onPointerDown={stopDrag}
            onKeyDown={stopDrag}
            onChange={(event) => onMove(event.target.value as ApplicationStatus)}
            className="block w-full rounded-md border-0 bg-slate-50 py-1.5 pr-8 pl-2 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-indigo-600 disabled:opacity-60"
          >
            {APPLICATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status === application.status ? `${STATUS_LABELS[status]} (actual)` : `Mover a ${STATUS_LABELS[status]}`}
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  )
}

interface KanbanCardProps {
  application: Application
  today: string
  pending: boolean
  onMove: (application: Application, status: ApplicationStatus) => void
  onEdit: (application: Application) => void
}

export function KanbanCard({ application, today, pending, onMove, onEdit }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: application.id,
    disabled: pending,
  })

  const style: CSSProperties = isDragging ? { opacity: 0.35 } : {}

  return (
    // Pointer and touch drags start anywhere on the card; keyboard drags start on the
    // handle, which carries the accessible attributes (so no controls are nested
    // inside a role="button").
    <li
      ref={setNodeRef}
      style={style}
      {...listeners}
      aria-busy={pending || undefined}
      className={`touch-manipulation rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm transition-[box-shadow,opacity] select-none hover:shadow-md has-[button[data-drag-handle]:focus-visible]:ring-2 has-[button[data-drag-handle]:focus-visible]:ring-indigo-500 ${
        pending ? 'cursor-progress opacity-70' : 'cursor-grab active:cursor-grabbing'
      }`}
    >
      <KanbanCardContent
        application={application}
        today={today}
        pending={pending}
        handle={
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            data-drag-handle
            aria-roledescription="tarjeta arrastrable"
            aria-label={`Arrastrar ${application.position} en ${application.company}`}
            disabled={pending}
            className="-ml-1.5 mt-0.5 shrink-0 cursor-grab rounded p-0.5 text-slate-300 outline-none hover:text-slate-500 disabled:cursor-progress"
          >
            <GripIcon className="h-4 w-4" />
          </button>
        }
        onMove={(status) => onMove(application, status)}
        onEdit={() => onEdit(application)}
      />
    </li>
  )
}
