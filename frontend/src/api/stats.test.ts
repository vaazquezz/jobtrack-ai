import { describe, expect, it } from 'vitest'
import { buildStatsUrl } from './stats'

describe('buildStatsUrl', () => {
  it('sends the period and the local date', () => {
    expect(buildStatsUrl('30d', '2026-11-23')).toBe('/api/stats?period=30d&today=2026-11-23')
    expect(buildStatsUrl('all', '2026-11-23')).toBe('/api/stats?period=all&today=2026-11-23')
  })
})
