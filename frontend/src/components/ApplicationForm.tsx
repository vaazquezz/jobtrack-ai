import { useState, type FormEvent, type ReactNode } from 'react'
import {
  LIMITS,
  toPayload,
  validateApplicationForm,
  type ApplicationFormValues,
  type FormErrors,
} from '../lib/validation'
import type { ApplicationPayload } from '../types/application'
import { APPLICATION_STATUSES, STATUS_LABELS } from '../types/application'
import { AlertIcon, Button } from './ui'

interface ApplicationFormProps {
  initialValues: ApplicationFormValues
  submitLabel: string
  onSubmit: (payload: ApplicationPayload) => Promise<void>
  onCancel: () => void
}

const inputClass =
  'block w-full rounded-lg border-0 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 aria-[invalid=true]:ring-rose-400 aria-[invalid=true]:focus:ring-rose-500'

interface FieldProps {
  id: string
  label: string
  error?: string
  hint?: string
  required?: boolean
  className?: string
  children: ReactNode
}

function Field({ id, label, error, hint, required, className = '', children }: FieldProps) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required && (
          <span className="text-rose-500" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-rose-600">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      )}
    </div>
  )
}

export function ApplicationForm({
  initialValues,
  submitLabel,
  onSubmit,
  onCancel,
}: ApplicationFormProps) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const set =
    (field: keyof ApplicationFormValues) =>
    (event: { target: { value: string } }) => {
      const value = event.target.value
      setValues((current) => ({ ...current, [field]: value }))
      if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }))
    }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const validationErrors = validateApplicationForm(values)
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0) {
      const firstInvalid = Object.keys(validationErrors)[0]
      document.getElementById(`field-${firstInvalid}`)?.focus()
      return
    }

    setSubmitting(true)
    setSubmitError(null)
    try {
      await onSubmit(toPayload(values))
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'No se pudo guardar.')
      setSubmitting(false)
    }
  }

  const invalid = (field: keyof ApplicationFormValues) => ({
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': errors[field] ? `field-${field}-error` : undefined,
  })

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="field-company" label="Empresa" required error={errors.company}>
          <input
            id="field-company"
            type="text"
            autoFocus
            autoComplete="organization"
            maxLength={LIMITS.company}
            value={values.company}
            onChange={set('company')}
            placeholder="Nombre de la empresa"
            className={inputClass}
            {...invalid('company')}
          />
        </Field>

        <Field id="field-position" label="Puesto" required error={errors.position}>
          <input
            id="field-position"
            type="text"
            maxLength={LIMITS.position}
            value={values.position}
            onChange={set('position')}
            placeholder="Ej. Desarrollador/a Backend"
            className={inputClass}
            {...invalid('position')}
          />
        </Field>

        <Field id="field-url" label="Enlace a la oferta" error={errors.url} className="sm:col-span-2">
          <input
            id="field-url"
            type="url"
            inputMode="url"
            maxLength={LIMITS.url}
            value={values.url}
            onChange={set('url')}
            placeholder="https://"
            className={inputClass}
            {...invalid('url')}
          />
        </Field>

        <Field id="field-status" label="Estado" error={errors.status}>
          <select
            id="field-status"
            value={values.status}
            onChange={set('status')}
            className={inputClass}
            {...invalid('status')}
          >
            {APPLICATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </Field>

        <Field id="field-applied_date" label="Fecha de solicitud" error={errors.applied_date}>
          <input
            id="field-applied_date"
            type="date"
            value={values.applied_date}
            onChange={set('applied_date')}
            className={inputClass}
            {...invalid('applied_date')}
          />
        </Field>

        <Field
          id="field-follow_up_date"
          label="Fecha de seguimiento"
          error={errors.follow_up_date}
          hint="Cuándo quieres volver a contactar o revisar el estado."
          className="sm:col-span-2"
        >
          <input
            id="field-follow_up_date"
            type="date"
            min={values.applied_date || undefined}
            value={values.follow_up_date}
            onChange={set('follow_up_date')}
            className={`${inputClass} sm:max-w-[calc(50%-0.625rem)]`}
            {...invalid('follow_up_date')}
          />
        </Field>

        <Field
          id="field-notes"
          label="Notas"
          error={errors.notes}
          hint={`${values.notes.length}/${LIMITS.notes} caracteres`}
          className="sm:col-span-2"
        >
          <textarea
            id="field-notes"
            rows={4}
            maxLength={LIMITS.notes}
            value={values.notes}
            onChange={set('notes')}
            placeholder="Contactos, impresiones, próximos pasos…"
            className={`${inputClass} resize-y`}
            {...invalid('notes')}
          />
        </Field>
      </div>

      {submitError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
        >
          <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {submitError}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
        <Button type="submit" loading={submitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
