/**
 * Ortak API zarfı (GOREV.md Faz C-7.4).
 *
 * Bu dosya bağımlılıksızdır (`next/server` import etmez) ki hem client hem server
 * tarafında kullanılabilsin ve `node --test` altında doğrudan test edilebilsin.
 */

export interface ApiSuccess<T> {
  ok: true
  data: T
  requestId: string
}

export interface ApiFailure {
  ok: false
  error: {
    code: string
    message: string
    field?: string
    retryable: boolean
  }
  requestId: string
}

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure

// ─── Taşıma katmanı hata kodları ───────────────────────────────────────────────

export const TRANSPORT_ERROR = {
  /** Route bulunamadı — çoğunlukla eski build / yanlış endpoint */
  NOT_FOUND: 'HTTP_NOT_FOUND',
  /** Sunucu JSON yerine HTML/düz metin döndü */
  NON_JSON_RESPONSE: 'HTTP_NON_JSON_RESPONSE',
  /** Gövde JSON gibi görünüyor ama parse edilemedi */
  MALFORMED_JSON: 'HTTP_MALFORMED_JSON',
  /** Yanıt JSON ama ortak zarf şeklinde değil */
  UNEXPECTED_SHAPE: 'HTTP_UNEXPECTED_SHAPE',
  /** İstek zaman aşımına uğradı */
  TIMEOUT: 'HTTP_TIMEOUT',
  /** İstek iptal edildi (kullanıcı/aborted) */
  ABORTED: 'HTTP_ABORTED',
  /** Ağ kesintisi / DNS / offline */
  NETWORK: 'HTTP_NETWORK',
  /** Sunucu 5xx döndü */
  SERVER_ERROR: 'HTTP_SERVER_ERROR',
} as const

export type TransportErrorCode = (typeof TRANSPORT_ERROR)[keyof typeof TRANSPORT_ERROR]

const TURKISH_MESSAGES: Record<TransportErrorCode, string> = {
  [TRANSPORT_ERROR.NOT_FOUND]:
    'İstek yapılan servis bulunamadı. Uygulama güncellenmiş olabilir; sayfayı yenileyip tekrar deneyin.',
  [TRANSPORT_ERROR.NON_JSON_RESPONSE]:
    'Sunucudan beklenmeyen bir yanıt geldi. Lütfen sayfayı yenileyip tekrar deneyin.',
  [TRANSPORT_ERROR.MALFORMED_JSON]: 'Sunucu yanıtı okunamadı. Lütfen tekrar deneyin.',
  [TRANSPORT_ERROR.UNEXPECTED_SHAPE]: 'Sunucu yanıtı beklenen biçimde değil.',
  [TRANSPORT_ERROR.TIMEOUT]: 'İşlem zaman aşımına uğradı. Lütfen tekrar deneyin.',
  [TRANSPORT_ERROR.ABORTED]: 'İşlem iptal edildi.',
  [TRANSPORT_ERROR.NETWORK]: 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.',
  [TRANSPORT_ERROR.SERVER_ERROR]: 'Sunucu hatası oluştu. Lütfen daha sonra tekrar deneyin.',
}

const RETRYABLE: Record<TransportErrorCode, boolean> = {
  [TRANSPORT_ERROR.NOT_FOUND]: false,
  [TRANSPORT_ERROR.NON_JSON_RESPONSE]: true,
  [TRANSPORT_ERROR.MALFORMED_JSON]: true,
  [TRANSPORT_ERROR.UNEXPECTED_SHAPE]: false,
  [TRANSPORT_ERROR.TIMEOUT]: true,
  [TRANSPORT_ERROR.ABORTED]: false,
  [TRANSPORT_ERROR.NETWORK]: true,
  [TRANSPORT_ERROR.SERVER_ERROR]: true,
}

export function transportFailure(code: TransportErrorCode, requestId = 'client'): ApiFailure {
  return {
    ok: false,
    error: { code, message: TURKISH_MESSAGES[code], retryable: RETRYABLE[code] },
    requestId,
  }
}

// ─── Zarf tanıma ───────────────────────────────────────────────────────────────

function isEnvelope(value: unknown): value is ApiEnvelope<unknown> {
  if (value === null || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  if (candidate.ok === true) return 'data' in candidate
  if (candidate.ok === false) {
    const err = candidate.error
    return err !== null && typeof err === 'object' && typeof (err as Record<string, unknown>).code === 'string'
  }
  return false
}

/**
 * Eski (zarfsız) route'lar `{ error: "..." }` döndürüyor. Geçiş döneminde bunları da
 * anlamlı bir `ApiFailure`'a çeviriyoruz ki frontend tek bir yolu izlesin.
 */
function adaptLegacyBody(body: unknown, status: number, requestId: string): ApiEnvelope<unknown> {
  if (body !== null && typeof body === 'object' && typeof (body as Record<string, unknown>).error === 'string') {
    return {
      ok: false,
      error: {
        code: status >= 500 ? TRANSPORT_ERROR.SERVER_ERROR : 'LEGACY_ERROR',
        message: (body as Record<string, string>).error,
        retryable: status >= 500,
      },
      requestId,
    }
  }
  if (status >= 200 && status < 300) {
    return { ok: true, data: body, requestId }
  }
  return transportFailure(
    status >= 500 ? TRANSPORT_ERROR.SERVER_ERROR : TRANSPORT_ERROR.UNEXPECTED_SHAPE,
    requestId,
  )
}

/**
 * `Response`'u **asla koşulsuz `response.json()` çağırmadan** okur.
 *
 * Sırasıyla:
 *   1. 404 ise ayrı kod (eski build / kaldırılmış route)
 *   2. content-type JSON değilse gövde metin olarak okunur ama kullanıcıya HTML basılmaz
 *   3. JSON parse hatası ayrı kodla raporlanır
 *
 * Böylece `Unexpected token '<' ... is not valid JSON` sınıfı hatalar oluşamaz.
 */
export async function readApiResponse<T>(response: Response): Promise<ApiEnvelope<T>> {
  const requestId = response.headers.get('x-request-id') ?? 'unknown'

  if (response.status === 404) {
    return transportFailure(TRANSPORT_ERROR.NOT_FOUND, requestId)
  }

  const contentType = response.headers.get('content-type') ?? ''
  const isJson = contentType.toLowerCase().includes('application/json')

  let rawBody: string
  try {
    rawBody = await response.text()
  } catch {
    return transportFailure(TRANSPORT_ERROR.NETWORK, requestId)
  }

  if (!isJson) {
    // HTML hata sayfası, proxy metni, boş gövde…
    return transportFailure(
      response.status >= 500 ? TRANSPORT_ERROR.SERVER_ERROR : TRANSPORT_ERROR.NON_JSON_RESPONSE,
      requestId,
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return transportFailure(TRANSPORT_ERROR.MALFORMED_JSON, requestId)
  }

  if (isEnvelope(parsed)) {
    return parsed as ApiEnvelope<T>
  }

  return adaptLegacyBody(parsed, response.status, requestId) as ApiEnvelope<T>
}

export interface RequestOptions extends RequestInit {
  /** Milisaniye. Aşılırsa `HTTP_TIMEOUT` döner. */
  timeoutMs?: number
}

/**
 * Timeout, iptal ve ağ kesintisini ayrı hata kodlarıyla ele alan `fetch` sarmalayıcısı.
 * Hiçbir durumda exception fırlatmaz; her zaman zarf döner.
 */
export async function requestApi<T>(input: string, options: RequestOptions = {}): Promise<ApiEnvelope<T>> {
  const { timeoutMs = 60_000, signal, ...init } = options
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), timeoutMs)

  const onExternalAbort = () => controller.abort(new DOMException('aborted', 'AbortError'))
  if (signal) {
    if (signal.aborted) onExternalAbort()
    else signal.addEventListener('abort', onExternalAbort, { once: true })
  }

  try {
    const response = await fetch(input, { ...init, signal: controller.signal })
    return await readApiResponse<T>(response)
  } catch (err) {
    const name = (err as { name?: string } | null)?.name
    if (name === 'TimeoutError') return transportFailure(TRANSPORT_ERROR.TIMEOUT)
    if (name === 'AbortError') return transportFailure(TRANSPORT_ERROR.ABORTED)
    return transportFailure(TRANSPORT_ERROR.NETWORK)
  } finally {
    clearTimeout(timer)
    if (signal) signal.removeEventListener('abort', onExternalAbort)
  }
}
