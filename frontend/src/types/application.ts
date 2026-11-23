/** Types shared with the FastAPI `/api/applications` endpoints. */

export const APPLICATION_STATUSES = [
  'wishlist',
  'applied',
  'interview',
  'offer',
  'rejected',
] as const

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  wishlist: 'Por aplicar',
  applied: 'Aplicada',
  interview: 'Entrevista',
  offer: 'Oferta',
  rejected: 'Rechazada',
}

export interface Application {
  id: number
  company: string
  position: string
  url: string | null
  applied_date: string | null // YYYY-MM-DD
  status: ApplicationStatus
  notes: string | null
  follow_up_date: string | null // YYYY-MM-DD
  created_at: string
  updated_at: string
}

/** Body accepted by POST (and, as a full replacement of editable fields, by PATCH). */
export interface ApplicationPayload {
  company: string
  position: string
  url: string | null
  applied_date: string | null
  status: ApplicationStatus
  notes: string | null
  follow_up_date: string | null
}

/** Filters for the list endpoint. Empty values mean "no filter". */
export interface ApplicationFilters {
  query?: string
  status?: ApplicationStatus | null
}
