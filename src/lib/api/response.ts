import { NextResponse } from 'next/server'
import type { ApiFailure, ApiSuccess } from '@/lib/api/envelope'

/**
 * Server tarafı ortak JSON zarfı yardımcıları.
 *
 * Her yanıt `content-type: application/json` ve `x-request-id` taşır; frontend
 * `readApiResponse` ile bunu güvenle okur (bkz. `src/lib/api/envelope.ts`).
 */

export function newRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function apiSuccess<T>(data: T, requestId: string, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true, data, requestId } satisfies ApiSuccess<T>, {
    status,
    headers: { 'x-request-id': requestId, 'cache-control': 'no-store' },
  })
}

export function apiFailure(
  code: string,
  message: string,
  requestId: string,
  status = 400,
  extra: { field?: string; retryable?: boolean } = {},
): NextResponse<ApiFailure> {
  return NextResponse.json(
    {
      ok: false,
      error: { code, message, field: extra.field, retryable: extra.retryable ?? status >= 500 },
      requestId,
    } satisfies ApiFailure,
    { status, headers: { 'x-request-id': requestId, 'cache-control': 'no-store' } },
  )
}

/**
 * Loglara fatura içeriği, VKN/TCKN, müşteri adı veya secret yazılmaz;
 * yalnızca requestId + kod + teknik mesajın kısaltılmış hali.
 */
export function logApiError(scope: string, requestId: string, code: string, detail?: unknown) {
  const safeDetail =
    detail instanceof Error ? detail.message : typeof detail === 'string' ? detail : undefined
  console.error(`[${scope}] requestId=${requestId} code=${code}${safeDetail ? ` detail=${safeDetail.slice(0, 200)}` : ''}`)
}
