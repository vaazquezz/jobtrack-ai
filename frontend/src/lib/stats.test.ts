import { describe, expect, it } from 'vitest'
import type { StatsOverview } from '../types/application'
import { formatRate, formatWeek, pipelineStages, statusDistribution, weeklySeries } from './stats'

const base: StatsOverview = {
  period: 'all',
  today: '2026-11-23',
  start: null,
  total: 10,
  by_status: { wishlist: 2, applied: 3, interview: 2, offer: 1, rejected: 2 },
  submitted: 8,
  responded: 5,
  interviews: 3,
  offers: 1,
  response_rate: 0.625,
  interview_rate: 0.375,
  offer_rate: 0.125,
  weekly: [
    { week_start: '2026-11-16', count: 0 },
    { week_start: '2026-11-23', count: 4 },
  ],
  undated_submitted: 0,
}

describe('formatRate', () => {
  it('formats rates as Spanish percentages (with a non-breaking space)', () => {
    expect(formatRate(0.625)).toBe('62,5\u00a0%')
    expect(formatRate(0)).toBe('0\u00a0%')
    expect(formatRate(1)).toBe('100\u00a0%')
    expect(formatRate(0.3333)).toBe('33,3\u00a0%')
  })

  it('shows a dash when the rate cannot be computed', () => {
    expect(formatRate(null)).toBe('—')
  })
})

describe('chart data', () => {
  it('formats week labels', () => {
    expect(formatWeek('2026-11-02')).toBe('2 nov')
    expect(weeklySeries(base).map((w) => [w.label, w.count])).toEqual([
      ['16 nov', 0],
      ['23 nov', 4],
    ])
  })

  it('lists every status in order, including zeros', () => {
    expect(statusDistribution({ ...base, by_status: { ...base.by_status, offer: 0 } })).toEqual([
      { status: 'wishlist', label: 'Por aplicar', count: 2 },
      { status: 'applied', label: 'Aplicada', count: 3 },
      { status: 'interview', label: 'Entrevista', count: 2 },
      { status: 'offer', label: 'Oferta', count: 0 },
      { status: 'rejected', label: 'Rechazada', count: 2 },
    ])
  })

  it('expresses each stage as a share of submitted applications', () => {
    expect(pipelineStages(base).map((s) => [s.label, s.count, s.share])).toEqual([
      ['Enviadas', 8, 1],
      ['Con respuesta', 5, 0.625],
      ['Entrevista u oferta', 3, 0.375],
      ['Oferta', 1, 0.125],
    ])
  })

  it('does not divide by zero when nothing was submitted', () => {
    const empty = { ...base, submitted: 0, responded: 0, interviews: 0, offers: 0 }
    expect(pipelineStages(empty).every((s) => s.share === null)).toBe(true)
  })
})
