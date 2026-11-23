import { describe, expect, it } from 'vitest'
import type { Application } from '../types/application'
import { dropTarget, groupByStatus, isStatus } from './kanban'

const app = (id: number, status: Application['status']) =>
  ({ id, company: `Co ${id}`, position: 'Dev', status }) as Application

describe('groupByStatus', () => {
  it('returns all five columns, keeping the original order inside each', () => {
    const columns = groupByStatus([app(3, 'applied'), app(1, 'offer'), app(2, 'applied')])

    expect(Object.keys(columns)).toEqual(['wishlist', 'applied', 'interview', 'offer', 'rejected'])
    expect(columns.applied.map((a) => a.id)).toEqual([3, 2])
    expect(columns.offer.map((a) => a.id)).toEqual([1])
    expect(columns.wishlist).toEqual([])
  })
})

describe('dropTarget', () => {
  it('returns the column the card was dropped on', () => {
    expect(dropTarget(app(1, 'applied'), 'interview')).toBe('interview')
  })

  it('ignores drops on the same column, outside any column or unknown ids', () => {
    expect(dropTarget(app(1, 'applied'), 'applied')).toBeNull()
    expect(dropTarget(app(1, 'applied'), null)).toBeNull()
    expect(dropTarget(app(1, 'applied'), 'card-7')).toBeNull()
    expect(dropTarget(undefined, 'offer')).toBeNull()
  })
})

describe('isStatus', () => {
  it('accepts only known statuses', () => {
    expect(isStatus('rejected')).toBe(true)
    expect(isStatus('ghosted')).toBe(false)
    expect(isStatus(3)).toBe(false)
  })
})
