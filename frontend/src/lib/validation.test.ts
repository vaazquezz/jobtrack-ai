import { describe, expect, it } from 'vitest'
import type { Application } from '../types/application'
import {
  emptyFormValues,
  formValuesFromApplication,
  toPayload,
  validateApplicationForm,
  type ApplicationFormValues,
} from './validation'

const valid = (overrides: Partial<ApplicationFormValues> = {}): ApplicationFormValues => ({
  ...emptyFormValues(),
  company: 'Example Corp',
  position: 'Backend Developer',
  ...overrides,
})

describe('validateApplicationForm', () => {
  it('accepts a minimal valid form', () => {
    expect(validateApplicationForm(valid())).toEqual({})
  })

  it('accepts a complete valid form', () => {
    const errors = validateApplicationForm(
      valid({
        url: 'https://example.com/jobs/1',
        applied_date: '2026-11-01',
        follow_up_date: '2026-11-08',
        notes: 'Some notes',
        status: 'interview',
      }),
    )
    expect(errors).toEqual({})
  })

  it('requires company and position, ignoring surrounding spaces', () => {
    const errors = validateApplicationForm(valid({ company: '   ', position: '' }))
    expect(errors.company).toBe('La empresa es obligatoria.')
    expect(errors.position).toBe('El puesto es obligatorio.')
  })

  it('enforces the same length limits as the API', () => {
    const errors = validateApplicationForm(
      valid({ company: 'x'.repeat(201), position: 'x'.repeat(201), notes: 'x'.repeat(5001) }),
    )
    expect(errors.company).toMatch(/200/)
    expect(errors.position).toMatch(/200/)
    expect(errors.notes).toMatch(/5000/)
  })

  it.each(['example.com', 'not a url', 'ftp://example.com/job', 'javascript:alert(1)'])(
    'rejects invalid or non-http URL %s',
    (url) => {
      expect(validateApplicationForm(valid({ url })).url).toBeDefined()
    },
  )

  it.each(['http://example.com', 'https://jobs.example.com/offer?id=42'])(
    'accepts http(s) URL %s',
    (url) => {
      expect(validateApplicationForm(valid({ url })).url).toBeUndefined()
    },
  )

  it('rejects a follow-up date earlier than the applied date', () => {
    const errors = validateApplicationForm(
      valid({ applied_date: '2026-11-10', follow_up_date: '2026-11-01' }),
    )
    expect(errors.follow_up_date).toBe(
      'El seguimiento no puede ser anterior a la fecha de solicitud.',
    )
  })

  it('accepts a follow-up date on the same day as the application', () => {
    const errors = validateApplicationForm(
      valid({ applied_date: '2026-11-10', follow_up_date: '2026-11-10' }),
    )
    expect(errors).toEqual({})
  })

  it('rejects impossible dates', () => {
    expect(validateApplicationForm(valid({ applied_date: '2026-02-30' })).applied_date).toBe(
      'Fecha no válida.',
    )
  })
})

describe('toPayload', () => {
  it('trims text and turns empty optional fields into null', () => {
    const payload = toPayload(
      valid({ company: '  Acme ', position: ' Dev ', url: '  ', notes: '   ' }),
    )
    expect(payload).toEqual({
      company: 'Acme',
      position: 'Dev',
      url: null,
      applied_date: null,
      status: 'applied',
      notes: null,
      follow_up_date: null,
    })
  })

  it('round-trips an existing application through the form values', () => {
    const application: Application = {
      id: 1,
      company: 'Example Corp',
      position: 'Backend Developer',
      url: null,
      applied_date: '2026-11-01',
      status: 'offer',
      notes: null,
      follow_up_date: null,
      created_at: '2026-11-01T10:00:00Z',
      updated_at: '2026-11-01T10:00:00Z',
    }
    const values = formValuesFromApplication(application)
    expect(values.url).toBe('')
    expect(toPayload(values)).toEqual({
      company: 'Example Corp',
      position: 'Backend Developer',
      url: null,
      applied_date: '2026-11-01',
      status: 'offer',
      notes: null,
      follow_up_date: null,
    })
  })
})
