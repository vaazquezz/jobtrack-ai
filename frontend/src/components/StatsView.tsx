import { formatDate } from '../lib/format'
import { formatRate } from '../lib/stats'
import type { StatsOverview } from '../types/application'
import { APPLICATION_STATUSES } from '../types/application'
import { PipelineChart, StatusChart, WeeklyChart } from './StatsCharts'
import { StatusBadge } from './StatusBadge'
import { BriefcaseIcon } from './ui'

interface StatTileProps {
  label: string
  value: string
  detail: string
  className?: string
}

function StatTile({ label, value, detail, className = '' }: StatTileProps) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums sm:text-3xl">
        {value}
      </dd>
      <dd className="mt-1 text-xs text-slate-500">{detail}</dd>
    </div>
  )
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

function periodDescription(stats: StatsOverview): string {
  if (!stats.start) return `Todo el historial hasta el ${formatDate(stats.today)}.`
  return `Del ${formatDate(stats.start)} al ${formatDate(stats.today)}.`
}

export default function StatsView({ stats }: { stats: StatsOverview }) {
  if (stats.total === 0) {
    return (
      <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
          <BriefcaseIcon className="h-6 w-6" />
        </span>
        <h3 className="mt-4 font-semibold text-slate-900">No hay candidaturas en este periodo</h3>
        <p className="mt-1 max-w-sm text-sm text-slate-500">
          {periodDescription(stats)} Elige un periodo más amplio para ver estadísticas.
        </p>
      </div>
    )
  }

  const submittedDetail = `de ${plural(stats.submitted, 'enviada', 'enviadas')}`

  return (
    <div className="space-y-6">
      <p className="text-xs text-slate-500">{periodDescription(stats)}</p>

      <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatTile
          label="Candidaturas"
          className="col-span-2 lg:col-span-1"
          value={String(stats.total)}
          detail={`${plural(stats.submitted, 'enviada', 'enviadas')} · ${stats.by_status.wishlist} por aplicar`}
        />
        <StatTile
          label="Entrevistas"
          value={String(stats.interviews)}
          detail={`${stats.by_status.interview} en entrevista ahora`}
        />
        <StatTile
          label="Ofertas"
          value={String(stats.offers)}
          detail={stats.offer_rate === null ? 'Sin candidaturas enviadas' : `${formatRate(stats.offer_rate)} ${submittedDetail}`}
        />
        <StatTile
          label="Tasa de respuesta"
          value={formatRate(stats.response_rate)}
          detail={
            stats.response_rate === null
              ? 'Sin candidaturas enviadas'
              : `${stats.responded} ${submittedDetail}`
          }
        />
        <StatTile
          label="Tasa de entrevistas"
          value={formatRate(stats.interview_rate)}
          detail={
            stats.interview_rate === null
              ? 'Sin candidaturas enviadas'
              : `${stats.interviews} ${submittedDetail}`
          }
        />
      </dl>

      <section aria-label="Candidaturas por estado">
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {APPLICATION_STATUSES.map((status) => (
            <li
              key={status}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              <StatusBadge status={status} />
              <span className="text-sm font-semibold text-slate-900 tabular-nums">
                {stats.by_status[status]}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <WeeklyChart stats={stats} />
        <StatusChart stats={stats} />
        <PipelineChart stats={stats} />
      </div>

      <section
        aria-labelledby="stats-definitions"
        className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 sm:p-5"
      >
        <h3 id="stats-definitions" className="font-semibold text-slate-900">
          Cómo se calculan
        </h3>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            <strong>Periodo:</strong> una candidatura cuenta si su fecha de solicitud (o, si no la
            tiene, su fecha de registro) está dentro del periodo.
          </li>
          <li>
            <strong>Enviadas:</strong> todas excepto las que están «Por aplicar».
          </li>
          <li>
            <strong>Tasa de respuesta:</strong> enviadas que están en Entrevista, Oferta o Rechazada,
            dividido entre las enviadas.
          </li>
          <li>
            <strong>Entrevistas y tasa de entrevistas:</strong> enviadas que están en Entrevista u
            Oferta, dividido entre las enviadas.
          </li>
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          Limitaciones: solo se guarda el estado actual de cada candidatura, no el historial de
          cambios ni las fechas de respuestas, entrevistas u ofertas. Por eso las tasas describen
          dónde está cada candidatura hoy: una candidatura rechazada después de una entrevista
          cuenta como respuesta pero no como entrevista, así que la tasa de entrevistas es un
          mínimo. Sin candidaturas enviadas, las tasas se muestran como «—».
        </p>
      </section>
    </div>
  )
}
