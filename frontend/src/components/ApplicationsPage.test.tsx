import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
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
      return json(200, items)
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
  return { calls, items: () => items, fetchMock }
}

function renderPage() {
  const user = userEvent.setup()
  render(<ApplicationsPage />)
  return user
}

// --- Tests ----------------------------------------------------------------------

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
    expect(within(rows[0]).getByText('Seguimiento: 8 nov 2026')).toBeInTheDocument()
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
