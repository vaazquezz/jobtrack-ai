import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { LIST_LIMIT, updateApplication } from '../api/applications'
import { completeFollowUp } from '../api/followUps'
import { useApplications } from '../hooks/useApplications'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { useBoard } from '../hooks/useBoard'
import { useFollowUps } from '../hooks/useFollowUps'
import { useStats } from '../hooks/useStats'
import { formatDate, todayIso } from '../lib/format'
import { emptyFormValues, formValuesFromApplication } from '../lib/validation'
import type {
  Application,
  ApplicationPayload,
  ApplicationStatus,
  StatsPeriod,
} from '../types/application'
import { STATUS_LABELS } from '../types/application'
import { ApplicationForm } from './ApplicationForm'
import { ApplicationList } from './ApplicationList'
import { ConfirmDialog } from './ConfirmDialog'
import { FilterBar } from './FilterBar'
import { ChangeFollowUpDateDialog, CompleteFollowUpDialog } from './FollowUpDialogs'
import { FollowUpsView } from './FollowUpsView'
import { KanbanBoard } from './KanbanBoard'
import { Modal } from './Modal'
import { PeriodSelector } from './PeriodSelector'
import { EmptyState, ErrorState, LoadingState, NoResultsState } from './states'
import { AlertIcon, Button, CloseIcon, PlusIcon } from './ui'
import { ViewTabs, type View } from './ViewTabs'

type Editor = { mode: 'create' } | { mode: 'edit'; application: Application } | null

type FollowUpAction = { kind: 'complete' | 'date'; application: Application } | null

const VIEW_HASHES: Record<Exclude<View, 'list'>, string> = {
  kanban: '#kanban',
  'follow-ups': '#seguimientos',
  stats: '#estadisticas',
}

// The dashboard (and Recharts) is only downloaded when the statistics tab is opened.
const StatsView = lazy(() => import('./StatsView'))

/** The selected view is kept in the URL hash so a reload keeps it. */
function initialView(): View {
  const entry = Object.entries(VIEW_HASHES).find(([, hash]) => hash === window.location.hash)
  return entry ? (entry[0] as View) : 'list'
}

function followUpSummary(counts: { overdue: number; today: number; upcoming: number }): string {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  return [
    plural(counts.overdue, 'vencido', 'vencidos'),
    `${counts.today} para hoy`,
    plural(counts.upcoming, 'próximo', 'próximos'),
  ].join(' · ')
}

/** Delay before a search is sent, so the API is not called on every keystroke. */
export const SEARCH_DEBOUNCE_MS = 300

function countLabel(count: number, filtered: boolean): string {
  if (filtered) return count === 1 ? '1 resultado' : `${count} resultados`
  return count === 1 ? '1 candidatura registrada' : `${count} candidaturas registradas`
}

export function ApplicationsPage() {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<ApplicationStatus | null>(null)
  const debouncedQuery = useDebouncedValue(query, SEARCH_DEBOUNCE_MS)
  // Typing is debounced, but clearing the search applies at once (no stale request).
  const activeQuery = query.trim() === '' ? '' : debouncedQuery
  // Bumped after any change so the list and the follow-ups stay in sync.
  const [version, setVersion] = useState(0)
  const bump = () => setVersion((v) => v + 1)
  const filters = { query: activeQuery, status }
  const { applications, total, loadState, refreshing, reload, create, update, remove } =
    useApplications(filters, version)
  const followUps = useFollowUps(filters, version)
  const [view, setView] = useState<View>(initialView)
  // The board applies the search only (its columns already split by status) and only
  // fetches while its tab is visible.
  const board = useBoard(activeQuery, version, bump, view === 'kanban')
  const [statsPeriod, setStatsPeriod] = useState<StatsPeriod>('all')
  // Statistics cover every application in the period: search and status filters do
  // not apply. They reload after any change made in the other tabs.
  const stats = useStats(statsPeriod, version, view === 'stats')
  const [followUpAction, setFollowUpAction] = useState<FollowUpAction>(null)
  const [editor, setEditor] = useState<Editor>(null)
  const [toDelete, setToDelete] = useState<Application | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 3500)
    return () => clearTimeout(timer)
  }, [notice])

  const openCreate = useCallback(() => setEditor({ mode: 'create' }), [])
  const closeEditor = useCallback(() => setEditor(null), [])
  const closeDelete = useCallback(() => {
    setToDelete(null)
    setDeleteError(null)
  }, [])

  // Follow manual URL changes (links, back/forward) between "#seguimientos" and the list.
  useEffect(() => {
    const onHashChange = () => setView(initialView())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const changeView = (next: View) => {
    setView(next)
    const url = window.location.pathname + window.location.search
    window.history.replaceState(null, '', next === 'list' ? url : VIEW_HASHES[next])
  }

  const handleSubmit = async (payload: ApplicationPayload) => {
    if (editor?.mode === 'edit') {
      await update(editor.application.id, payload)
      setNotice('Candidatura actualizada.')
    } else {
      await create(payload)
      setNotice('Candidatura añadida.')
    }
    bump()
    setEditor(null)
  }

  const handleCompleteFollowUp = async (nextDate: string | null) => {
    if (!followUpAction) return
    await completeFollowUp(followUpAction.application.id, todayIso(), nextDate)
    bump()
    setFollowUpAction(null)
    setNotice(
      nextDate
        ? `Seguimiento hecho. Próximo: ${formatDate(nextDate)}.`
        : 'Seguimiento marcado como hecho.',
    )
  }

  const handleChangeFollowUpDate = async (date: string | null) => {
    if (!followUpAction) return
    await updateApplication(followUpAction.application.id, { follow_up_date: date })
    bump()
    setFollowUpAction(null)
    setNotice(date ? 'Fecha de seguimiento actualizada.' : 'Seguimiento eliminado.')
  }

  const handleDelete = async () => {
    if (!toDelete) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await remove(toDelete.id)
      bump()
      setToDelete(null)
      setNotice('Candidatura eliminada.')
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'No se pudo eliminar.')
    } finally {
      setDeleting(false)
    }
  }

  const clearFilters = () => {
    setQuery('')
    setStatus(null)
  }

  // Filters that produced the results currently on screen (search is debounced).
  const filtered = activeQuery.trim() !== '' || status !== null
  const ready = loadState.status === 'ready'
  const noApplicationsAtAll = ready && total === 0 && !filtered
  const truncated = ready && applications.length < total
  const followUpState = followUps.state
  const followUpCounts = followUpState.status === 'ready' ? followUpState.data.counts : null
  const editApplication = (application: Application) => setEditor({ mode: 'edit', application })
  const searching = activeQuery.trim() !== ''

  const handleMove = async (application: Application, target: ApplicationStatus) => {
    if (await board.move(application, target)) {
      setNotice(`${application.company} movida a ${STATUS_LABELS[target]}.`)
    }
  }

  const retryMove = async () => {
    const failed = board.moveError
    if (failed && (await board.retryMove())) {
      setNotice(`${failed.application.company} movida a ${STATUS_LABELS[failed.target]}.`)
    }
  }

  const subtitle = () => {
    if (view === 'stats') return 'Estadísticas de tu búsqueda de empleo.'
    if (view === 'follow-ups' && followUpCounts) return followUpSummary(followUpCounts)
    if (view === 'kanban' && board.loadState.status === 'ready') {
      return searching
        ? countLabel(board.total, true)
        : `${board.total} ${board.total === 1 ? 'candidatura' : 'candidaturas'} en el tablero`
    }
    if (ready) return countLabel(total, filtered)
    return 'Gestiona tus procesos de selección en un solo lugar.'
  }

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Candidaturas
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {subtitle()}
          </p>
        </div>
        {ready && !noApplicationsAtAll && (
          <Button onClick={openCreate} className="w-full sm:w-auto">
            <PlusIcon />
            Nueva candidatura
          </Button>
        )}
      </div>

      {!noApplicationsAtAll && (
        <div className="mt-6 space-y-4">
          <ViewTabs view={view} onChange={changeView} followUps={followUpCounts} />
          {view === 'stats' ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <PeriodSelector period={statsPeriod} onChange={setStatsPeriod} />
              <p className="text-xs text-slate-500">
                Incluye todas las candidaturas del periodo; la búsqueda y los filtros no se aplican.
              </p>
            </div>
          ) : (
            <FilterBar
              query={query}
              status={status}
              onQueryChange={setQuery}
              onStatusChange={setStatus}
              onClear={view === 'kanban' ? () => setQuery('') : clearFilters}
              showStatus={view !== 'kanban'}
            />
          )}
        </div>
      )}

      {view === 'stats' && !noApplicationsAtAll && (
        <div className="mt-6" role="tabpanel" aria-label="Estadísticas">
          {stats.state.status === 'loading' && <LoadingState />}
          {stats.state.status === 'error' && (
            <ErrorState message={stats.state.message} onRetry={stats.retry} />
          )}
          {stats.state.status === 'ready' && (
            <Suspense fallback={<LoadingState />}>
              <StatsView stats={stats.state.data} />
            </Suspense>
          )}
        </div>
      )}

      {view === 'kanban' && !noApplicationsAtAll && (
        <div className="mt-4" role="tabpanel" aria-label="Kanban">
          {board.moveError && (
            <div
              role="alert"
              className="mb-4 flex flex-col gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 sm:flex-row sm:items-center"
            >
              <AlertIcon className="hidden h-5 w-5 shrink-0 text-rose-500 sm:block" />
              <p className="flex-1">
                No se pudo mover <strong>{board.moveError.application.company}</strong> a{' '}
                {STATUS_LABELS[board.moveError.target]}: {board.moveError.message}. La tarjeta ha
                vuelto a {STATUS_LABELS[board.moveError.application.status]}.
              </p>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => void retryMove()}>
                  Reintentar
                </Button>
                <button
                  type="button"
                  onClick={board.dismissMoveError}
                  className="rounded-lg p-2 text-rose-500 hover:bg-rose-100"
                  aria-label="Cerrar aviso"
                >
                  <CloseIcon />
                </button>
              </div>
            </div>
          )}
          {board.loadState.status === 'loading' && <LoadingState />}
          {board.loadState.status === 'error' && (
            <ErrorState message={board.loadState.message} onRetry={board.retryLoad} />
          )}
          {board.loadState.status === 'ready' &&
            (board.applications.length === 0 ? (
              <NoResultsState onClear={() => setQuery('')} />
            ) : (
              <>
                <KanbanBoard
                  applications={board.applications}
                  pending={board.pending}
                  onMove={(application, target) => void handleMove(application, target)}
                  onEdit={editApplication}
                />
                {board.applications.length < board.total && (
                  <p className="mt-3 text-center text-xs text-slate-500">
                    Mostrando las {LIST_LIMIT} candidaturas más recientes de {board.total}. Usa
                    la búsqueda para encontrar el resto.
                  </p>
                )}
              </>
            ))}
        </div>
      )}

      {view === 'follow-ups' && !noApplicationsAtAll && (
        <div className="mt-4" role="tabpanel" aria-label="Seguimientos">
          {followUpState.status === 'loading' && <LoadingState />}
          {followUpState.status === 'error' && (
            <ErrorState message={followUpState.message} onRetry={followUps.retry} />
          )}
          {followUpState.status === 'ready' && (
            <FollowUpsView
              overview={followUpState.data}
              filtered={filtered}
              onComplete={(application) => setFollowUpAction({ kind: 'complete', application })}
              onChangeDate={(application) => setFollowUpAction({ kind: 'date', application })}
              onEdit={editApplication}
              onClearFilters={clearFilters}
            />
          )}
        </div>
      )}

      <div
        hidden={view !== 'list' && !noApplicationsAtAll}
        className={`mt-4 transition-opacity ${refreshing ? 'opacity-60' : ''}`}
        aria-busy={refreshing || loadState.status === 'loading'}
      >
        {loadState.status === 'loading' && <LoadingState />}
        {loadState.status === 'error' && <ErrorState message={loadState.message} onRetry={reload} />}
        {ready &&
          (noApplicationsAtAll ? (
            <EmptyState onCreate={openCreate} />
          ) : applications.length === 0 ? (
            <NoResultsState onClear={clearFilters} />
          ) : (
            <>
              <ApplicationList
                applications={applications}
                onEdit={editApplication}
                onDelete={setToDelete}
              />
              {truncated && (
                <p className="mt-3 text-center text-xs text-slate-500">
                  Mostrando las {LIST_LIMIT} candidaturas más recientes de {total}. Usa la
                  búsqueda o el filtro de estado para encontrar el resto.
                </p>
              )}
            </>
          ))}
      </div>

      {editor && (
        <Modal
          title={editor.mode === 'edit' ? 'Editar candidatura' : 'Nueva candidatura'}
          description={
            editor.mode === 'edit'
              ? `${editor.application.position} · ${editor.application.company}`
              : 'Los campos marcados con * son obligatorios.'
          }
          onClose={closeEditor}
        >
          <ApplicationForm
            initialValues={
              editor.mode === 'edit'
                ? formValuesFromApplication(editor.application)
                : { ...emptyFormValues(), applied_date: todayIso() }
            }
            submitLabel={editor.mode === 'edit' ? 'Guardar cambios' : 'Añadir candidatura'}
            onSubmit={handleSubmit}
            onCancel={closeEditor}
          />
        </Modal>
      )}

      {followUpAction?.kind === 'complete' && (
        <CompleteFollowUpDialog
          application={followUpAction.application}
          onComplete={handleCompleteFollowUp}
          onClose={() => setFollowUpAction(null)}
        />
      )}

      {followUpAction?.kind === 'date' && (
        <ChangeFollowUpDateDialog
          application={followUpAction.application}
          onSave={handleChangeFollowUpDate}
          onClose={() => setFollowUpAction(null)}
        />
      )}

      {toDelete && (
        <ConfirmDialog
          title="¿Eliminar candidatura?"
          message={`Se eliminará «${toDelete.position}» en ${toDelete.company}. Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          onConfirm={handleDelete}
          onCancel={closeDelete}
          loading={deleting}
          error={deleteError}
        />
      )}

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
        {notice && (
          <p
            role="status"
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg"
          >
            {notice}
          </p>
        )}
      </div>
    </>
  )
}
