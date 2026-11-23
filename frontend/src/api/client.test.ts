import { describe, expect, it, vi } from 'vitest'
import { ApiError, apiRequest, messageFromDetail } from './client'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('messageFromDetail', () => {
  it('returns string details as-is', () => {
    expect(messageFromDetail('Application 9 not found')).toBe('Application 9 not found')
  })

  it('joins FastAPI validation issues with their field name', () => {
    const detail = [
      { loc: ['body', 'company'], msg: 'Value error, must not be blank' },
      { loc: ['body', 'url'], msg: 'Value error, must be a valid http(s) URL' },
    ]
    expect(messageFromDetail(detail)).toBe(
      'company: must not be blank; url: must be a valid http(s) URL',
    )
  })

  it('returns null for unknown shapes', () => {
    expect(messageFromDetail(undefined)).toBeNull()
    expect(messageFromDetail([])).toBeNull()
  })
})

describe('apiRequest', () => {
  it('sends JSON and parses the response body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiRequest('/api/x', { method: 'POST', body: '{}' })).resolves.toEqual({
      ok: true,
    })
    const [, init] = fetchMock.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
  })

  it('resolves to undefined on 204 No Content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))

    await expect(apiRequest('/api/x', { method: 'DELETE' })).resolves.toBeUndefined()
  })

  it('throws an ApiError with the server detail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(404, { detail: 'Application 9 not found' })),
    )

    const error = await apiRequest('/api/x').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 404, message: 'Application 9 not found' })
  })

  it('falls back to a generic message when the error body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 500 })))

    await expect(apiRequest('/api/x')).rejects.toMatchObject({ status: 500, message: 'Error 500' })
  })

  it('reports network failures with a friendly message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(apiRequest('/api/x')).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining('No se pudo conectar'),
    })
  })
})
