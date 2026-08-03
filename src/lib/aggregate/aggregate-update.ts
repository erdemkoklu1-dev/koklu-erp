import type { SupabaseClient } from '@supabase/supabase-js'
import {
  AGGREGATE_ERROR,
  applyLineDiffSafely,
  checkOptimisticConcurrency,
  diffAggregateLines,
  validateNumericFields,
  type AggregateError,
  type AggregateLinesPayload,
  type LineGateway,
  type NumericFieldRule,
} from '@/lib/aggregate/line-diff'

/**
 * Üst kayıt–kalem güncellemesinin tek ortak sunucu tarafı uygulaması.
 *
 * Her modül (teklif, servis formu, proforma …) kendi tablo/kolon tanımını verir;
 * yetki, doğrulama, diff, eşzamanlılık ve yazma sırası burada tek yerde çalışır.
 * Bu sayede tehlikeli "önce sil sonra ekle" kodu hiçbir modülde kopyalanmaz.
 */

export interface AggregateModuleConfig {
  /** Üst kayıt tablosu, ör. `teklifler` */
  parentTable: string
  /** Kalem tablosu, ör. `teklif_kalemleri` */
  lineTable: string
  /** Kalem tablosundaki üst kayıt FK kolonu, ör. `teklif_id` */
  lineParentColumn: string
  /** Kalem sıra kolonu; tabloda yoksa `null` */
  lineOrderColumn: string | null
  /** Kalem sayısal alan kuralları */
  numericRules: NumericFieldRule[]
  /** Kullanıcıya görünen modül adı (hata mesajları için) */
  label: string
}

export interface AggregateUpdateRequest<TFields extends object> {
  parentId: string
  /** Üst kayıtta güncellenecek alanlar. `firma_id` asla buradan alınmaz. */
  parentPatch: Record<string, unknown>
  lines: AggregateLinesPayload<TFields>
  /** İstemcinin ekranı açtığı andaki `updated_at`. */
  expectedUpdatedAt?: string | null
}

export interface AggregateUpdateResult {
  parentId: string
  inserted: number
  updated: number
  deleted: number
  preserved: number
  /** Eşzamanlılık kontrolü çalıştı mı; çalışmadıysa nedeni. */
  concurrency: 'checked' | 'skipped_column_missing' | 'skipped_no_client_version'
  /** Gerçek transaction kullanıldı mı. RPC apply edilmeden `false`. */
  atomic: boolean
}

export type AggregateUpdateOutcome =
  | { ok: true; value: AggregateUpdateResult }
  | { ok: false; error: AggregateError }

function err(code: AggregateError['code'], message: string, retryable = false): { ok: false; error: AggregateError } {
  return { ok: false, error: { code, message, retryable } }
}

/** PostgREST'in "bu kolon yok" sinyalleri. */
function isUnknownColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code === '42703' || error.code === 'PGRST204') return true
  return /column .* does not exist|could not find the .* column|schema cache/i.test(error.message ?? '')
}

/**
 * Ana akış. Sıra GOREV.md Faz B ile birebir aynıdır:
 *   1. üst kayıt okunur + firma sahipliği doğrulanır
 *   2. eşzamanlılık kontrol edilir
 *   3. payload doğrulanır
 *   4. mevcut kalemler kimlikleriyle okunur
 *   5. diff hesaplanır
 *   6. kayıpsız sırayla yazılır (silme en son)
 */
export async function runAggregateUpdate<TFields extends object>(
  supabase: SupabaseClient,
  config: AggregateModuleConfig,
  firmaId: string,
  request: AggregateUpdateRequest<TFields>,
): Promise<AggregateUpdateOutcome> {
  // ── 1. Üst kayıt + tenant doğrulaması ──
  const { data: parent, error: parentReadError } = await supabase
    .from(config.parentTable)
    .select('*')
    .eq('id', request.parentId)
    .maybeSingle()

  if (parentReadError) {
    return err(AGGREGATE_ERROR.WRITE_FAILED, `${config.label} okunamadı: ${parentReadError.message}`, true)
  }
  if (!parent) {
    return err(AGGREGATE_ERROR.PARENT_NOT_FOUND, `${config.label} bulunamadı.`)
  }

  const parentRow = parent as Record<string, unknown>
  const parentHasFirmaId = Object.prototype.hasOwnProperty.call(parentRow, 'firma_id')
  if (parentHasFirmaId && parentRow.firma_id !== firmaId) {
    return err(AGGREGATE_ERROR.PARENT_NOT_FOUND, 'Bu kayıt kullanıcının firmasına ait değil.')
  }

  // ── 2. Optimistic concurrency ──
  const parentHasUpdatedAt = Object.prototype.hasOwnProperty.call(parentRow, 'updated_at')
  const concurrency = checkOptimisticConcurrency({
    expected: request.expectedUpdatedAt,
    actual: parentHasUpdatedAt ? ((parentRow.updated_at as string | null) ?? null) : undefined,
  })
  if (concurrency.status === 'conflict') {
    return { ok: false, error: concurrency.error }
  }

  // ── 3. Payload doğrulama ──
  if (request.lines.lines !== undefined) {
    const numericCheck = validateNumericFields(
      request.lines.lines.map(line => line.fields as Record<string, unknown>),
      config.numericRules,
    )
    if (!numericCheck.ok) return numericCheck
  }

  // ── 4. Mevcut kalemler (kimlikleriyle) ──
  const { data: existingRows, error: linesReadError } = await supabase
    .from(config.lineTable)
    .select('*')
    .eq(config.lineParentColumn, request.parentId)

  if (linesReadError) {
    return err(AGGREGATE_ERROR.WRITE_FAILED, `Kalemler okunamadı: ${linesReadError.message}`, true)
  }

  const existing = (existingRows ?? []).map(row => ({
    id: String((row as Record<string, unknown>).id),
    sira_no: config.lineOrderColumn
      ? ((row as Record<string, unknown>)[config.lineOrderColumn] as number | null)
      : null,
  }))

  const lineHasFirmaId =
    (existingRows ?? []).length > 0 &&
    Object.prototype.hasOwnProperty.call(existingRows![0] as object, 'firma_id')

  // ── 5. Diff ──
  const plan = diffAggregateLines<TFields>(existing, request.lines)
  if (!plan.ok) return plan

  // ── 6. Kayıpsız sırayla uygula ──
  // `firma_id` ve `id` istemciden gelen payload ile ASLA değiştirilemez.
  const parentPatch: Record<string, unknown> = { ...request.parentPatch }
  delete parentPatch.firma_id
  delete parentPatch.id
  if (parentHasUpdatedAt) parentPatch.updated_at = new Date().toISOString()

  const gateway: LineGateway<TFields> = {
    async updateParent() {
      if (Object.keys(parentPatch).length === 0) return { error: null }
      let query = supabase.from(config.parentTable).update(parentPatch).eq('id', request.parentId)
      if (parentHasFirmaId) query = query.eq('firma_id', firmaId)
      const { error } = await query
      return { error: error ? { message: error.message } : null }
    },

    async insertLines(rows) {
      const build = (withFirma: boolean) =>
        rows.map(row => ({
          [config.lineParentColumn]: request.parentId,
          ...(config.lineOrderColumn ? { [config.lineOrderColumn]: row.sira_no } : {}),
          ...(row.fields as object),
          ...(withFirma ? { firma_id: firmaId } : {}),
        }))

      const first = await supabase.from(config.lineTable).insert(build(lineHasFirmaId))
      if (first.error && lineHasFirmaId && isUnknownColumnError(first.error)) {
        // firma_id kolonu bu tabloda henüz yok (bkz. proforma_fatura_kalemleri drift'i).
        const retry = await supabase.from(config.lineTable).insert(build(false))
        return { error: retry.error ? { message: retry.error.message } : null }
      }
      if (first.error && !lineHasFirmaId && isUnknownColumnError(first.error)) {
        const retry = await supabase.from(config.lineTable).insert(build(true))
        return { error: retry.error ? { message: retry.error.message } : null }
      }
      return { error: first.error ? { message: first.error.message } : null }
    },

    async updateLine(id, sira_no, lineFields) {
      const patch: Record<string, unknown> = { ...(lineFields as object) }
      if (config.lineOrderColumn) patch[config.lineOrderColumn] = sira_no
      const { error } = await supabase
        .from(config.lineTable)
        .update(patch)
        .eq('id', id)
        .eq(config.lineParentColumn, request.parentId) // başka kayda sızma koruması
      return { error: error ? { message: error.message } : null }
    },

    async deleteLines(ids) {
      const { error } = await supabase
        .from(config.lineTable)
        .delete()
        .in('id', ids)
        .eq(config.lineParentColumn, request.parentId)
      return { error: error ? { message: error.message } : null }
    },
  }

  const applied = await applyLineDiffSafely(gateway, plan.value)
  if (!applied.ok) return applied

  return {
    ok: true,
    value: {
      parentId: request.parentId,
      ...applied.value,
      concurrency:
        concurrency.status === 'ok'
          ? 'checked'
          : concurrency.reason === 'column_missing'
            ? 'skipped_column_missing'
            : 'skipped_no_client_version',
      // Gerçek transaction ancak db/aggregate_atomic_update_rpc.sql apply edildikten
      // sonra mümkün; o zamana kadar kayıpsız sıra garantisi geçerli.
      atomic: false,
    },
  }
}

/** Modül tanımları — tek kaynak. */
export const AGGREGATE_MODULES = {
  teklif: {
    parentTable: 'teklifler',
    lineTable: 'teklif_kalemleri',
    lineParentColumn: 'teklif_id',
    lineOrderColumn: 'sira_no',
    label: 'Teklif',
    numericRules: [
      { field: 'miktar', allowZero: false },
      { field: 'birim_fiyat' },
      { field: 'iskonto' },
      { field: 'toplam' },
    ],
  },
  serviceForm: {
    parentTable: 'service_forms',
    lineTable: 'service_form_items',
    lineParentColumn: 'service_form_id',
    lineOrderColumn: null,
    label: 'Servis formu',
    numericRules: [{ field: 'quantity', allowZero: false }],
  },
  proforma: {
    parentTable: 'proforma_faturalar',
    lineTable: 'proforma_fatura_kalemleri',
    lineParentColumn: 'proforma_id',
    lineOrderColumn: 'sira_no',
    label: 'Proforma fatura',
    numericRules: [
      { field: 'miktar', allowZero: false },
      { field: 'birim_fiyat' },
      { field: 'iskonto_orani' },
      { field: 'iskonto_tutari' },
      { field: 'kdv_orani' },
      { field: 'kdv_tutari' },
      { field: 'toplam_tutar' },
    ],
  },
} as const satisfies Record<string, AggregateModuleConfig>
