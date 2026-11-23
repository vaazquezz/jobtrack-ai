import { useCallback, useEffect, useState } from 'react'
import { LIST_LIMIT } from '../api/applications'
import { useApplications } from '../hooks/useApplications'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { todayIso } from '../lib/format'
import { emptyFormValues, formValuesFromApplication } from '../lib/validation'
import type { Application, ApplicationPayload, ApplicationStatus } from '../types/application'
import { ApplicationForm } from './ApplicationForm'
import { ApplicationList } from './ApplicationList'
import { ConfirmDialog } from './ConfirmDialog'
import { FilterBar } from './FilterBar'
import { Modal } from './Modal'
import { EmptyState, ErrorState, LoadingState, NoResultsState } from './states'
import { Button, PlusIcon } from './ui'

type Editor = { mode: 'create' } | { mode: 'edit'; application: Application } | null

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
  const { applications, total, loadState, refreshing, reload, create, update, remove } =
    useApplications({ query: debouncedQuery, status })
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

  const handleSubmit = async (payload: ApplicationPayload) => {
    if (editor?.mode === 'edit') {
      await update(editor.application.id, payload)
      setNotice('Candidatura actualizada.')
    } else {
      await create(payload)
      setNotice('Candidatura añadida.')
    }
    setEditor(null)
  }

  const handleDelete = async () => {
    if (!toDelete) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await remove(toDelete.id)
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
  const filtered = debouncedQuery.trim() !== '' || status !== null
  const ready = loadState.status === 'ready'
  const noApplicationsAtAll = ready && total === 0 && !filtered
  const truncated = ready && applications.length < total

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Candidaturas
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {ready
              ? countLabel(total, filtered)
              : 'Gestiona tus procesos de selección en un solo lugar.'}
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
        <div className="mt-6">
          <FilterBar
            query={query}
            status={status}
            onQueryChange={setQuery}
            onStatusChange={setStatus}
            onClear={clearFilters}
          />
        </div>
      )}

      <div
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
                onEdit={(application) => setEditor({ mode: 'edit', application })}
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
