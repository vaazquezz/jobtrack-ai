import { useId, useState, type FormEvent } from 'react'
import { addDays } from '../lib/followUps'
import { formatDate, todayIso } from '../lib/format'
import type { Application } from '../types/application'
import { Modal } from './Modal'
import { AlertIcon, Button, CheckIcon } from './ui'

const QUICK_OPTIONS = [
  { label: 'En 3 días', days: 3 },
  { label: 'En 1 semana', days: 7 },
  { label: 'En 2 semanas', days: 14 },
]

const dateInputClass =
  'block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 aria-[invalid=true]:ring-rose-400'

/** Validate a follow-up date against the application's applied date (same rule as the API). */
function dateError(value: string, application: Application, required: boolean): string | null {
  if (!value) return required ? 'Elige una fecha.' : null
  if (application.applied_date && value < application.applied_date) {
    return `No puede ser anterior a la fecha de solicitud (${formatDate(application.applied_date)}).`
  }
  return null
}

interface DatePickerProps {
  id: string
  label: string
  value: string
  min?: string
  error: string | null
  onChange: (value: string) => void
}

function FollowUpDatePicker({ id, label, value, min, error, onChange }: DatePickerProps) {
  const today = todayIso()
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        min={min}
        onChange={(event) => onChange(event.target.value)}
        className={dateInputClass}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      <div className="mt-2 flex flex-wrap gap-1.5">
        {QUICK_OPTIONS.map((option) => (
          <button
            key={option.days}
            type="button"
            onClick={() => onChange(addDays(today, option.days))}
            className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 hover:text-slate-800"
          >
            {option.label}
          </button>
        ))}
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-rose-600">
          {error}
        </p>
      )}
    </div>
  )
}

function SubmitError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
      <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
      {message}
    </p>
  )
}

const describe = (application: Application) =>
  `${application.position} · ${application.company}`

// --- Change or remove the date --------------------------------------------------------

interface ChangeDateDialogProps {
  application: Application
  /** Save a new date, or `null` to remove the follow-up. */
  onSave: (date: string | null) => Promise<void>
  onClose: () => void
}

export function ChangeFollowUpDateDialog({ application, onSave, onClose }: ChangeDateDialogProps) {
  const id = useId()
  const [value, setValue] = useState(application.follow_up_date ?? '')
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const error = touched ? dateError(value, application, true) : null

  const save = async (date: string | null) => {
    setSaving(true)
    setSubmitError(null)
    try {
      await onSave(date)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'No se pudo guardar.')
      setSaving(false)
    }
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    setTouched(true)
    if (dateError(value, application, true)) return
    void save(value)
  }

  return (
    <Modal
      title="Fecha de seguimiento"
      description={describe(application)}
      onClose={onClose}
      locked={saving}
      size="sm"
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <FollowUpDatePicker
          id={`${id}-date`}
          label="Nueva fecha"
          value={value}
          min={application.applied_date ?? undefined}
          error={error}
          onChange={(next) => {
            setValue(next)
            setTouched(true)
          }}
        />
        <SubmitError message={submitError} />
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:items-center">
          {application.follow_up_date && (
            <button
              type="button"
              className="rounded-lg px-3.5 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-2 focus-visible:outline-rose-600 disabled:opacity-60 sm:mr-auto"
              onClick={() => void save(null)}
              disabled={saving}
            >
              Quitar seguimiento
            </button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>
            Guardar fecha
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// --- Mark as done -----------------------------------------------------------------

interface CompleteDialogProps {
  application: Application
  /** Complete the follow-up, optionally scheduling the next one. */
  onComplete: (nextDate: string | null) => Promise<void>
  onClose: () => void
}

export function CompleteFollowUpDialog({ application, onComplete, onClose }: CompleteDialogProps) {
  const id = useId()
  const [scheduleNext, setScheduleNext] = useState(false)
  const [nextDate, setNextDate] = useState(() => addDays(todayIso(), 7))
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const error = scheduleNext ? dateError(nextDate, application, true) : null

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (error) return
    setSaving(true)
    setSubmitError(null)
    try {
      await onComplete(scheduleNext ? nextDate : null)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'No se pudo guardar.')
      setSaving(false)
    }
  }

  return (
    <Modal
      title="Marcar seguimiento como hecho"
      description={describe(application)}
      onClose={onClose}
      locked={saving}
      size="sm"
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <p className="text-sm text-slate-600">
          Dejará de aparecer como pendiente y se añadirá a las notas la línea «Seguimiento
          realizado el {formatDate(todayIso())}».
        </p>
        <label className="flex items-center gap-2.5 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={scheduleNext}
            onChange={(event) => setScheduleNext(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
          />
          Programar el siguiente seguimiento
        </label>
        {scheduleNext && (
          <FollowUpDatePicker
            id={`${id}-next`}
            label="Próximo seguimiento"
            value={nextDate}
            min={application.applied_date ?? undefined}
            error={error}
            onChange={setNextDate}
          />
        )}
        <SubmitError message={submitError} />
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>
            <CheckIcon />
            Marcar como hecho
          </Button>
        </div>
      </form>
    </Modal>
  )
}
