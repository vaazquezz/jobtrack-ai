/**
 * Client-side validation for the application form.
 * Mirrors the backend rules in backend/app/models.py so users get instant feedback;
 * the API remains the source of truth and its errors are still shown.
 */

import type { Application, ApplicationPayload, ApplicationStatus } from '../types/application'
import { APPLICATION_STATUSES } from '../types/application'

export const LIMITS = {
  company: 200,
  position: 200,
  url: 2000,
  notes: 5000,
} as const

/** Raw form state: every field is a string, as it comes from the inputs. */
export interface ApplicationFormValues {
  company: string
  position: string
  url: string
  applied_date: string
  status: ApplicationStatus
  notes: string
  follow_up_date: string
}

export type FormErrors = Partial<Record<keyof ApplicationFormValues, string>>

export function emptyFormValues(): ApplicationFormValues {
  return {
    company: '',
    position: '',
    url: '',
    applied_date: '',
    status: 'applied',
    notes: '',
    follow_up_date: '',
  }
}

export function formValuesFromApplication(application: Application): ApplicationFormValues {
  return {
    company: application.company,
    position: application.position,
    url: application.url ?? '',
    applied_date: application.applied_date ?? '',
    status: application.status,
    notes: application.notes ?? '',
    follow_up_date: application.follow_up_date ?? '',
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== ''
  } catch {
    return false
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

export function validateApplicationForm(values: ApplicationFormValues): FormErrors {
  const errors: FormErrors = {}

  const company = values.company.trim()
  if (!company) errors.company = 'La empresa es obligatoria.'
  else if (company.length > LIMITS.company)
    errors.company = `Máximo ${LIMITS.company} caracteres.`

  const position = values.position.trim()
  if (!position) errors.position = 'El puesto es obligatorio.'
  else if (position.length > LIMITS.position)
    errors.position = `Máximo ${LIMITS.position} caracteres.`

  const url = values.url.trim()
  if (url) {
    if (url.length > LIMITS.url) errors.url = `Máximo ${LIMITS.url} caracteres.`
    else if (!isHttpUrl(url)) errors.url = 'Introduce una URL válida que empiece por http:// o https://.'
  }

  if (!APPLICATION_STATUSES.includes(values.status)) errors.status = 'Estado no válido.'

  if (values.notes.trim().length > LIMITS.notes)
    errors.notes = `Máximo ${LIMITS.notes} caracteres.`

  if (values.applied_date && !isValidDate(values.applied_date))
    errors.applied_date = 'Fecha no válida.'
  if (values.follow_up_date && !isValidDate(values.follow_up_date))
    errors.follow_up_date = 'Fecha no válida.'

  if (
    !errors.applied_date &&
    !errors.follow_up_date &&
    values.applied_date &&
    values.follow_up_date &&
    values.follow_up_date < values.applied_date
  ) {
    errors.follow_up_date = 'El seguimiento no puede ser anterior a la fecha de solicitud.'
  }

  return errors
}

/** Convert form values into the API payload: trim text and send empty fields as null. */
export function toPayload(values: ApplicationFormValues): ApplicationPayload {
  const optional = (value: string) => value.trim() || null
  return {
    company: values.company.trim(),
    position: values.position.trim(),
    url: optional(values.url),
    applied_date: values.applied_date || null,
    status: values.status,
    notes: optional(values.notes),
    follow_up_date: values.follow_up_date || null,
  }
}
