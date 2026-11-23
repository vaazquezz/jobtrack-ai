import { PERIOD_OPTIONS } from '../lib/stats'
import type { StatsPeriod } from '../types/application'

interface PeriodSelectorProps {
  period: StatsPeriod
  onChange: (period: StatsPeriod) => void
}

export function PeriodSelector({ period, onChange }: PeriodSelectorProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Periodo"
      className="inline-flex w-full rounded-xl bg-slate-200/60 p-1 sm:w-auto"
    >
      {PERIOD_OPTIONS.map((option) => {
        const active = option.value === period
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition sm:flex-none sm:text-sm ${
              active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
