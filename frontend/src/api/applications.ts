import type {
  Application,
  ApplicationFilters,
  ApplicationPayload,
} from '../types/application'
import { apiFetch, apiRequest } from './client'

const BASE = '/api/applications'

// The API caps `limit` at 200; enough for a personal tracker until pagination is needed.
export const LIST_LIMIT = 200

export interface ApplicationPage {
  items: Application[]
  /** Number of applications matching the filters, ignoring pagination. */
  total: number
}

/** Build the list URL with only the filters that are set. */
export function buildListUrl(filters: ApplicationFilters = {}): string {
  const params = new URLSearchParams()
  const query = filters.query?.trim()
  if (query) params.set('q', query)
  if (filters.status) params.set('status', filters.status)
  params.set('limit', String(LIST_LIMIT))
  return `${BASE}?${params.toString()}`
}

export async function listApplications(
  filters: ApplicationFilters = {},
  signal?: AbortSignal,
): Promise<ApplicationPage> {
  const response = await apiFetch(buildListUrl(filters), { signal })
  const items = (await response.json()) as Application[]
  const header = Number(response.headers.get('X-Total-Count'))
  return { items, total: Number.isFinite(header) && header >= items.length ? header : items.length }
}

export function createApplication(payload: ApplicationPayload): Promise<Application> {
  return apiRequest<Application>(BASE, { method: 'POST', body: JSON.stringify(payload) })
}

export function updateApplication(
  id: number,
  payload: Partial<ApplicationPayload>,
): Promise<Application> {
  return apiRequest<Application>(`${BASE}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export function deleteApplication(id: number): Promise<void> {
  return apiRequest<void>(`${BASE}/${id}`, { method: 'DELETE' })
}
