/**
 * Recharts charts for the statistics dashboard. Each chart is a single series, so one
 * brand hue is used (identity comes from the axis labels, not colour). Every chart has
 * a hover tooltip and a "Ver datos" table with the same numbers.
 */

import type { ReactNode } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent'
import { formatRate, pipelineStages, statusDistribution, weeklySeries } from '../lib/stats'
import type { StatsOverview } from '../types/application'

const BAR = '#4f39f6' // indigo-600
const BAR_HOVER = '#432dd7' // indigo-700
const GRID = '#e2e8f0' // slate-200
const TICK = { fill: '#64748b', fontSize: 12 } // slate-500
const BAR_SIZE = 20

interface ChartCardProps {
  title: string
  description: string
  children: ReactNode
  table: ReactNode
  className?: string
}

function ChartCard({ title, description, children, table, className = '' }: ChartCardProps) {
  return (
    <section
      aria-label={title}
      className={`flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}
    >
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <p className="mt-0.5 text-xs text-slate-500">{description}</p>
      <div className="mt-4 flex-1">{children}</div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-xs font-medium text-indigo-600 hover:text-indigo-500">
          Ver datos
        </summary>
        <div className="mt-2 overflow-x-auto">{table}</div>
      </details>
    </section>
  )
}

function DataTable({ head, rows }: { head: [string, string]; rows: [string, string][] }) {
  return (
    <table className="w-full text-left text-xs">
      <thead className="text-slate-500">
        <tr>
          <th scope="col" className="py-1 pr-4 font-medium">
            {head[0]}
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            {head[1]}
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 text-slate-700">
        {rows.map(([label, value]) => (
          <tr key={label}>
            <th scope="row" className="py-1 pr-4 font-normal">
              {label}
            </th>
            <td className="py-1 text-right tabular-nums">{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ChartTooltip({ active, payload, label }: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null
  const item = payload[0]
  const value = Number(item.value)
  const row = item.payload as { tooltip?: string; label?: string }
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-900">{row.tooltip ?? row.label ?? label}</p>
      <p className="mt-0.5 text-slate-600">
        <span
          className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle"
          style={{ background: BAR }}
          aria-hidden="true"
        />
        {value} {value === 1 ? 'candidatura' : 'candidaturas'}
      </p>
    </div>
  )
}

const cursor = { fill: '#eef2ff' } // indigo-50

// --- Distribution by status -------------------------------------------------------

export function StatusChart({ stats }: { stats: StatsOverview }) {
  const data = statusDistribution(stats)
  return (
    <ChartCard
      title="Distribución por estado"
      description="Estado actual de las candidaturas del periodo."
      table={
        <DataTable head={['Estado', 'Candidaturas']} rows={data.map((d) => [d.label, String(d.count)])} />
      }
    >
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 32, bottom: 0, left: 0 }}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" hide allowDecimals={false} domain={[0, 'dataMax']} />
            <YAxis
              type="category"
              dataKey="label"
              width={84}
              tick={TICK}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={ChartTooltip} cursor={cursor} />
            <Bar
              dataKey="count"
              fill={BAR}
              activeBar={{ fill: BAR_HOVER }}
              barSize={BAR_SIZE}
              radius={[0, 4, 4, 0]}
              isAnimationActive={false}
            >
              <LabelList dataKey="count" position="right" fill="#334155" fontSize={12} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}

// --- Weekly activity ----------------------------------------------------------------

export function WeeklyChart({ stats }: { stats: StatsOverview }) {
  const data = weeklySeries(stats).map((week) => ({
    ...week,
    tooltip: `Semana del ${week.label}`,
  }))
  const empty = data.every((week) => week.count === 0)
  return (
    <ChartCard
      title="Evolución semanal"
      description="Candidaturas enviadas cada semana (de lunes a domingo), según su fecha de solicitud."
      className="lg:col-span-2"
      table={
        <DataTable
          head={['Semana del', 'Enviadas']}
          rows={data.map((d) => [d.label, String(d.count)])}
        />
      }
    >
      {empty ? (
        <p className="flex h-56 items-center justify-center rounded-lg bg-slate-50 px-4 text-center text-sm text-slate-500">
          No hay candidaturas enviadas con fecha de solicitud en este periodo.
        </p>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis
                dataKey="label"
                tick={TICK}
                tickLine={false}
                axisLine={{ stroke: GRID }}
                interval="preserveStartEnd"
                minTickGap={12}
              />
              <YAxis allowDecimals={false} tick={TICK} tickLine={false} axisLine={false} />
              <Tooltip content={ChartTooltip} cursor={cursor} />
              <Bar
                dataKey="count"
                fill={BAR}
                activeBar={{ fill: BAR_HOVER }}
                maxBarSize={24}
                radius={[4, 4, 0, 0]}
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {stats.undated_submitted > 0 && (
        <p className="mt-2 text-xs text-slate-500">
          {stats.undated_submitted === 1
            ? '1 candidatura enviada no tiene fecha de solicitud y no aparece en el gráfico.'
            : `${stats.undated_submitted} candidaturas enviadas no tienen fecha de solicitud y no aparecen en el gráfico.`}
        </p>
      )}
    </ChartCard>
  )
}

// --- Interviews and offers ------------------------------------------------------------

export function PipelineChart({ stats }: { stats: StatsOverview }) {
  const data = pipelineStages(stats).map((stage) => ({
    ...stage,
    tag: stage.share === null ? String(stage.count) : `${stage.count} · ${formatRate(stage.share)}`,
  }))
  return (
    <ChartCard
      title="Entrevistas y ofertas"
      description="Cuántas candidaturas enviadas han llegado a cada punto, según su estado actual."
      table={
        <DataTable
          head={['Etapa', 'Candidaturas (% de enviadas)']}
          rows={data.map((d) => [d.label, d.tag])}
        />
      }
    >
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 84, bottom: 0, left: 0 }}>
            <CartesianGrid horizontal={false} stroke={GRID} />
            <XAxis type="number" hide allowDecimals={false} domain={[0, 'dataMax']} />
            <YAxis
              type="category"
              dataKey="label"
              width={128}
              tick={TICK}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={ChartTooltip} cursor={cursor} />
            <Bar
              dataKey="count"
              fill={BAR}
              activeBar={{ fill: BAR_HOVER }}
              barSize={BAR_SIZE}
              radius={[0, 4, 4, 0]}
              isAnimationActive={false}
            >
              <LabelList dataKey="tag" position="right" fill="#334155" fontSize={12} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
