import type { Application, ApplicationFilters, FollowUpOverview } from '../types/application'
import { apiRequest } from './client'

/** Build the follow-ups URL with the shared filters and the user's local date. */
export function buildFollowUpsUrl(filters: ApplicationFilters, today: string): string {
  const params = new URLSearchParams()
  const query = filters.query?.trim()
  if (query) params.set('q', query)
  if (filters.status) params.set('status', filters.status)
  params.set('today', today)
  return `/api/follow-ups?${params.toString()}`
}

export function getFollowUps(
  filters: ApplicationFilters,
  today: string,
  signal?: AbortSignal,
): Promise<FollowUpOverview> {
  return apiRequest<FollowUpOverview>(buildFollowUpsUrl(filters, today), { signal })
}

/** Mark the follow-up as done (clears the date and records it in the notes). */
export function completeFollowUp(
  id: number,
  completedOn: string,
  nextFollowUpDate: string | null = null,
): Promise<Application> {
  return apiRequest<Application>(`/api/applications/${id}/follow-up/complete`, {
    method: 'POST',
    body: JSON.stringify({ completed_on: completedOn, next_follow_up_date: nextFollowUpDate }),
  })
}
