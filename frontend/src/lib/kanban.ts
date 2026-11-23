import type { Application, ApplicationStatus } from '../types/application'
import { APPLICATION_STATUSES, STATUS_LABELS } from '../types/application'

/** Group applications into one column per status, keeping their order. */
export function groupByStatus(
  applications: Application[],
): Record<ApplicationStatus, Application[]> {
  const columns = Object.fromEntries(
    APPLICATION_STATUSES.map((status) => [status, [] as Application[]]),
  ) as Record<ApplicationStatus, Application[]>
  for (const application of applications) columns[application.status].push(application)
  return columns
}

export function isStatus(value: unknown): value is ApplicationStatus {
  return typeof value === 'string' && (APPLICATION_STATUSES as readonly string[]).includes(value)
}

/**
 * Status a dragged card should move to, or null when nothing should change
 * (dropped outside a column or back on its own column).
 */
export function dropTarget(
  application: Application | undefined,
  overId: string | number | null | undefined,
): ApplicationStatus | null {
  if (!application || !isStatus(overId) || overId === application.status) return null
  return overId
}

export const columnLabel = (status: ApplicationStatus) => STATUS_LABELS[status]
