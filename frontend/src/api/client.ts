/** Minimal JSON fetch wrapper that turns FastAPI errors into readable messages. */

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

interface ValidationIssue {
  loc?: (string | number)[]
  msg?: string
}

/** FastAPI returns `detail` as a string (HTTPException) or a list of issues (422). */
export function messageFromDetail(detail: unknown): string | null {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    const messages = (detail as ValidationIssue[])
      .map((issue) => {
        const field = issue.loc?.filter((part) => part !== 'body').join('.')
        const msg = issue.msg?.replace(/^Value error, /, '')
        return field ? `${field}: ${msg}` : msg
      })
      .filter(Boolean)
    return messages.length ? messages.join('; ') : null
  }
  return null
}

/** Send a request and return the raw response, throwing ApiError for failures. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init.headers },
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, 'No se pudo conectar con el servidor. ¿Está el backend en marcha?')
  }

  if (!response.ok) {
    let message = `Error ${response.status}`
    try {
      const body: unknown = await response.json()
      const detail = (body as { detail?: unknown } | null)?.detail
      message = messageFromDetail(detail) ?? message
    } catch {
      // Non-JSON error body: keep the generic message.
    }
    throw new ApiError(response.status, message)
  }

  return response
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, init)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
