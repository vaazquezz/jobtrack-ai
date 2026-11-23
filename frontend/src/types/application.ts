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

export interface FollowUpCounts {
  overdue: number
  today: number
  upcoming: number
  /** overdue + today: follow-ups that need attention now. */
  pending: number
}

/** Response of GET /api/follow-ups. */
export interface FollowUpOverview {
  today: string
  overdue: Application[]
  due_today: Application[]
  upcoming: Application[]
  counts: FollowUpCounts
}

export type StatsPeriod = '30d' | '90d' | 'all'

/** Response of GET /api/stats. Rates are 0–1, or null when nothing was submitted. */
export interface StatsOverview {
  period: StatsPeriod
  today: string
  start: string | null
  total: number
  by_status: Record<ApplicationStatus, number>
  submitted: number
  responded: number
  interviews: number
  offers: number
  response_rate: number | null
  interview_rate: number | null
  offer_rate: number | null
  weekly: { week_start: string; count: number }[]
  undated_submitted: number
}

// --- CV / job offer analysis ------------------------------------------------------------

export type AnalysisMode = 'local' | 'ai'
export type SkillStatus = 'demonstrated' | 'missing' | 'ambiguous'

export interface AnalysisConfig {
  ai_available: boolean
  provider: string | null
  model: string | null
  min_chars: number
  max_chars: number
}

export interface AnalysisRequest {
  cv_text: string
  job_text: string
  mode: AnalysisMode
  consent_external: boolean
}

/** Response of POST /api/analysis. */
export interface AnalysisResult {
  mode: AnalysisMode
  provider: string
  model: string | null
  summary: string
  met: { requirement: string; evidence: string }[]
  missing: { requirement: string; note: string }[]
  ambiguous: { requirement: string; evidence: string | null; note: string }[]
  skills: { name: string; status: SkillStatus }[]
  recommendations: { kind: 'cv' | 'interview'; text: string }[]
  score: number | null
  score_explanation: string
  notices: string[]
}
