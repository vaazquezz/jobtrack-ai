import type { ApplicationStatus } from '../types/application'
import { STATUS_LABELS } from '../types/application'

const STATUS_STYLES: Record<ApplicationStatus, { badge: string; dot: string }> = {
  wishlist: { badge: 'bg-slate-100 text-slate-700 ring-slate-200', dot: 'bg-slate-400' },
  applied: { badge: 'bg-sky-50 text-sky-700 ring-sky-200', dot: 'bg-sky-500' },
  interview: { badge: 'bg-amber-50 text-amber-800 ring-amber-200', dot: 'bg-amber-500' },
  offer: { badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500' },
  rejected: { badge: 'bg-rose-50 text-rose-700 ring-rose-200', dot: 'bg-rose-500' },
}

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
