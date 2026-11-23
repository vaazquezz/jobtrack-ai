import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, followUpState, relativeDayLabel } from './followUps'

const TODAY = '2026-11-23'

describe('followUpState', () => {
  it.each([
    ['2026-11-22', 'overdue'],
    ['2026-01-01', 'overdue'],
    ['2026-11-23', 'today'],
    ['2026-11-24', 'upcoming'],
    ['2027-03-01', 'upcoming'],
  ] as const)('%s is %s', (date, expected) => {
    expect(followUpState(date, TODAY)).toBe(expected)
  })

  it('returns null without a date', () => {
    expect(followUpState(null, TODAY)).toBeNull()
  })
})

describe('relativeDayLabel', () => {
  it.each([
    ['2026-11-23', 'Hoy'],
    ['2026-11-24', 'Mañana'],
    ['2026-11-22', 'Ayer'],
    ['2026-11-20', 'Hace 3 días'],
    ['2026-11-30', 'En 7 días'],
  ])('%s → %s', (date, label) => {
    expect(relativeDayLabel(date, TODAY)).toBe(label)
  })
})

describe('date arithmetic', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-11-23', 7)).toBe('2026-11-30')
    expect(addDays('2026-11-28', 7)).toBe('2026-12-05')
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('counts days between dates, including across DST changes', () => {
    expect(daysBetween('2026-11-23', '2026-11-30')).toBe(7)
    expect(daysBetween('2026-11-30', '2026-11-23')).toBe(-7)
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
  })
})
