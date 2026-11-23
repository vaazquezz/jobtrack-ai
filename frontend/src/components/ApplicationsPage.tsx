import { useCallback, useEffect, useState } from 'react'
import { useApplications } from '../hooks/useApplications'
import { todayIso } from '../lib/format'
import { emptyFormValues, formValuesFromApplication } from '../lib/validation'
import type { Application, ApplicationPayload } from '../types/application'
import { ApplicationForm } from './ApplicationForm'
import { ApplicationList } from './ApplicationList'
import { ConfirmDialog } from './ConfirmDialog'
import { Modal } from './Modal'
import { EmptyState, ErrorState, LoadingState } from './states'
import { Button, PlusIcon } from './ui'

type Editor = { mode: 'create' } | { mode: 'edit'; application: Application } | null

export function ApplicationsPage() {
  const { applications, loadState, reload, create, update, remove } = useApplications()
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

  const count = applications.length

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Candidaturas
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {loadState.status === 'ready'
              ? count === 1
                ? '1 candidatura registrada'
                : `${count} candidaturas registradas`
              : 'Gestiona tus procesos de selección en un solo lugar.'}
          </p>
        </div>
        {loadState.status === 'ready' && count > 0 && (
          <Button onClick={openCreate} className="w-full sm:w-auto">
            <PlusIcon />
            Nueva candidatura
          </Button>
        )}
      </div>

      <div className="mt-6">
        {loadState.status === 'loading' && <LoadingState />}
        {loadState.status === 'error' && <ErrorState message={loadState.message} onRetry={reload} />}
        {loadState.status === 'ready' &&
          (count === 0 ? (
            <EmptyState onCreate={openCreate} />
          ) : (
            <ApplicationList
              applications={applications}
              onEdit={(application) => setEditor({ mode: 'edit', application })}
              onDelete={setToDelete}
            />
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
