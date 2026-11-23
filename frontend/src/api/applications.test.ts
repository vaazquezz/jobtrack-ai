import { describe, expect, it, vi } from 'vitest'
import { buildListUrl, listApplications } from './applications'

describe('buildListUrl', () => {
  it('only sends the limit when there are no filters', () => {
    expect(buildListUrl()).toBe('/api/applications?limit=200')
    expect(buildListUrl({ query: '   ', status: null })).toBe('/api/applications?limit=200')
  })

  it('adds the trimmed search text and the status', () => {
    expect(buildListUrl({ query: '  acme ' })).toBe('/api/applications?q=acme&limit=200')
    expect(buildListUrl({ status: 'offer' })).toBe('/api/applications?status=offer&limit=200')
    expect(buildListUrl({ query: 'dev', status: 'applied' })).toBe(
      '/api/applications?q=dev&status=applied&limit=200',
    )
  })

  it('encodes special characters in the search text', () => {
    expect(buildListUrl({ query: 'R&D 100%' })).toBe(
      '/api/applications?q=R%26D+100%25&limit=200',
    )
  })
})

describe('listApplications', () => {
  it('returns the items and the total from X-Total-Count', async () => {
    const response = new Response(JSON.stringify([{ id: 1 }]), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'X-Total-Count': '250' },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))

    await expect(listApplications({ status: 'applied' })).resolves.toEqual({
      items: [{ id: 1 }],
      total: 250,
    })
  })

  it('falls back to the number of items when the header is missing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify([{ id: 1 }, { id: 2 }]))),
    )

    await expect(listApplications()).resolves.toMatchObject({ total: 2 })
  })
})
