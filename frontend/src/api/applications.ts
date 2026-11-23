import type { Application, ApplicationPayload } from '../types/application'
import { apiRequest } from './client'

const BASE = '/api/applications'

export function listApplications(signal?: AbortSignal): Promise<Application[]> {
  // The API caps `limit` at 200; enough for a personal tracker until pagination is needed.
  return apiRequest<Application[]>(`${BASE}?limit=200`, { signal })
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
