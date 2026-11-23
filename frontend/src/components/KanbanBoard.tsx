import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useMemo, useState } from 'react'
import { todayIso } from '../lib/format'
import { dropTarget, groupByStatus, isStatus } from '../lib/kanban'
import { STATUS_STYLES } from '../lib/statusStyles'
import type { Application, ApplicationStatus } from '../types/application'
import { APPLICATION_STATUSES, STATUS_LABELS } from '../types/application'
import { KanbanCard, KanbanCardContent } from './KanbanCard'

interface KanbanBoardProps {
  applications: Application[]
  pending: ReadonlySet<number>
  onMove: (application: Application, status: ApplicationStatus) => void
  onEdit: (application: Application) => void
}

interface ColumnProps {
  status: ApplicationStatus
  applications: Application[]
  today: string
  pending: ReadonlySet<number>
  onMove: KanbanBoardProps['onMove']
  onEdit: KanbanBoardProps['onEdit']
}

function KanbanColumn({ status, applications, today, pending, onMove, onEdit }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const style = STATUS_STYLES[status]
  const headingId = `kanban-column-${status}`

  return (
    <section
      ref={setNodeRef}
      aria-labelledby={headingId}
      className={`flex w-[17rem] shrink-0 snap-start flex-col rounded-2xl border-t-4 p-2.5 transition-colors xl:w-auto xl:min-w-0 xl:flex-1 ${style.accent} ${
        isOver ? 'bg-indigo-50 ring-2 ring-indigo-300' : style.column
      }`}
    >
      <h2
        id={headingId}
        className="flex items-center gap-2 px-1.5 pt-1 pb-2.5 text-sm font-semibold text-slate-700"
      >
        <span className={`h-2 w-2 rounded-full ${style.dot}`} aria-hidden="true" />
        {STATUS_LABELS[status]}
        <span
          className="ml-auto rounded-full bg-white/80 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200"
          aria-label={`${applications.length} candidaturas`}
        >
          {applications.length}
        </span>
      </h2>
      {applications.length === 0 ? (
        <p
          className={`flex min-h-24 items-center justify-center rounded-xl border-2 border-dashed px-3 text-center text-xs transition-colors ${
            isOver ? 'border-indigo-300 text-indigo-500' : 'border-slate-200 text-slate-400'
          }`}
        >
          Arrastra aquí una candidatura
        </p>
      ) : (
        <ul className="flex min-h-24 flex-col gap-2.5" aria-labelledby={headingId}>
          {applications.map((application) => (
            <KanbanCard
              key={application.id}
              application={application}
              today={today}
              pending={pending.has(application.id)}
              onMove={onMove}
              onEdit={onEdit}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

export function KanbanBoard({ applications, pending, onMove, onEdit }: KanbanBoardProps) {
  const [activeId, setActiveId] = useState<number | null>(null)
  const today = todayIso()
  const columns = useMemo(() => groupByStatus(applications), [applications])
  const byId = useMemo(() => new Map(applications.map((a) => [a.id, a])), [applications])
  const active = activeId === null ? undefined : byId.get(activeId)

  const sensors = useSensors(
    // A small distance lets clicks on the card's controls work normally.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // On touch screens a short press starts the drag, so the board can still scroll.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  )

  const name = (id: string | number) => {
    const application = byId.get(Number(id))
    return application ? `${application.company} (${application.position})` : 'La candidatura'
  }
  const column = (id: string | number | undefined) =>
    isStatus(id) ? `la columna ${STATUS_LABELS[id]}` : 'fuera de las columnas'

  const announcements: Announcements = {
    onDragStart: ({ active }) => `${name(active.id)} seleccionada.`,
    onDragOver: ({ active, over }) => `${name(active.id)} está sobre ${column(over?.id)}.`,
    onDragEnd: ({ active, over }) =>
      isStatus(over?.id) ? `${name(active.id)} movida a ${column(over?.id)}.` : `${name(active.id)} soltada sin cambios.`,
    onDragCancel: ({ active }) => `Movimiento de ${name(active.id)} cancelado.`,
  }

  const handleDragStart = (event: DragStartEvent) => setActiveId(Number(event.active.id))

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null)
    const application = byId.get(Number(event.active.id))
    const target = dropTarget(application, event.over?.id)
    if (application && target) onMove(application, target)
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'Pulsa espacio o intro para coger la tarjeta, usa las flechas para moverla entre columnas y vuelve a pulsar espacio o intro para soltarla. Escape cancela. También puedes usar el selector «Mover a» de cada tarjeta.',
        },
      }}
    >
      {/* Only the board scrolls horizontally on narrow screens, never the page. */}
      <div
        className="-mx-4 snap-x snap-mandatory overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0 xl:snap-none"
        role="region"
        aria-label="Tablero Kanban"
      >
        <div className="flex items-start gap-3">
          {APPLICATION_STATUSES.map((status) => (
            <KanbanColumn
              key={status}
              status={status}
              applications={columns[status]}
              today={today}
              pending={pending}
              onMove={onMove}
              onEdit={onEdit}
            />
          ))}
        </div>
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: 'ease-out' }}>
        {active && (
          <div className="w-[16rem] rotate-2 cursor-grabbing rounded-xl border border-slate-200 bg-white p-3.5 shadow-xl ring-1 ring-indigo-200">
            <KanbanCardContent application={active} today={today} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
