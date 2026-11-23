import { describe, expect, it } from 'vitest'
import { formatDate } from './format'

describe('formatDate', () => {
  it('formats ISO dates in Spanish', () => {
    expect(formatDate('2026-11-01')).toBe('1 nov 2026')
  })

  it('returns null for empty values', () => {
    expect(formatDate(null)).toBeNull()
    expect(formatDate('')).toBeNull()
  })
})
