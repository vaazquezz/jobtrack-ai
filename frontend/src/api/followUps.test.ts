import { describe, expect, it, vi } from 'vitest'
import { buildFollowUpsUrl, completeFollowUp } from './followUps'

describe('buildFollowUpsUrl', () => {
  it('always sends the local date and adds filters when set', () => {
    expect(buildFollowUpsUrl({}, '2026-11-23')).toBe('/api/follow-ups?today=2026-11-23')
    expect(buildFollowUpsUrl({ query: ' acme ', status: 'interview' }, '2026-11-23')).toBe(
      '/api/follow-ups?q=acme&status=interview&today=2026-11-23',
    )
  })
})

describe('completeFollowUp', () => {
  it('posts the completion date and the optional next date', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 3 })))
    vi.stubGlobal('fetch', fetchMock)

    await completeFollowUp(3, '2026-11-23', '2026-11-30')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/applications/3/follow-up/complete')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      completed_on: '2026-11-23',
      next_follow_up_date: '2026-11-30',
    })
  })
})
