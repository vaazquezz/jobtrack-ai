import type { ReactNode } from 'react'
import type { FollowUpCounts } from '../types/application'
import { BellIcon, ColumnsIcon, ListIcon } from './ui'

export type View = 'list' | 'kanban' | 'follow-ups'

interface ViewTabsProps {
  view: View
  onChange: (view: View) => void
  /** Counts for the pending badge; null while loading or on error. */
  followUps: FollowUpCounts | null
}

export function ViewTabs({ view, onChange, followUps }: ViewTabsProps) {
  const pending = followUps?.pending ?? 0
  const badgeStyle =
    followUps && followUps.overdue > 0 ? 'bg-rose-600 text-white' : 'bg-amber-500 text-white'

  const tab = (value: View, label: string, icon: ReactNode, badge?: ReactNode) => {
    const active = view === value
    return (
      <button
        type="button"
        role="tab"
        aria-selected={active}
        onClick={() => onChange(value)}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 sm:gap-2 sm:px-4 text-sm font-medium transition sm:flex-none ${
          active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        <span className="hidden sm:inline">{icon}</span>
        {label}
        {badge}
      </button>
    )
  }

  return (
    <div role="tablist" aria-label="Vista" className="flex gap-1 rounded-xl bg-slate-200/60 p-1 sm:inline-flex">
      {tab('list', 'Candidaturas', <ListIcon />)}
      {tab('kanban', 'Kanban', <ColumnsIcon />)}
      {tab(
        'follow-ups',
        'Seguimientos',
        <BellIcon />,
        pending > 0 && (
          <span
            className={`min-w-5 rounded-full px-1.5 text-center text-xs leading-5 font-semibold ${badgeStyle}`}
            aria-label={`${pending} pendientes`}
          >
            {pending}
          </span>
        ),
      )}
    </div>
  )
}
