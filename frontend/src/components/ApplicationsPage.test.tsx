import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
function installFakeApi(initial: Application[] = [], options: { failList?: number } = {}) {
  let items = [...initial]
  let nextId = Math.max(0, ...items.map((item) => item.id)) + 1
  let listFailures = options.failList ?? 0
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
    if (match) {
      const id = Number(match[1])
      const existing = items.find((item) => item.id === id)
      if (!existing) return json(404, { detail: `Application ${id} not found` })
      if (method === 'PATCH') {
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

  return { calls, listQueries, items: () => items, fetchMock }
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
