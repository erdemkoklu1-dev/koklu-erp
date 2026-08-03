import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { requireCurrentFirmaId } from '@/lib/auth/tenant-scope'
import { apiFailure, apiSuccess, logApiError, newRequestId } from '@/lib/api/response'
import { IdempotencyStore } from '@/lib/api/idempotency'
import {
  AGGREGATE_MODULES,
  runAggregateUpdate,
  type AggregateUpdateResult,
} from '@/lib/aggregate/aggregate-update'
import { AGGREGATE_ERROR, type AggregateErrorCode } from '@/lib/aggregate/line-diff'

/**
 * Üst kayıt–kalem güncellemesi için **stabil, versiyonlu** endpoint.
 *
 * Kritik mutasyonlar bilinçli olarak Server Action yerine bu route üzerinden gider:
 * Server Action kimlikleri deployment'lar arasında değişir ve açık kalmış eski
 * sekmelerde `Server action not found` hatasına yol açar (GOREV.md Faz D).
 */

export const dynamic = 'force-dynamic'

const idempotency = new IdempotencyStore<AggregateUpdateResult>()

const STATUS_BY_CODE: Record<AggregateErrorCode, number> = {
  [AGGREGATE_ERROR.INVALID_PAYLOAD]: 400,
  [AGGREGATE_ERROR.DUPLICATE_LINE_ID]: 400,
  [AGGREGATE_ERROR.LINE_NOT_IN_PARENT]: 403,
  [AGGREGATE_ERROR.EMPTY_LINES_NOT_CONFIRMED]: 409,
  [AGGREGATE_ERROR.INVALID_LINE_VALUE]: 422,
  [AGGREGATE_ERROR.TOTALS_MISMATCH]: 422,
  [AGGREGATE_ERROR.STALE_WRITE]: 409,
  [AGGREGATE_ERROR.PARENT_NOT_FOUND]: 404,
  [AGGREGATE_ERROR.DUPLICATE_SUBMISSION]: 409,
  [AGGREGATE_ERROR.WRITE_FAILED]: 500,
}

type ModuleKey = keyof typeof AGGREGATE_MODULES

function isModuleKey(value: string): value is ModuleKey {
  return Object.prototype.hasOwnProperty.call(AGGREGATE_MODULES, value)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ module: string; id: string }> },
) {
  const requestId = newRequestId()
  const { module, id } = await params

  if (!isModuleKey(module)) {
    return apiFailure('UNKNOWN_MODULE', 'Bilinmeyen kayıt türü.', requestId, 404)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiFailure(AGGREGATE_ERROR.INVALID_PAYLOAD, 'İstek gövdesi okunamadı.', requestId, 400)
  }

  if (body === null || typeof body !== 'object') {
    return apiFailure(AGGREGATE_ERROR.INVALID_PAYLOAD, 'İstek gövdesi geçersiz.', requestId, 400)
  }

  const payload = body as {
    parentPatch?: Record<string, unknown>
    lines?: unknown
    deleteLineIds?: string[]
    replaceAllLines?: boolean
    confirmDeleteAllLines?: boolean
    expectedUpdatedAt?: string | null
  }

  let firmaId: string
  try {
    firmaId = await requireCurrentFirmaId()
  } catch (error) {
    logApiError('aggregate-update', requestId, 'AUTH_FAILED', error)
    return apiFailure('AUTH_FAILED', 'Oturum veya firma bilgisi doğrulanamadı.', requestId, 401)
  }

  const idempotencyKey = req.headers.get('idempotency-key')
  const scopedKey = idempotencyKey ? `${firmaId}:${module}:${id}:${idempotencyKey}` : null
  const claim = scopedKey ? idempotency.claim(scopedKey) : null

  if (claim?.state === 'in_flight') {
    return apiFailure(
      AGGREGATE_ERROR.DUPLICATE_SUBMISSION,
      'Bu kayıt hâlâ işleniyor. Lütfen bekleyin.',
      requestId,
      409,
    )
  }
  if (claim?.state === 'replayed') {
    return apiSuccess(claim.result, requestId)
  }

  try {
    const outcome = await runAggregateUpdate(
      createServiceClient(),
      AGGREGATE_MODULES[module],
      firmaId,
      {
        parentId: id,
        parentPatch: payload.parentPatch ?? {},
        lines: {
          // `lines` alanı gövdede YOKSA undefined kalır ⇒ mevcut kalemler korunur.
          lines: payload.lines as never,
          deleteLineIds: payload.deleteLineIds,
          replaceAllLines: payload.replaceAllLines,
          confirmDeleteAllLines: payload.confirmDeleteAllLines,
        },
        expectedUpdatedAt: payload.expectedUpdatedAt,
      },
    )

    if (!outcome.ok) {
      if (claim?.state === 'claimed') claim.abandon()
      logApiError('aggregate-update', requestId, outcome.error.code)
      return apiFailure(
        outcome.error.code,
        outcome.error.message,
        requestId,
        STATUS_BY_CODE[outcome.error.code] ?? 400,
        { field: outcome.error.field, retryable: outcome.error.retryable },
      )
    }

    if (claim?.state === 'claimed') claim.release(outcome.value)
    return apiSuccess(outcome.value, requestId)
  } catch (error) {
    if (claim?.state === 'claimed') claim.abandon()
    logApiError('aggregate-update', requestId, 'UNEXPECTED', error)
    return apiFailure('UNEXPECTED', 'Beklenmeyen bir hata oluştu.', requestId, 500, { retryable: true })
  }
}
