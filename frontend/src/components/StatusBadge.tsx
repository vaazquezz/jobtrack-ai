import type { ApplicationStatus } from '../types/application'
import { STATUS_LABELS } from '../types/application'
import { STATUS_STYLES } from '../lib/statusStyles'

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  const style = STATUS_STYLES[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${style.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  )
}
