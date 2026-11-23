import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays } from '../lib/followUps'
import { todayIso } from '../lib/format'
import type { Application } from '../types/application'
import { ApplicationsPage } from './ApplicationsPage'

// --- Fake API -------------------------------------------------------------------

interface Call {
  method: string
  url: string
  body?: Record<string, unknown>
}

function makeApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: 1,
    company: 'Example Corp',
    position: 'Backend Developer',
    url: 'https://example.com/jobs/1',
    applied_date: '2026-11-01',
    status: 'applied',
    notes: null,
    follow_up_date: '2026-11-08',
    created_at: '2026-11-01T10:00:00Z',
    updated_at: '2026-11-01T10:00:00Z',
    ...overrides,
  }
}

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

/** In-memory stand-in for the FastAPI endpoints, installed as global fetch. */
interface FakeApiOptions {
  failList?: number
  /** Number of PATCH requests that fail with a 500 before they start succeeding. */
  failPatches?: number
  /** When set, PATCH responses wait until this promise resolves. */
  patchGate?: Promise<void>
  /** Weekly series returned by the fake /api/stats (it does not compute weeks). */
  statsWeekly?: { week_start: string; count: number }[]
  failStats?: number
  /** Response of GET /api/analysis/config (default: AI not available). */
  analysisConfig?: Record<string, unknown>
  /** Response of POST /api/analysis, or an error status and detail. */
  analysisResult?: Record<string, unknown>
  analysisError?: { status: number; detail: string }
}

function installFakeApi(initial: Application[] = [], options: FakeApiOptions = {}) {
  let items = [...initial]
  let nextId = Math.max(0, ...items.map((item) => item.id)) + 1
  let listFailures = options.failList ?? 0
  let patchFailures = options.failPatches ?? 0
  let statsFailures = options.failStats ?? 0
  const calls: Call[] = []

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input)
    const method = init.method ?? 'GET'
    const body = init.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method, url, body })

    const match = url.match(/^\/api\/applications\/(\d+)$/)
    if (method === 'GET' && url.startsWith('/api/applications?')) {
      if (listFailures > 0) {
        listFailures -= 1
        return json(500, { detail: 'Internal Server Error' })
      }
      // Mirror the backend: case-insensitive match on company or position, plus status.
      const params = new URL(url, 'http://localhost').searchParams
      const q = params.get('q')?.trim().toLocaleLowerCase() ?? ''
      const status = params.get('status')
      const matches = items.filter(
        (item) =>
          (!q ||
            item.company.toLocaleLowerCase().includes(q) ||
            item.position.toLocaleLowerCase().includes(q)) &&
          (!status || item.status === status),
      )
      const response = json(200, matches)
      response.headers.set('X-Total-Count', String(matches.length))
      return response
    }
    if (method === 'POST' && url === '/api/applications') {
      const created = makeApplication({ ...body, id: nextId++ })
      items = [created, ...items]
      return json(201, created)
    }
    if (method === 'GET' && url.startsWith('/api/follow-ups?')) {
      // Mirror GET /api/follow-ups: same filters, grouped around ?today=.
      const params = new URL(url, 'http://localhost').searchParams
      const today = params.get('today') as string
      const q = params.get('q')?.trim().toLocaleLowerCase() ?? ''
      const status = params.get('status')
      const withDate = items
        .filter(
          (item) =>
            item.follow_up_date &&
            (!q ||
              item.company.toLocaleLowerCase().includes(q) ||
              item.position.toLocaleLowerCase().includes(q)) &&
            (!status || item.status === status),
        )
        .sort((a, b) => (a.follow_up_date as string).localeCompare(b.follow_up_date as string))
      const overdue = withDate.filter((item) => (item.follow_up_date as string) < today)
      const dueToday = withDate.filter((item) => item.follow_up_date === today)
      const upcoming = withDate.filter((item) => (item.follow_up_date as string) > today)
      return json(200, {
        today,
        overdue,
        due_today: dueToday,
        upcoming,
        counts: {
          overdue: overdue.length,
          today: dueToday.length,
          upcoming: upcoming.length,
          pending: overdue.length + dueToday.length,
        },
      })
    }
    if (method === 'GET' && url === '/api/analysis/config') {
      return json(
        200,
        options.analysisConfig ?? {
          ai_available: false,
          provider: null,
          model: null,
          min_chars: 30,
          max_chars: 20000,
        },
      )
    }
    if (method === 'POST' && url === '/api/analysis') {
      if (options.analysisError) {
        return json(options.analysisError.status, { detail: options.analysisError.detail })
      }
      return json(200, options.analysisResult ?? {})
    }
    if (method === 'GET' && url.startsWith('/api/stats?')) {
      if (statsFailures > 0) {
        statsFailures -= 1
        return json(500, { detail: 'Internal Server Error' })
      }
      // Same definitions as the backend; the period uses applied date or creation date.
      const params = new URL(url, 'http://localhost').searchParams
      const today = params.get('today') as string
      const period = params.get('period') as 'all' | '30d' | '90d'
      const days = period === 'all' ? null : Number(period.replace('d', ''))
      const start = days === null ? null : addDays(today, -(days - 1))
      const inPeriod = items.filter((item) => {
        const ref = item.applied_date ?? item.created_at.slice(0, 10)
        return ref <= today && (start === null || ref >= start)
      })
      const count = (statuses: string[]) =>
        inPeriod.filter((item) => statuses.includes(item.status)).length
      const submitted = inPeriod.length - count(['wishlist'])
      const responded = count(['interview', 'offer', 'rejected'])
      const interviews = count(['interview', 'offer'])
      const offers = count(['offer'])
      const rate = (n: number) => (submitted ? Math.round((n / submitted) * 10000) / 10000 : null)
      return json(200, {
        period,
        today,
        start,
        total: inPeriod.length,
        by_status: Object.fromEntries(
          ['wishlist', 'applied', 'interview', 'offer', 'rejected'].map((st) => [st, count([st])]),
        ),
        submitted,
        responded,
        interviews,
        offers,
        response_rate: rate(responded),
        interview_rate: rate(interviews),
        offer_rate: rate(offers),
        weekly: options.statsWeekly ?? [],
        undated_submitted: inPeriod.filter((i) => i.status !== 'wishlist' && !i.applied_date).length,
      })
    }
    const complete = url.match(/^\/api\/applications\/(\d+)\/follow-up\/complete$/)
    if (method === 'POST' && complete) {
      const id = Number(complete[1])
      const existing = items.find((item) => item.id === id)
      if (!existing) return json(404, { detail: `Application ${id} not found` })
      if (!existing.follow_up_date) {
        return json(409, { detail: 'This application has no pending follow-up' })
      }
      const [y, m, d] = (body.completed_on as string).split('-')
      const note = `Seguimiento realizado el ${d}/${m}/${y}.`
      const updated = {
        ...existing,
        follow_up_date: body.next_follow_up_date ?? null,
        notes: existing.notes ? `${existing.notes}\n${note}` : note,
      }
      items = items.map((item) => (item.id === id ? updated : item))
      return json(200, updated)
    }
    if (match) {
      const id = Number(match[1])
      const existing = items.find((item) => item.id === id)
      if (!existing) return json(404, { detail: `Application ${id} not found` })
      if (method === 'PATCH') {
        if (options.patchGate) await options.patchGate
        if (patchFailures > 0) {
          patchFailures -= 1
          return json(500, { detail: 'Internal Server Error' })
        }
        const updated = { ...existing, ...body }
        items = items.map((item) => (item.id === id ? updated : item))
        return json(200, updated)
      }
      if (method === 'DELETE') {
        items = items.filter((item) => item.id !== id)
        return json(204)
      }
    }
    return json(404, { detail: 'Not Found' })
  })

  vi.stubGlobal('fetch', fetchMock)
  /** Query strings of every list request, e.g. ["limit=200", "q=acme&limit=200"]. */
  const listQueries = () =>
    calls
      .filter((call) => call.method === 'GET' && call.url.startsWith('/api/applications?'))
      .map((call) => call.url.split('?')[1])

  const statsQueries = () =>
    calls.filter((call) => call.url.startsWith('/api/stats?')).map((call) => call.url.split('?')[1])

  return { calls, listQueries, statsQueries, items: () => items, fetchMock }
}

function renderPage() {
  const user = userEvent.setup()
  render(<ApplicationsPage />)
  return user
}

// --- Tests ----------------------------------------------------------------------

// Freeze "today" so follow-up classification is deterministic. Only Date is faked, so
// timers (debounce, notices) and user-event keep working normally.
const FAKE_NOW = new Date('2026-11-23T10:00:00')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(FAKE_NOW)
})

afterEach(() => {
  vi.useRealTimers()
  // The selected view lives in the URL hash; reset it so tests stay independent.
  window.history.replaceState(null, '', '/')
})

describe('ApplicationsPage', () => {
  it('shows a loading state and then the empty state', async () => {
    installFakeApi([])
    renderPage()

    expect(screen.getByRole('status', { name: 'Cargando candidaturas' })).toBeInTheDocument()
    expect(await screen.findByText('Todavía no hay candidaturas')).toBeInTheDocument()
    expect(screen.getByText('0 candidaturas registradas')).toBeInTheDocument()
  })

  it('lists applications with company, position, date and status', async () => {
    installFakeApi([
      makeApplication(),
      makeApplication({
        id: 2,
        company: 'Acme Software',
        position: 'Frontend Engineer',
        status: 'interview',
        applied_date: null,
        follow_up_date: null,
      }),
    ])
    renderPage()

    const list = await screen.findByRole('list', { name: 'Candidaturas' })
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(2)

    expect(within(rows[0]).getByText('Example Corp')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Backend Developer')).toBeInTheDocument()
    expect(within(rows[0]).getByText('1 nov 2026')).toBeInTheDocument()
    expect(within(rows[0]).getByTitle('Fecha de seguimiento')).toHaveTextContent(
      'Seguimiento: Vencido · 8 nov 2026',
    )
    expect(within(rows[0]).getByText('Aplicada')).toBeInTheDocument()
    expect(
      within(rows[0]).getByRole('link', { name: /Abrir oferta de Backend Developer/ }),
    ).toHaveAttribute('href', 'https://example.com/jobs/1')

    expect(within(rows[1]).getByText('Acme Software')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Sin fecha')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Entrevista')).toBeInTheDocument()
    expect(screen.getByText('2 candidaturas registradas')).toBeInTheDocument()
  })

  it('shows an error when loading fails and recovers on retry', async () => {
    installFakeApi([makeApplication()], { failList: 1 })
    const user = renderPage()

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No se pudieron cargar las candidaturas')
    expect(alert).toHaveTextContent('Internal Server Error')

    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('Example Corp')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('creates an application from the form', async () => {
    const api = installFakeApi([])
    const user = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Añadir candidatura' }))
    const dialog = screen.getByRole('dialog', { name: 'Nueva candidatura' })
    await user.type(within(dialog).getByLabelText(/Empresa/), '  Globex Labs ')
    await user.type(within(dialog).getByLabelText(/Puesto/), 'Data Analyst')
    await user.type(within(dialog).getByLabelText('Enlace a la oferta'), 'https://example.com/x')
    await user.selectOptions(within(dialog).getByLabelText('Estado'), 'wishlist')
    await user.type(within(dialog).getByLabelText('Notas'), 'Fictional test note')
    await user.click(within(dialog).getByRole('button', { name: 'Añadir candidatura' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(api.calls.find((call) => call.method === 'POST')?.body).toEqual({
      company: 'Globex Labs',
      position: 'Data Analyst',
      url: 'https://example.com/x',
      applied_date: todayIso(),
      status: 'wishlist',
      notes: 'Fictional test note',
      follow_up_date: null,
    })
    const list = await screen.findByRole('list', { name: 'Candidaturas' })
    expect(within(list).getByText('Globex Labs')).toBeInTheDocument()
    expect(within(list).getByText('Por aplicar')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Candidatura añadida.')
  })

  it('blocks submission and shows field errors when the form is invalid', async () => {
    const api = installFakeApi([])
    const user = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Añadir candidatura' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('Enlace a la oferta'), 'no-es-una-url')
    await user.click(within(dialog).getByRole('button', { name: 'Añadir candidatura' }))

    expect(within(dialog).getByText('La empresa es obligatoria.')).toBeInTheDocument()
    expect(within(dialog).getByText('El puesto es obligatorio.')).toBeInTheDocument()
    expect(within(dialog).getByText(/URL válida/)).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/Empresa/)).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialog).getByLabelText(/Empresa/)).toHaveFocus()
    expect(api.calls.some((call) => call.method === 'POST')).toBe(false)
  })

  it('shows the API error inside the form when saving fails', async () => {
    const api = installFakeApi([])
    const user = renderPage()
    await user.click(await screen.findByRole('button', { name: 'Añadir candidatura' }))

    api.fetchMock.mockResolvedValueOnce(
      json(422, { detail: [{ loc: ['body', 'company'], msg: 'Value error, must not be blank' }] }),
    )
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText(/Empresa/), 'Acme')
    await user.type(within(dialog).getByLabelText(/Puesto/), 'QA')
    await user.click(within(dialog).getByRole('button', { name: 'Añadir candidatura' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'company: must not be blank',
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('edits an application with the form pre-filled', async () => {
    const api = installFakeApi([makeApplication({ notes: 'Original note' })])
    const user = renderPage()

    await user.click(
      await screen.findByRole('button', { name: 'Editar Backend Developer en Example Corp' }),
    )
    const dialog = screen.getByRole('dialog', { name: 'Editar candidatura' })
    expect(within(dialog).getByLabelText(/Empresa/)).toHaveValue('Example Corp')
    expect(within(dialog).getByLabelText('Notas')).toHaveValue('Original note')
    expect(within(dialog).getByLabelText('Fecha de solicitud')).toHaveValue('2026-11-01')

    await user.selectOptions(within(dialog).getByLabelText('Estado'), 'offer')
    await user.clear(within(dialog).getByLabelText('Notas'))
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const patch = api.calls.find((call) => call.method === 'PATCH')
    expect(patch?.url).toBe('/api/applications/1')
    expect(patch?.body).toMatchObject({ status: 'offer', notes: null })
    expect(
      within(screen.getByRole('list', { name: 'Candidaturas' })).getByText('Oferta'),
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Candidatura actualizada.')
  })

  it('asks for confirmation before deleting and only deletes when confirmed', async () => {
    const api = installFakeApi([makeApplication()])
    const user = renderPage()

    const deleteButton = await screen.findByRole('button', {
      name: 'Eliminar Backend Developer en Example Corp',
    })
    await user.click(deleteButton)
    let dialog = screen.getByRole('dialog', { name: '¿Eliminar candidatura?' })
    expect(dialog).toHaveTextContent('Esta acción no se puede deshacer.')

    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.calls.some((call) => call.method === 'DELETE')).toBe(false)
    expect(screen.getByText('Example Corp')).toBeInTheDocument()

    await user.click(deleteButton)
    dialog = screen.getByRole('dialog', { name: '¿Eliminar candidatura?' })
    await user.click(within(dialog).getByRole('button', { name: 'Eliminar' }))

    expect(await screen.findByText('Todavía no hay candidaturas')).toBeInTheDocument()
    expect(api.calls.find((call) => call.method === 'DELETE')?.url).toBe('/api/applications/1')
    expect(api.items()).toHaveLength(0)
  })

  it('closes the form with Escape without saving', async () => {
    const api = installFakeApi([])
    const user = renderPage()

    await user.click(await screen.findByRole('button', { name: 'Añadir candidatura' }))
    await user.type(screen.getByLabelText(/Empresa/), 'Draft')
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(api.calls.some((call) => call.method === 'POST')).toBe(false)
  })
})

// --- Search and filters ---------------------------------------------------------

const SAMPLE: Application[] = [
  makeApplication({ id: 1, company: 'Example Corp', position: 'Backend Developer', status: 'applied' }),
  makeApplication({ id: 2, company: 'Acme Software', position: 'Frontend Engineer', status: 'interview' }),
  makeApplication({ id: 3, company: 'Globex Labs', position: 'Data Analyst', status: 'applied' }),
  makeApplication({ id: 4, company: 'Initech', position: 'Backend Engineer', status: 'rejected' }),
]

const listedCompanies = () =>
  within(screen.getByRole('list', { name: 'Candidaturas' }))
    .getAllByRole('listitem')
    .map((row) => row.querySelector('[title]')?.textContent)

const statusButton = (name: string) =>
  within(screen.getByRole('group', { name: 'Filtrar por estado' })).getByRole('button', { name })

describe('ApplicationsPage search and filters', () => {
  it('searches by company or position, case-insensitively, through the API', async () => {
    const api = installFakeApi(SAMPLE)
    const user = renderPage()
    await screen.findByRole('list', { name: 'Candidaturas' })

    await user.type(screen.getByLabelText('Buscar por empresa o puesto'), 'BACKEND')

    await waitFor(() => expect(listedCompanies()).toEqual(['Example Corp', 'Initech']))
    expect(screen.getByText('2 resultados')).toBeInTheDocument()
    // Debounced: one request for the final text, none per keystroke.
    expect(api.listQueries().filter((q) => q.includes('q='))).toEqual(['q=BACKEND&limit=200'])

    await user.clear(screen.getByLabelText('Buscar por empresa o puesto'))
    await user.type(screen.getByLabelText('Buscar por empresa o puesto'), 'acme')
    await waitFor(() => expect(listedCompanies()).toEqual(['Acme Software']))
    expect(screen.getByText('1 resultado')).toBeInTheDocument()
  })

  it('filters by status and marks the active option', async () => {
    const api = installFakeApi(SAMPLE)
    const user = renderPage()
    await screen.findByRole('list', { name: 'Candidaturas' })
    expect(statusButton('Todas')).toHaveAttribute('aria-pressed', 'true')

    await user.click(statusButton('Aplicada'))

    await waitFor(() => expect(listedCompanies()).toEqual(['Example Corp', 'Globex Labs']))
    expect(statusButton('Aplicada')).toHaveAttribute('aria-pressed', 'true')
    expect(statusButton('Todas')).toHaveAttribute('aria-pressed', 'false')
    expect(api.listQueries()).toContain('status=applied&limit=200')

    await user.click(statusButton('Rechazada'))
    await waitFor(() => expect(listedCompanies()).toEqual(['Initech']))

    await user.click(statusButton('Todas'))
    await waitFor(() => expect(listedCompanies()).toHaveLength(4))
  })

  it('combines search and status filter', async () => {
    const api = installFakeApi(SAMPLE)
    const user = renderPage()
    await screen.findByRole('list', { name: 'Candidaturas' })

    await user.click(statusButton('Aplicada'))
    await user.type(screen.getByLabelText('Buscar por empresa o puesto'), 'backend')

    await waitFor(() => expect(listedCompanies()).toEqual(['Example Corp']))
    expect(api.listQueries()).toContain('q=backend&status=applied&limit=200')
    expect(screen.getByText('1 resultado')).toBeInTheDocument()
  })

  it('shows a no-results message and clears all filters', async () => {
    const api = installFakeApi(SAMPLE)
    const user = renderPage()
    await screen.findByRole('list', { name: 'Candidaturas' })

    await user.click(statusButton('Oferta'))
    await user.type(screen.getByLabelText('Buscar por empresa o puesto'), 'zzz')

    // Wait for the debounced search to reach the API before checking the message.
    await waitFor(() => expect(api.listQueries()).toContain('q=zzz&status=offer&limit=200'))
    expect(await screen.findByText('No hay candidaturas que coincidan')).toBeInTheDocument()
    expect(screen.getByText('0 resultados')).toBeInTheDocument()
    // The empty state for a brand-new tracker is not shown while filtering.
    expect(screen.queryByText('Todavía no hay candidaturas')).not.toBeInTheDocument()

    // Two "Limpiar filtros" buttons: one in the filter bar, one in the no-results state.
    const clearButtons = screen.getAllByRole('button', { name: 'Limpiar filtros' })
    expect(clearButtons).toHaveLength(2)
    const requestsBeforeClear = api.listQueries().length
    await user.click(clearButtons[1])

    await waitFor(() => expect(listedCompanies()).toHaveLength(4))
    // Clearing goes straight to the unfiltered list, without a stale "q=zzz" request.
    console.log('AFTER CLEAR', api.listQueries().slice(requestsBeforeClear), 'ALL', api.listQueries())
    expect(api.listQueries().slice(requestsBeforeClear)).toEqual(['limit=200'])
    expect(screen.getByLabelText('Buscar por empresa o puesto')).toHaveValue('')
    expect(statusButton('Todas')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).not.toBeInTheDocument()
    expect(api.listQueries().at(-1)).toBe('limit=200')
  })

  it('clears only the search text with the input clear button', async () => {
    installFakeApi(SAMPLE)
    const user = renderPage()
    await screen.findByRole('list', { name: 'Candidaturas' })

    await user.click(statusButton('Aplicada'))
    await user.type(screen.getByLabelText('Buscar por empresa o puesto'), 'globex')
    await waitFor(() => expect(listedCompanies()).toEqual(['Globex Labs']))

    await user.click(screen.getByRole('button', { name: 'Borrar búsqueda' }))

    await waitFor(() => expect(listedCompanies()).toEqual(['Example Corp', 'Globex Labs']))
    expect(statusButton('Aplicada')).toHaveAttribute('aria-pressed', 'true')
  })

  it('hides the filter bar when there are no applications at all', async () => {
    installFakeApi([])
    renderPage()

    expect(await screen.findByText('Todavía no hay candidaturas')).toBeInTheDocument()
    expect(screen.queryByLabelText('Buscar por empresa o puesto')).not.toBeInTheDocument()
  })

  it('keeps the list consistent with the active filter after editing', async () => {
    installFakeApi(SAMPLE)
    const user = renderPage()
    await screen.findByRole('list', { name: 'Candidaturas' })
    await user.click(statusButton('Entrevista'))
    await waitFor(() => expect(listedCompanies()).toEqual(['Acme Software']))

    await user.click(screen.getByRole('button', { name: 'Editar Frontend Engineer en Acme Software' }))
    await user.selectOptions(within(screen.getByRole('dialog')).getByLabelText('Estado'), 'offer')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    // Acme no longer has the "interview" status, so it leaves the filtered list.
    expect(await screen.findByText('No hay candidaturas que coincidan')).toBeInTheDocument()
  })
})

// --- Follow-ups -------------------------------------------------------------------
// "Today" is frozen at 2026-11-23 (see beforeEach above).

const FOLLOW_UP_SAMPLE: Application[] = [
  makeApplication({ id: 1, company: 'Example Corp', position: 'Backend Developer', status: 'applied', applied_date: '2026-11-01', follow_up_date: '2026-11-18' }),
  makeApplication({ id: 2, company: 'Acme Software', position: 'Frontend Engineer', status: 'interview', applied_date: '2026-11-05', follow_up_date: '2026-11-23' }),
  makeApplication({ id: 3, company: 'Globex Labs', position: 'Data Analyst', status: 'applied', applied_date: '2026-11-10', follow_up_date: '2026-11-25' }),
  makeApplication({ id: 4, company: 'Initech', position: 'Platform Engineer', status: 'offer', applied_date: '2026-11-12', follow_up_date: null }),
]

const followUpsTab = () => screen.getByRole('tab', { name: /Seguimientos/ })

/** Companies listed under a follow-up group heading ("Vencidos", "Para hoy", "Próximos"). */
const groupCompanies = (title: string) => {
  const section = screen.getByRole('region', { name: new RegExp(`^${title}`) })
  const list = within(section).queryByRole('list')
  if (!list) return []
  return within(list)
    .getAllByRole('listitem')
    .map((item) => item.querySelector('.font-semibold')?.textContent)
}

async function openFollowUps(user: ReturnType<typeof userEvent.setup>) {
  await waitFor(() => expect(within(followUpsTab()).getByText('2')).toBeInTheDocument())
  await user.click(followUpsTab())
  await screen.findByRole('region', { name: /^Vencidos/ })
}

describe('ApplicationsPage follow-ups', () => {
  it('shows a pending counter (overdue + today) on the tab', async () => {
    installFakeApi(FOLLOW_UP_SAMPLE)
    renderPage()

    await waitFor(() => expect(within(followUpsTab()).getByText('2')).toBeInTheDocument())
    expect(within(followUpsTab()).getByLabelText('2 pendientes')).toHaveClass('bg-rose-600')
  })

  it('hides the counter when nothing is pending', async () => {
    installFakeApi([makeApplication({ id: 1, follow_up_date: '2026-12-01' })])
    renderPage()
    await screen.findByRole('list', { name: 'Candidaturas' })

    await waitFor(() => expect(followUpsTab()).toHaveTextContent(/^Seguimientos$/))
  })

  it('groups follow-ups into overdue, today and upcoming with relative dates', async () => {
    installFakeApi(FOLLOW_UP_SAMPLE)
    const user = renderPage()
    await openFollowUps(user)

    expect(groupCompanies('Vencidos')).toEqual(['Example Corp'])
    expect(groupCompanies('Para hoy')).toEqual(['Acme Software'])
    expect(groupCompanies('Próximos')).toEqual(['Globex Labs'])
    expect(screen.getByText('Hace 5 días')).toBeInTheDocument()
    expect(screen.getByText('Hoy')).toBeInTheDocument()
    expect(screen.getByText('En 2 días')).toBeInTheDocument()
    expect(screen.getByText('1 vencido · 1 para hoy · 1 próximo')).toBeInTheDocument()
    // Applications without a follow-up date are not listed.
    const panel = screen.getByRole('tabpanel', { name: 'Seguimientos' })
    expect(within(panel).queryByText('Initech')).not.toBeInTheDocument()
    expect(window.location.hash).toBe('#seguimientos')
  })

  it('opens directly on the follow-ups view when the URL has #seguimientos', async () => {
    window.history.replaceState(null, '', '/#seguimientos')
    installFakeApi(FOLLOW_UP_SAMPLE)
    renderPage()

    expect(await screen.findByRole('region', { name: /^Vencidos/ })).toBeInTheDocument()
    expect(followUpsTab()).toHaveAttribute('aria-selected', 'true')
  })

  it('marks a follow-up as done so it is no longer pending', async () => {
    const api = installFakeApi(FOLLOW_UP_SAMPLE)
    const user = renderPage()
    await openFollowUps(user)

    await user.click(
      screen.getByRole('button', {
        name: 'Marcar como hecho el seguimiento de Backend Developer en Example Corp',
      }),
    )
    const dialog = screen.getByRole('dialog', { name: 'Marcar seguimiento como hecho' })
    await user.click(within(dialog).getByRole('button', { name: 'Marcar como hecho' }))

    await waitFor(() => expect(groupCompanies('Vencidos')).toEqual([]))
    const call = api.calls.find((c) => c.url.endsWith('/follow-up/complete'))
    expect(call?.url).toBe('/api/applications/1/follow-up/complete')
    expect(call?.body).toEqual({ completed_on: '2026-11-23', next_follow_up_date: null })
    expect(api.items().find((item) => item.id === 1)?.notes).toBe(
      'Seguimiento realizado el 23/11/2026.',
    )
    expect(screen.getByRole('status')).toHaveTextContent('Seguimiento marcado como hecho.')
    await waitFor(() => expect(within(followUpsTab()).getByText('1')).toBeInTheDocument())
  })

  it('can schedule the next follow-up when marking one as done', async () => {
    const api = installFakeApi(FOLLOW_UP_SAMPLE)
    const user = renderPage()
    await openFollowUps(user)

    await user.click(
      screen.getByRole('button', { name: /Marcar como hecho el seguimiento de Frontend Engineer/ }),
    )
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByLabelText('Programar el siguiente seguimiento'))
    await user.click(within(dialog).getByRole('button', { name: 'En 1 semana' }))
    expect(within(dialog).getByLabelText('Próximo seguimiento')).toHaveValue('2026-11-30')
    await user.click(within(dialog).getByRole('button', { name: 'Marcar como hecho' }))

    await waitFor(() => expect(groupCompanies('Próximos')).toEqual(['Globex Labs', 'Acme Software']))
    expect(groupCompanies('Para hoy')).toEqual([])
    expect(api.calls.find((c) => c.url.endsWith('/follow-up/complete'))?.body).toEqual({
      completed_on: '2026-11-23',
      next_follow_up_date: '2026-11-30',
    })
  })

  it('changes the follow-up date from the follow-ups view', async () => {
    const api = installFakeApi(FOLLOW_UP_SAMPLE)
    const user = renderPage()
    await openFollowUps(user)

    await user.click(
      screen.getByRole('button', {
        name: 'Cambiar fecha de seguimiento de Backend Developer en Example Corp',
      }),
    )
    const dialog = screen.getByRole('dialog', { name: 'Fecha de seguimiento' })
    expect(within(dialog).getByLabelText('Nueva fecha')).toHaveValue('2026-11-18')
    await user.click(within(dialog).getByRole('button', { name: 'En 2 semanas' }))
    await user.click(within(dialog).getByRole('button', { name: 'Guardar fecha' }))

    await waitFor(() => expect(groupCompanies('Vencidos')).toEqual([]))
    expect(groupCompanies('Próximos')).toEqual(['Globex Labs', 'Example Corp'])
    const patch = api.calls.find((c) => c.method === 'PATCH')
    expect(patch?.url).toBe('/api/applications/1')
    expect(patch?.body).toEqual({ follow_up_date: '2026-12-07' })
    expect(screen.getByRole('status')).toHaveTextContent('Fecha de seguimiento actualizada.')
  })

  it('removes the follow-up date', async () => {
    const api = installFakeApi(FOLLOW_UP_SAMPLE)
    const user = renderPage()
    await openFollowUps(user)

    await user.click(
      screen.getByRole('button', { name: /Cambiar fecha de seguimiento de Frontend Engineer/ }),
    )
    await user.click(screen.getByRole('button', { name: 'Quitar seguimiento' }))

    await waitFor(() => expect(groupCompanies('Para hoy')).toEqual([]))
    expect(api.calls.find((c) => c.method === 'PATCH')?.body).toEqual({ follow_up_date: null })
    expect(screen.getByText('Nada programado para hoy.')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Seguimiento eliminado.')
  })

  it('does not allow a follow-up date before the applied date', async () => {
    const api = installFakeApi(FOLLOW_UP_SAMPLE)
    const user = renderPage()
    await openFollowUps(user)

    await user.click(
      screen.getByRole('button', { name: /Cambiar fecha de seguimiento de Data Analyst/ }),
    )
    const dialog = screen.getByRole('dialog')
    const input = within(dialog).getByLabelText('Nueva fecha')
    await user.clear(input)
    await user.type(input, '2026-11-01')
    await user.click(within(dialog).getByRole('button', { name: 'Guardar fecha' }))

    expect(within(dialog).getByText(/No puede ser anterior a la fecha de solicitud/)).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(api.calls.some((c) => c.method === 'PATCH')).toBe(false)
  })

  it('applies the search and status filters to the follow-ups', async () => {
    const api = installFakeApi(FOLLOW_UP_SAMPLE)
    const user = renderPage()
    await openFollowUps(user)

    await user.click(statusButton('Entrevista'))
    await waitFor(() => expect(groupCompanies('Para hoy')).toEqual(['Acme Software']))
    expect(groupCompanies('Vencidos')).toEqual([])
    expect(api.calls.some((c) => c.url.includes('/api/follow-ups?status=interview&today=2026-11-23'))).toBe(true)

    await user.type(screen.getByLabelText('Buscar por empresa o puesto'), 'zzz')
    expect(await screen.findByText('No hay seguimientos que coincidan')).toBeInTheDocument()
  })

  it('shows an empty state when there are no follow-ups at all', async () => {
    installFakeApi([makeApplication({ id: 1, follow_up_date: null })])
    const user = renderPage()
    await screen.findByRole('list', { name: 'Candidaturas' })

    await user.click(followUpsTab())

    expect(await screen.findByText('No tienes seguimientos programados')).toBeInTheDocument()
  })

  it('keeps the list in sync after a follow-up action', async () => {
    installFakeApi(FOLLOW_UP_SAMPLE)
    const user = renderPage()
    await openFollowUps(user)
    await user.click(
      screen.getByRole('button', { name: /Marcar como hecho el seguimiento de Backend Developer/ }),
    )
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Marcar como hecho' }))
    await waitFor(() => expect(groupCompanies('Vencidos')).toEqual([]))

    await user.click(screen.getByRole('tab', { name: /Candidaturas/ }))

    const list = screen.getByRole('list', { name: 'Candidaturas' })
    const row = within(list).getAllByRole('listitem').find((r) => r.textContent?.includes('Example Corp'))
    await waitFor(() => expect(within(row as HTMLElement).queryByTitle('Fecha de seguimiento')).toBeNull())
    const todayRow = within(list).getAllByRole('listitem').find((r) => r.textContent?.includes('Acme Software'))
    expect(within(todayRow as HTMLElement).getByTitle('Fecha de seguimiento')).toHaveTextContent(
      'Hoy · 23 nov 2026',
    )
  })
})

// --- Kanban -----------------------------------------------------------------------

const BOARD_SAMPLE: Application[] = [
  makeApplication({ id: 1, company: 'Example Corp', position: 'Backend Developer', status: 'applied', applied_date: '2026-11-01', follow_up_date: '2026-11-23' }),
  makeApplication({ id: 2, company: 'Acme Software', position: 'Frontend Engineer', status: 'interview', applied_date: '2026-11-05', follow_up_date: null }),
  makeApplication({ id: 3, company: 'Globex Labs', position: 'Data Analyst', status: 'applied', applied_date: null, follow_up_date: null }),
  makeApplication({ id: 4, company: 'Initech', position: 'Platform Engineer', status: 'wishlist', applied_date: null, follow_up_date: null }),
]

const kanbanTab = () => screen.getByRole('tab', { name: /Kanban/ })
const column = (title: string) => screen.getByRole('region', { name: new RegExp(`^${title}`) })
const columnCompanies = (title: string) =>
  within(column(title))
    .queryAllByRole('listitem')
    .map((item) => item.querySelector('h3')?.textContent)
const columnCount = (title: string) =>
  within(column(title)).getByLabelText(/candidaturas$/).textContent

async function openKanban(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('list', { name: 'Candidaturas' })
  await user.click(kanbanTab())
  await screen.findByRole('region', { name: 'Tablero Kanban' })
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => (resolve = r))
  return { promise, resolve }
}

describe('ApplicationsPage Kanban', () => {
  it('shows five status columns with counts and card details', async () => {
    installFakeApi(BOARD_SAMPLE)
    const user = renderPage()
    await openKanban(user)

    expect(columnCompanies('Por aplicar')).toEqual(['Initech'])
    expect(columnCompanies('Aplicada')).toEqual(['Example Corp', 'Globex Labs'])
    expect(columnCompanies('Entrevista')).toEqual(['Acme Software'])
    expect(columnCompanies('Oferta')).toEqual([])
    expect(columnCompanies('Rechazada')).toEqual([])
    expect(columnCount('Aplicada')).toBe('2')
    expect(columnCount('Oferta')).toBe('0')
    expect(within(column('Oferta')).getByText('Arrastra aquí una candidatura')).toBeInTheDocument()

    const card = within(column('Aplicada')).getAllByRole('listitem')[0]
    expect(within(card).getByText('Backend Developer')).toBeInTheDocument()
    expect(card).toHaveTextContent('Fecha de solicitud: 1 nov 2026')
    expect(card).toHaveTextContent('Seguimiento: 23 nov 2026')
    expect(within(column('Aplicada')).getAllByRole('listitem')[1]).toHaveTextContent('Sin fecha')
    expect(screen.getByText('4 candidaturas en el tablero')).toBeInTheDocument()
    expect(window.location.hash).toBe('#kanban')
  })

  it('offers accessible controls on every card', async () => {
    installFakeApi(BOARD_SAMPLE)
    const user = renderPage()
    await openKanban(user)

    const card = within(column('Entrevista')).getByRole('listitem')
    const handle = within(card).getByRole('button', {
      name: 'Arrastrar Frontend Engineer en Acme Software',
    })
    expect(handle).toHaveAttribute('aria-roledescription', 'tarjeta arrastrable')
    // The card itself is not a role="button", so its select and buttons are not nested
    // inside another interactive element.
    expect(card).not.toHaveAttribute('role')
    const select = within(card).getByLabelText('Mover Frontend Engineer en Acme Software a')
    expect(select).toHaveValue('interview')
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Mover a Por aplicar',
      'Mover a Aplicada',
      'Entrevista',
      'Mover a Oferta',
      'Mover a Rechazada',
    ])
    expect(within(card).getByRole('button', { name: 'Editar Frontend Engineer en Acme Software' })).toBeInTheDocument()
  })

  it('moves a card with the select: optimistic update, then saved with PATCH', async () => {
    const gate = deferred()
    const api = installFakeApi(BOARD_SAMPLE, { patchGate: gate.promise })
    const user = renderPage()
    await openKanban(user)

    await user.selectOptions(screen.getByLabelText('Mover Data Analyst en Globex Labs a'), 'offer')

    // The card moves at once and is marked busy while the request is pending.
    expect(columnCompanies('Oferta')).toEqual(['Globex Labs'])
    expect(columnCompanies('Aplicada')).toEqual(['Example Corp'])
    expect(within(column('Oferta')).getByRole('listitem')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByLabelText('Mover Data Analyst en Globex Labs a')).toBeDisabled()

    gate.resolve()

    expect(await screen.findByText('Globex Labs movida a Oferta.')).toBeInTheDocument()
    expect(api.calls.find((c) => c.method === 'PATCH')).toMatchObject({
      url: '/api/applications/3',
      body: { status: 'offer' },
    })
    expect(api.items().find((item) => item.id === 3)?.status).toBe('offer')
    await waitFor(() => expect(columnCount('Oferta')).toBe('1'))
    expect(within(column('Oferta')).getByRole('listitem')).not.toHaveAttribute('aria-busy')
  })

  it('puts the card back and offers a retry when saving fails', async () => {
    const api = installFakeApi(BOARD_SAMPLE, { failPatches: 1 })
    const user = renderPage()
    await openKanban(user)

    await user.selectOptions(screen.getByLabelText('Mover Backend Developer en Example Corp a'), 'interview')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No se pudo mover Example Corp a Entrevista: Internal Server Error')
    expect(alert).toHaveTextContent('La tarjeta ha vuelto a Aplicada.')
    expect(columnCompanies('Aplicada')).toEqual(['Example Corp', 'Globex Labs'])
    expect(columnCompanies('Entrevista')).toEqual(['Acme Software'])
    expect(api.items().find((item) => item.id === 1)?.status).toBe('applied')

    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('Example Corp movida a Entrevista.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(columnCompanies('Entrevista')).toEqual(['Example Corp', 'Acme Software'])
    expect(api.items().find((item) => item.id === 1)?.status).toBe('interview')
  })

  it('lets the user dismiss a failed move', async () => {
    installFakeApi(BOARD_SAMPLE, { failPatches: 1 })
    const user = renderPage()
    await openKanban(user)

    await user.selectOptions(screen.getByLabelText('Mover Platform Engineer en Initech a'), 'rejected')
    await user.click(await screen.findByRole('button', { name: 'Cerrar aviso' }))

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(columnCompanies('Por aplicar')).toEqual(['Initech'])
  })

  it('keeps the list and the follow-ups in sync after a move', async () => {
    installFakeApi(BOARD_SAMPLE)
    const user = renderPage()
    await openKanban(user)

    await user.selectOptions(screen.getByLabelText('Mover Backend Developer en Example Corp a'), 'offer')
    await screen.findByText('Example Corp movida a Oferta.')

    await user.click(screen.getByRole('tab', { name: /Candidaturas/ }))
    const row = within(screen.getByRole('list', { name: 'Candidaturas' }))
      .getAllByRole('listitem')
      .find((r) => r.textContent?.includes('Example Corp')) as HTMLElement
    await waitFor(() => expect(within(row).getByText('Oferta')).toBeInTheDocument())

    await user.click(screen.getByRole('tab', { name: /Seguimientos/ }))
    const today = await screen.findByRole('region', { name: /^Para hoy/ })
    await waitFor(() => expect(within(today).getByText('Oferta')).toBeInTheDocument())
  })

  it('applies the search but not the status filter, so moved cards stay visible', async () => {
    const api = installFakeApi(BOARD_SAMPLE)
    const user = renderPage()
    await screen.findByRole('list', { name: 'Candidaturas' })
    // A status filter chosen in the list...
    await user.click(statusButton('Aplicada'))
    await user.click(kanbanTab())
    await screen.findByRole('region', { name: 'Tablero Kanban' })

    // ...is not applied on the board, whose pills are hidden.
    expect(screen.queryByRole('group', { name: 'Filtrar por estado' })).not.toBeInTheDocument()
    expect(screen.getByText(/El tablero muestra todas las columnas de estado/)).toBeInTheDocument()
    expect(columnCompanies('Entrevista')).toEqual(['Acme Software'])

    await user.type(screen.getByLabelText('Buscar por empresa o puesto'), 'engineer')
    await waitFor(() => expect(columnCompanies('Aplicada')).toEqual([]))
    expect(columnCompanies('Entrevista')).toEqual(['Acme Software'])
    expect(columnCompanies('Por aplicar')).toEqual(['Initech'])
    expect(api.listQueries()).toContain('q=engineer&limit=200')
    expect(api.listQueries().some((q) => q.includes('q=engineer&status='))).toBe(true) // list only

    // Moving a card keeps it on the board even though the list filter is "Aplicada".
    await user.selectOptions(screen.getByLabelText('Mover Frontend Engineer en Acme Software a'), 'offer')
    await screen.findByText('Acme Software movida a Oferta.')
    expect(columnCompanies('Oferta')).toEqual(['Acme Software'])

    // Clearing in the Kanban only clears the search; the list keeps its status filter.
    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    await waitFor(() => expect(columnCompanies('Aplicada')).toEqual(['Example Corp', 'Globex Labs']))
    await user.click(screen.getByRole('tab', { name: /Candidaturas/ }))
    expect(statusButton('Aplicada')).toHaveAttribute('aria-pressed', 'true')
  })

  it('does not request board data until the Kanban tab is opened', async () => {
    const api = installFakeApi(BOARD_SAMPLE)
    const user = renderPage()
    await screen.findByRole('list', { name: 'Candidaturas' })
    const before = api.listQueries().length

    await user.click(kanbanTab())
    await screen.findByRole('region', { name: 'Tablero Kanban' })

    expect(api.listQueries().length).toBe(before + 1)
  })

  it('opens the edit form from a card', async () => {
    installFakeApi(BOARD_SAMPLE)
    const user = renderPage()
    await openKanban(user)

    await user.click(screen.getByRole('button', { name: 'Editar Platform Engineer en Initech' }))

    const dialog = screen.getByRole('dialog', { name: 'Editar candidatura' })
    expect(within(dialog).getByLabelText(/Empresa/)).toHaveValue('Initech')
  })

  it('opens directly on the board when the URL has #kanban', async () => {
    window.history.replaceState(null, '', '/#kanban')
    installFakeApi(BOARD_SAMPLE)
    renderPage()

    expect(await screen.findByRole('region', { name: 'Tablero Kanban' })).toBeInTheDocument()
    expect(kanbanTab()).toHaveAttribute('aria-selected', 'true')
  })
})

// --- Statistics ---------------------------------------------------------------------
// "Today" is frozen at 2026-11-23 (a Monday).

const STATS_SAMPLE: Application[] = [
  { id: 1, company: 'Example Corp', status: 'applied', applied_date: '2026-11-20' },
  { id: 2, company: 'Acme Software', status: 'interview', applied_date: '2026-11-10' },
  { id: 3, company: 'Globex Labs', status: 'offer', applied_date: '2026-09-15' },
  { id: 4, company: 'Initech', status: 'rejected', applied_date: '2026-11-02' },
  { id: 5, company: 'Umbrella', status: 'wishlist', applied_date: null, created_at: '2026-11-21T09:00:00Z' },
  { id: 6, company: 'Old Co', status: 'rejected', applied_date: '2025-03-01' },
].map((fields) =>
  makeApplication({ follow_up_date: null, ...(fields as Partial<Application>) }),
)

const statsTab = () => screen.getByRole('tab', { name: /Estadísticas/ })
const tile = (label: string) =>
  screen.getByText(label, { selector: 'dt' }).parentElement as HTMLElement

async function openStats(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('list', { name: 'Candidaturas' })
  await user.click(statsTab())
  return screen.findByRole('region', { name: 'Evolución semanal' })
}

/** Rows of the "Ver datos" table inside a chart card, as [label, value] pairs. */
const tableRows = (chart: string) =>
  within(within(screen.getByRole('region', { name: chart })).getByRole('table'))
    .getAllByRole('row')
    .slice(1)
    .map((row) => [row.querySelector('th')?.textContent, row.querySelector('td')?.textContent])

describe('ApplicationsPage statistics', () => {
  it('shows KPIs computed by the API for the whole history', async () => {
    const api = installFakeApi(STATS_SAMPLE)
    const user = renderPage()
    await openStats(user)

    expect(api.statsQueries()).toEqual(['period=all&today=2026-11-23'])
    expect(window.location.hash).toBe('#estadisticas')
    expect(within(tile('Candidaturas')).getByText('6')).toBeInTheDocument()
    expect(tile('Candidaturas')).toHaveTextContent('5 enviadas · 1 por aplicar')
    expect(within(tile('Entrevistas')).getByText('2')).toBeInTheDocument()
    expect(tile('Entrevistas')).toHaveTextContent('1 en entrevista ahora')
    expect(within(tile('Ofertas')).getByText('1')).toBeInTheDocument()
    // responded = interview + offer + 2 rejected = 4 of 5 submitted
    expect(tile('Tasa de respuesta')).toHaveTextContent(/80\s%/)
    expect(tile('Tasa de respuesta')).toHaveTextContent('4 de 5 enviadas')
    expect(tile('Tasa de entrevistas')).toHaveTextContent(/40\s%/)
    expect(screen.getByText('Todo el historial hasta el 23 nov 2026.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cómo se calculan' })).toBeInTheDocument()
    expect(screen.getByText(/la tasa de entrevistas es un mínimo/)).toBeInTheDocument()
  })

  it('shows counts per status and the chart data tables', async () => {
    installFakeApi(STATS_SAMPLE, {
      statsWeekly: [
        { week_start: '2026-11-09', count: 1 },
        { week_start: '2026-11-16', count: 0 },
        { week_start: '2026-11-23', count: 2 },
      ],
    })
    const user = renderPage()
    await openStats(user)

    const byStatus = within(screen.getByRole('region', { name: 'Candidaturas por estado' }))
    expect(byStatus.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Por aplicar1',
      'Aplicada1',
      'Entrevista1',
      'Oferta1',
      'Rechazada2',
    ])
    expect(tableRows('Distribución por estado')).toEqual([
      ['Por aplicar', '1'],
      ['Aplicada', '1'],
      ['Entrevista', '1'],
      ['Oferta', '1'],
      ['Rechazada', '2'],
    ])
    expect(tableRows('Evolución semanal')).toEqual([
      ['9 nov', '1'],
      ['16 nov', '0'],
      ['23 nov', '2'],
    ])
    expect(tableRows('Entrevistas y ofertas')).toEqual([
      ['Enviadas', '5 · 100 %'],
      ['Con respuesta', '4 · 80 %'],
      ['Entrevista u oferta', '2 · 40 %'],
      ['Oferta', '1 · 20 %'],
    ])
  })

  it('changes the period and reloads the statistics', async () => {
    const api = installFakeApi(STATS_SAMPLE)
    const user = renderPage()
    await openStats(user)
    expect(screen.queryByLabelText('Buscar por empresa o puesto')).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Últimos 30 días' }))

    await waitFor(() => expect(within(tile('Candidaturas')).getByText('4')).toBeInTheDocument())
    expect(screen.getByRole('radio', { name: 'Últimos 30 días' })).toHaveAttribute('aria-checked', 'true')
    expect(api.statsQueries()).toContain('period=30d&today=2026-11-23')
    expect(screen.getByText('Del 25 oct 2026 al 23 nov 2026.')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'Últimos 90 días' }))
    await waitFor(() => expect(within(tile('Candidaturas')).getByText('5')).toBeInTheDocument())
  })

  it('shows an empty state for a period without applications', async () => {
    installFakeApi([makeApplication({ id: 1, applied_date: '2024-01-10' })])
    const user = renderPage()
    await openStats(user).catch(() => undefined)
    await user.click(screen.getByRole('radio', { name: 'Últimos 30 días' }))

    expect(await screen.findByText('No hay candidaturas en este periodo')).toBeInTheDocument()
  })

  it('shows a dash instead of dividing by zero when nothing was submitted', async () => {
    installFakeApi([
      makeApplication({ id: 1, status: 'wishlist', applied_date: null }),
      makeApplication({ id: 2, status: 'wishlist', applied_date: null }),
    ])
    const user = renderPage()
    await openStats(user)

    expect(tile('Tasa de respuesta')).toHaveTextContent('—')
    expect(tile('Tasa de respuesta')).toHaveTextContent('Sin candidaturas enviadas')
    expect(tile('Tasa de entrevistas')).toHaveTextContent('—')
    expect(tableRows('Entrevistas y ofertas')[0]).toEqual(['Enviadas', '0'])
    expect(
      screen.getByText('No hay candidaturas enviadas con fecha de solicitud en este periodo.'),
    ).toBeInTheDocument()
  })

  it('reports submitted applications without an applied date', async () => {
    installFakeApi([makeApplication({ id: 1, status: 'applied', applied_date: null })])
    const user = renderPage()
    await openStats(user)

    expect(
      screen.getByText('1 candidatura enviada no tiene fecha de solicitud y no aparece en el gráfico.'),
    ).toBeInTheDocument()
  })

  it('stays in sync with changes made in other tabs', async () => {
    const api = installFakeApi(STATS_SAMPLE)
    const user = renderPage()
    await openStats(user)
    expect(within(tile('Ofertas')).getByText('1')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /Candidaturas/ }))
    await user.click(screen.getByRole('button', { name: 'Editar Backend Developer en Example Corp' }))
    await user.selectOptions(within(screen.getByRole('dialog')).getByLabelText('Estado'), 'offer')
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
    await screen.findByText('Candidatura actualizada.')
    await user.click(statsTab())

    await waitFor(() => expect(within(tile('Ofertas')).getByText('2')).toBeInTheDocument())
    expect(tile('Tasa de entrevistas')).toHaveTextContent(/60\s%/)
    expect(api.statsQueries().length).toBeGreaterThanOrEqual(2)
  })

  it('updates while visible when an application is created from the stats tab', async () => {
    installFakeApi(STATS_SAMPLE)
    const user = renderPage()
    await openStats(user)
    expect(within(tile('Candidaturas')).getByText('6')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Nueva candidatura' }))
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText(/Empresa/), 'Hooli')
    await user.type(within(dialog).getByLabelText(/Puesto/), 'SRE')
    await user.click(within(dialog).getByRole('button', { name: 'Añadir candidatura' }))

    await waitFor(() => expect(within(tile('Candidaturas')).getByText('7')).toBeInTheDocument())
    expect(statsTab()).toHaveAttribute('aria-selected', 'true')
  })

  it('does not request statistics until the tab is opened', async () => {
    const api = installFakeApi(STATS_SAMPLE)
    renderPage()
    await screen.findByRole('list', { name: 'Candidaturas' })

    expect(api.statsQueries()).toEqual([])
  })

  it('shows an error with a retry when the statistics cannot be loaded', async () => {
    installFakeApi(STATS_SAMPLE, { failStats: 1 })
    const user = renderPage()
    await screen.findByRole('list', { name: 'Candidaturas' })
    await user.click(statsTab())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Internal Server Error')
    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByRole('region', { name: 'Evolución semanal' })).toBeInTheDocument()
  })
})

// --- AI analysis ----------------------------------------------------------------------
// Fictional texts only. The provider is never called: the fake API answers.

const CV_TEXT = 'Perfil ficticio. Experiencia con Python y FastAPI. Nivel de inglés B2.'
const JOB_TEXT = 'Oferta ficticia: buscamos Python, AWS y Kubernetes. Inglés fluido.'

const ANALYSIS_RESULT = {
  mode: 'local',
  provider: 'local-keywords',
  model: null,
  summary: 'Análisis básico sin IA: de 4 tecnologías detectadas, 2 aparecen en el CV.',
  met: [
    { requirement: 'Python', evidence: 'Experiencia con Python y FastAPI.' },
    { requirement: 'Inglés', evidence: 'Nivel de inglés B2.' },
  ],
  missing: [{ requirement: 'AWS', note: 'La oferta lo menciona y el CV no.' }],
  ambiguous: [
    { requirement: 'Kubernetes', evidence: null, note: 'No se puede comprobar.' },
  ],
  skills: [
    { name: 'Python', status: 'demonstrated' },
    { name: 'AWS', status: 'missing' },
    { name: 'Kubernetes', status: 'ambiguous' },
  ],
  recommendations: [
    { kind: 'cv', text: 'Si tienes experiencia real con AWS, añádela al CV.' },
    { kind: 'interview', text: 'Prepara un ejemplo concreto con Python.' },
  ],
  score: 63,
  score_explanation: 'Puntuación orientativa ... no es una probabilidad de ser contratado.',
  notices: ['Análisis básico sin IA: compara palabras clave.'],
}

const AI_CONFIG = {
  ai_available: true,
  provider: 'anthropic',
  model: 'claude-opus-5-5',
  min_chars: 30,
  max_chars: 20000,
}

const analysisTab = () => screen.getByRole('tab', { name: /Análisis IA/ })
const analysisPanel = () => screen.getByRole('tabpanel', { name: 'Análisis IA' })
const analysisCalls = (api: ReturnType<typeof installFakeApi>) =>
  api.calls.filter((c) => c.method === 'POST' && c.url === '/api/analysis')

async function openAnalysis(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('list', { name: 'Candidaturas' })
  await user.click(analysisTab())
}

async function fillTexts(user: ReturnType<typeof userEvent.setup>) {
  const panel = within(analysisPanel())
  await user.type(panel.getByLabelText('Texto del CV'), CV_TEXT)
  await user.type(panel.getByLabelText('Oferta de empleo'), JOB_TEXT)
}

describe('ApplicationsPage AI analysis', () => {
  it('runs the basic analysis without a key and shows a structured result', async () => {
    const api = installFakeApi([makeApplication()], { analysisResult: ANALYSIS_RESULT })
    const user = renderPage()
    await openAnalysis(user)
    const panel = within(analysisPanel())

    // No key: AI is disabled and explained, basic analysis is selected.
    expect(panel.getByRole('radio', { name: /Con IA/ })).toBeDisabled()
    expect(panel.getByText(/no tiene una clave de API configurada/)).toBeInTheDocument()
    expect(panel.getByRole('radio', { name: /Básico, sin IA/ })).toBeChecked()

    await fillTexts(user)
    await user.click(panel.getByRole('button', { name: 'Analizar oferta' }))

    expect(await panel.findByText('Resumen de compatibilidad')).toBeInTheDocument()
    expect(analysisCalls(api)[0].body).toEqual({
      cv_text: CV_TEXT,
      job_text: JOB_TEXT,
      mode: 'local',
      consent_external: false,
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument() // no consent needed
    expect(panel.getByText('Análisis básico sin IA (palabras clave)')).toBeInTheDocument()
    expect(panel.getByText('63')).toBeInTheDocument()
    expect(panel.getByText(/no es una probabilidad de ser contratado/)).toBeInTheDocument()

    const met = within(panel.getByRole('region', { name: 'Cumple' }))
    expect(met.getByText('Python')).toBeInTheDocument()
    expect(met.getByText('«Experiencia con Python y FastAPI.»')).toBeInTheDocument()
    expect(
      within(panel.getByRole('region', { name: 'No acreditado o ausente' })).getByText('AWS'),
    ).toBeInTheDocument()
    expect(within(panel.getByRole('region', { name: 'Ambiguo' })).getByText('Kubernetes')).toBeInTheDocument()
    const skills = within(panel.getByRole('region', { name: 'Tecnologías y competencias' }))
    expect(skills.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '✓Python: Acreditada',
      '✕AWS: No aparece',
      '?Kubernetes: Ambigua',
    ])
    expect(
      within(panel.getByRole('region', { name: 'Para mejorar el CV' })).getByText(/AWS/),
    ).toBeInTheDocument()
    expect(
      within(panel.getByRole('region', { name: 'Para preparar la entrevista' })).getByText(/Python/),
    ).toBeInTheDocument()
  })

  it('validates both texts before sending anything', async () => {
    const api = installFakeApi([makeApplication()])
    const user = renderPage()
    await openAnalysis(user)
    const panel = within(analysisPanel())

    await user.type(panel.getByLabelText('Texto del CV'), 'corto')
    await user.click(panel.getByRole('button', { name: 'Analizar oferta' }))

    expect(panel.getByText(/Pega el texto de tu CV \(mínimo 30 caracteres\)/)).toBeInTheDocument()
    expect(panel.getByText(/Pega la descripción de la oferta/)).toBeInTheDocument()
    expect(panel.getByLabelText('Texto del CV')).toHaveAttribute('aria-invalid', 'true')
    expect(analysisCalls(api)).toEqual([])
  })

  it('asks for confirmation before sending the texts to the AI provider', async () => {
    const api = installFakeApi([makeApplication()], {
      analysisConfig: AI_CONFIG,
      analysisResult: { ...ANALYSIS_RESULT, mode: 'ai', provider: 'anthropic', model: 'claude-opus-5-5' },
    })
    const user = renderPage()
    await openAnalysis(user)
    const panel = within(analysisPanel())

    const aiOption = await panel.findByRole('radio', { name: /Con IA · Anthropic/ })
    await waitFor(() => expect(aiOption).toBeEnabled())
    await user.click(aiOption)
    await fillTexts(user)
    await user.click(panel.getByRole('button', { name: 'Analizar oferta' }))

    let dialog = screen.getByRole('dialog', { name: '¿Enviar los textos a Anthropic?' })
    expect(dialog).toHaveTextContent('texto completo de tu CV y de la oferta')
    expect(dialog).toHaveTextContent('claude-opus-5-5')

    // Cancelling sends nothing.
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(analysisCalls(api)).toEqual([])

    await user.click(panel.getByRole('button', { name: 'Analizar oferta' }))
    dialog = screen.getByRole('dialog', { name: '¿Enviar los textos a Anthropic?' })
    await user.click(within(dialog).getByRole('button', { name: 'Enviar y analizar' }))

    expect(await panel.findByText('Análisis con IA · Anthropic · claude-opus-5-5')).toBeInTheDocument()
    expect(analysisCalls(api)).toHaveLength(1)
    expect(analysisCalls(api)[0].body).toMatchObject({ mode: 'ai', consent_external: true })
  })

  it('shows server errors from the provider', async () => {
    installFakeApi([makeApplication()], {
      analysisConfig: AI_CONFIG,
      analysisError: { status: 429, detail: 'Se ha alcanzado el límite de peticiones del proveedor de IA.' },
    })
    const user = renderPage()
    await openAnalysis(user)
    const panel = within(analysisPanel())
    await user.click(await panel.findByRole('radio', { name: /Con IA · Anthropic/ }))
    await fillTexts(user)
    await user.click(panel.getByRole('button', { name: 'Analizar oferta' }))
    await user.click(screen.getByRole('button', { name: 'Enviar y analizar' }))

    expect(await panel.findByRole('alert')).toHaveTextContent(
      'Se ha alcanzado el límite de peticiones del proveedor de IA.',
    )
    expect(panel.queryByText('Resumen de compatibilidad')).not.toBeInTheDocument()
  })

  it('shows a safety refusal once, without retrying the request', async () => {
    const api = installFakeApi([makeApplication()], {
      analysisConfig: AI_CONFIG,
      analysisError: {
        status: 422,
        detail:
          'El modelo de IA ha rechazado analizar estos textos por sus políticas de seguridad. No se ha reintentado con otro modelo; puedes revisar los textos o usar el análisis básico.',
      },
    })
    const user = renderPage()
    await openAnalysis(user)
    const panel = within(analysisPanel())
    await user.click(await panel.findByRole('radio', { name: /Con IA · Anthropic/ }))
    await fillTexts(user)
    await user.click(panel.getByRole('button', { name: 'Analizar oferta' }))
    await user.click(screen.getByRole('button', { name: 'Enviar y analizar' }))

    expect(await panel.findByRole('alert')).toHaveTextContent('políticas de seguridad')
    expect(panel.getByRole('alert')).toHaveTextContent('No se ha reintentado con otro modelo')
    expect(analysisCalls(api)).toHaveLength(1)
    expect(panel.queryByText('Resumen de compatibilidad')).not.toBeInTheDocument()
  })

  it('copies the result as text', async () => {
    installFakeApi([makeApplication()], { analysisResult: ANALYSIS_RESULT })
    const user = renderPage()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await openAnalysis(user)
    const panel = within(analysisPanel())
    await fillTexts(user)
    await user.click(panel.getByRole('button', { name: 'Analizar oferta' }))

    await user.click(await panel.findByRole('button', { name: 'Copiar resultado' }))

    expect(writeText).toHaveBeenCalledTimes(1)
    const text = writeText.mock.calls[0][0] as string
    expect(text).toContain('Puntuación orientativa: 63/100')
    expect(text).toContain('- Python. Evidencia: «Experiencia con Python y FastAPI.»')
    expect(text).toContain('No acreditado o ausente (1)\n- AWS.')
    expect(panel.getByRole('button', { name: 'Copiado' })).toBeInTheDocument()
  })

  it('keeps the texts when switching tabs and clears them on demand', async () => {
    installFakeApi([makeApplication()])
    const user = renderPage()
    await openAnalysis(user)
    await fillTexts(user)

    await user.click(screen.getByRole('tab', { name: /Candidaturas/ }))
    await user.click(analysisTab())

    const panel = within(analysisPanel())
    expect(panel.getByLabelText('Texto del CV')).toHaveValue(CV_TEXT)
    expect(window.location.hash).toBe('#analisis')

    await user.click(panel.getByRole('button', { name: 'Limpiar' }))
    expect(panel.getByLabelText('Texto del CV')).toHaveValue('')
    expect(panel.getByLabelText('Oferta de empleo')).toHaveValue('')
  })

  it('is available even when there are no applications', async () => {
    installFakeApi([], { analysisResult: ANALYSIS_RESULT })
    const user = renderPage()
    expect(await screen.findByText('Todavía no hay candidaturas')).toBeInTheDocument()

    await user.click(analysisTab())

    expect(within(analysisPanel()).getByLabelText('Texto del CV')).toBeVisible()
    expect(screen.queryByText('Todavía no hay candidaturas')).not.toBeVisible()
  })
})
