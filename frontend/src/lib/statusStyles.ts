import type { ApplicationStatus } from '../types/application'

/** Tailwind classes per status, shared by badges and Kanban columns. */
export const STATUS_STYLES: Record<
  ApplicationStatus,
  { badge: string; dot: string; column: string; accent: string }
> = {
  wishlist: {
    badge: 'bg-slate-100 text-slate-700 ring-slate-200',
    dot: 'bg-slate-400',
    column: 'bg-slate-100/70',
    accent: 'border-t-slate-400',
  },
  applied: {
    badge: 'bg-sky-50 text-sky-700 ring-sky-200',
    dot: 'bg-sky-500',
    column: 'bg-sky-50/70',
    accent: 'border-t-sky-500',
  },
  interview: {
    badge: 'bg-amber-50 text-amber-800 ring-amber-200',
    dot: 'bg-amber-500',
    column: 'bg-amber-50/70',
    accent: 'border-t-amber-500',
  },
  offer: {
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    dot: 'bg-emerald-500',
    column: 'bg-emerald-50/70',
    accent: 'border-t-emerald-500',
  },
  rejected: {
    badge: 'bg-rose-50 text-rose-700 ring-rose-200',
    dot: 'bg-rose-500',
    column: 'bg-rose-50/60',
    accent: 'border-t-rose-500',
  },
}
