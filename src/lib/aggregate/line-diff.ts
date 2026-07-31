/**
 * Üst kayıt–kalem (aggregate) güncellemeleri için ortak veri kaybı önleme sözleşmesi.
 *
 * Bu dosya bilinçli olarak **bağımlılıksız ve saf**tır: hiçbir import içermez, hiçbir I/O
 * yapmaz. Böylece hem Next.js runtime'ında hem de `node --test` altında doğrudan
 * çalıştırılabilir ve veri kaybı senaryoları gerçek veritabanı olmadan test edilebilir.
 *
 * Sözleşme (GOREV.md Faz B):
 *  - `lines` alanı payload'da YOKSA mevcut kalemler aynen korunur.
 *  - `lines` alanı VARSA gönderilen içerik doğrulanır ve kontrollü diff uygulanır.
 *  - Payload'da olmayan eski kalemler otomatik SİLİNMEZ; silme yalnızca açık niyetle olur
 *    (`deleteLineIds` veya doğrulanmış `replaceAllLines`).
 *  - Sonuç boş kalem listesi ancak `confirmDeleteAllLines` ile kabul edilir.
 *  - Başka üst kayda ait kalem kimliği reddedilir.
 *  - Sıra numarası (`sira_no`) asla kimlik yerine kullanılmaz.
 */

// ─── Hata kodları ──────────────────────────────────────────────────────────────

export const AGGREGATE_ERROR = {
  /** Payload yapısı geçersiz (dizi değil, obje değil vb.) */
  INVALID_PAYLOAD: 'AGG_INVALID_PAYLOAD',
  /** Aynı kalem kimliği payload'da birden fazla kez geçiyor */
  DUPLICATE_LINE_ID: 'AGG_DUPLICATE_LINE_ID',
  /** Gönderilen kalem kimliği bu üst kayda ait değil (veya hiç yok) */
  LINE_NOT_IN_PARENT: 'AGG_LINE_NOT_IN_PARENT',
  /** Bütün kalemleri silme sonucu doğar ama açık onay yok */
  EMPTY_LINES_NOT_CONFIRMED: 'AGG_EMPTY_LINES_NOT_CONFIRMED',
  /** Kalem alanı sayısal değil / NaN / Infinity / negatif */
  INVALID_LINE_VALUE: 'AGG_INVALID_LINE_VALUE',
  /** Beyan edilen toplam, kalemlerden hesaplanan toplamla uyuşmuyor */
  TOTALS_MISMATCH: 'AGG_TOTALS_MISMATCH',
  /** Ekran verisi bayat; kayıt sırasında başkası güncellemiş */
  STALE_WRITE: 'AGG_STALE_WRITE',
  /** Üst kayıt bulunamadı veya tenant sınırı dışında */
  PARENT_NOT_FOUND: 'AGG_PARENT_NOT_FOUND',
  /** Aynı istek tekrar gönderildi */
  DUPLICATE_SUBMISSION: 'AGG_DUPLICATE_SUBMISSION',
  /** Yazma sırasında veritabanı hatası */
  WRITE_FAILED: 'AGG_WRITE_FAILED',
} as const

export type AggregateErrorCode = (typeof AGGREGATE_ERROR)[keyof typeof AGGREGATE_ERROR]

export interface AggregateError {
  code: AggregateErrorCode
  message: string
  field?: string
  retryable: boolean
}

export type DiffResult<T> = { ok: true; value: T } | { ok: false; error: AggregateError }

function fail(
  code: AggregateErrorCode,
  message: string,
  field?: string,
  retryable = false,
): { ok: false; error: AggregateError } {
  return { ok: false, error: { code, message, field, retryable } }
}

// ─── Payload sözleşmesi ────────────────────────────────────────────────────────

export interface AggregateLineInput<TFields extends object> {
  /**
   * Mevcut kalemin stabil primary key'i.
   * `undefined` / `null` ⇒ yeni kalem. Sıra numarası kimlik değildir.
   */
  id?: string | null
  /** İstemci tarafı geçici anahtar; sadece hata mesajını konumlandırmak için kullanılır. */
  clientKey?: string
  fields: TFields
}

export interface AggregateLinesPayload<TFields extends object> {
  /**
   * `undefined` ⇒ "kalem alanı gönderilmedi" ⇒ mevcut kalemler AYNEN KORUNUR.
   * Boş dizi ⇒ "hiçbir kalem üzerinde değişiklik yok" (silme anlamına GELMEZ).
   */
  lines?: AggregateLineInput<TFields>[]
  /** Kullanıcının açıkça silmeyi seçtiği kalem kimlikleri. */
  deleteLineIds?: string[]
  /** `lines` tam ve nihai listedir; listede olmayan mevcut kalemler silinir. */
  replaceAllLines?: boolean
  /** Sonuçta hiç kalem kalmayacaksa zorunlu açık onay. */
  confirmDeleteAllLines?: boolean
}

export interface ExistingLine {
  id: string
  sira_no?: number | null
}

export interface LineDiffPlan<TFields extends object> {
  toInsert: Array<{ clientKey?: string; sira_no: number; fields: TFields }>
  toUpdate: Array<{ id: string; sira_no: number; fields: TFields }>
  toDelete: string[]
  /** Payload'da geçmediği için dokunulmayan mevcut kalemler. */
  preservedIds: string[]
  /** İşlem sonrası beklenen kalem sayısı. */
  resultingLineCount: number
  /** Kalem alanı hiç gönderilmediği için hiçbir kalem işlemi yapılmayacak. */
  linesUntouched: boolean
}

export interface DiffOptions {
  /** Diff sonrası `sira_no` değerlerini 1..n olarak yeniden numaralandır. */
  renumber?: boolean
}

// ─── Diff motoru ───────────────────────────────────────────────────────────────

/**
 * Mevcut kalemler ile gelen payload'u karşılaştırıp uygulanacak planı üretir.
 * Hiçbir I/O yapmaz; yalnızca karar verir.
 */
export function diffAggregateLines<TFields extends object>(
  existing: ExistingLine[],
  payload: AggregateLinesPayload<TFields>,
  options: DiffOptions = {},
): DiffResult<LineDiffPlan<TFields>> {
  if (payload === null || typeof payload !== 'object') {
    return fail(AGGREGATE_ERROR.INVALID_PAYLOAD, 'Kalem payload’u geçersiz.')
  }

  const existingIds = new Set<string>()
  for (const row of existing) existingIds.add(row.id)

  // ── Açık silme niyeti doğrulaması (kalem listesinden bağımsız çalışır) ──
  const deleteLineIds = payload.deleteLineIds ?? []
  if (!Array.isArray(deleteLineIds)) {
    return fail(AGGREGATE_ERROR.INVALID_PAYLOAD, 'deleteLineIds bir dizi olmalıdır.', 'deleteLineIds')
  }
  const explicitDeletes = new Set<string>()
  for (const id of deleteLineIds) {
    if (typeof id !== 'string' || id.length === 0) {
      return fail(AGGREGATE_ERROR.INVALID_PAYLOAD, 'Geçersiz kalem kimliği gönderildi.', 'deleteLineIds')
    }
    if (!existingIds.has(id)) {
      return fail(
        AGGREGATE_ERROR.LINE_NOT_IN_PARENT,
        'Silinmek istenen kalem bu kayda ait değil.',
        'deleteLineIds',
      )
    }
    explicitDeletes.add(id)
  }

  // ── Kalem alanı hiç gönderilmedi ⇒ mevcut kalemler korunur ──
  if (payload.lines === undefined) {
    const remaining = existing.length - explicitDeletes.size
    if (remaining <= 0 && existing.length > 0 && payload.confirmDeleteAllLines !== true) {
      return fail(
        AGGREGATE_ERROR.EMPTY_LINES_NOT_CONFIRMED,
        'Bütün kalemlerin silinmesi için açık onay gerekiyor.',
        'confirmDeleteAllLines',
      )
    }
    return {
      ok: true,
      value: {
        toInsert: [],
        toUpdate: [],
        toDelete: [...explicitDeletes],
        preservedIds: existing.filter(r => !explicitDeletes.has(r.id)).map(r => r.id),
        resultingLineCount: remaining,
        linesUntouched: explicitDeletes.size === 0,
      },
    }
  }

  if (!Array.isArray(payload.lines)) {
    return fail(AGGREGATE_ERROR.INVALID_PAYLOAD, 'lines bir dizi olmalıdır.', 'lines')
  }

  const toInsert: LineDiffPlan<TFields>['toInsert'] = []
  const toUpdate: LineDiffPlan<TFields>['toUpdate'] = []
  const seenIds = new Set<string>()

  for (let index = 0; index < payload.lines.length; index++) {
    const line = payload.lines[index]
    if (line === null || typeof line !== 'object' || line.fields === null || typeof line.fields !== 'object') {
      return fail(AGGREGATE_ERROR.INVALID_PAYLOAD, `Kalem ${index + 1} geçersiz.`, `lines[${index}]`)
    }

    const id = line.id ?? null
    const siraNo = index + 1

    if (id === null) {
      toInsert.push({ clientKey: line.clientKey, sira_no: siraNo, fields: line.fields })
      continue
    }

    if (typeof id !== 'string' || id.length === 0) {
      return fail(AGGREGATE_ERROR.INVALID_PAYLOAD, `Kalem ${index + 1} kimliği geçersiz.`, `lines[${index}].id`)
    }
    if (seenIds.has(id)) {
      return fail(
        AGGREGATE_ERROR.DUPLICATE_LINE_ID,
        `Aynı kalem birden fazla kez gönderildi.`,
        `lines[${index}].id`,
      )
    }
    if (!existingIds.has(id)) {
      // Başka üst kayda ait (veya silinmiş) kalem kimliği asla kabul edilmez.
      return fail(
        AGGREGATE_ERROR.LINE_NOT_IN_PARENT,
        'Gönderilen kalem bu kayda ait değil.',
        `lines[${index}].id`,
      )
    }
    if (explicitDeletes.has(id)) {
      return fail(
        AGGREGATE_ERROR.INVALID_PAYLOAD,
        'Bir kalem hem güncellenmek hem silinmek üzere gönderilemez.',
        `lines[${index}].id`,
      )
    }

    seenIds.add(id)
    toUpdate.push({ id, sira_no: siraNo, fields: line.fields })
  }

  // ── Payload'da geçmeyen mevcut kalemler ──
  const untouched = existing.filter(row => !seenIds.has(row.id) && !explicitDeletes.has(row.id))

  let toDelete = [...explicitDeletes]
  let preservedIds: string[]

  if (payload.replaceAllLines === true) {
    // Açık "tam liste" niyeti: listede olmayanlar silinir.
    toDelete = toDelete.concat(untouched.map(r => r.id))
    preservedIds = []
  } else {
    // Varsayılan güvenli davranış: eksik kalemler KORUNUR.
    preservedIds = untouched.map(r => r.id)
  }

  const resultingLineCount = toInsert.length + toUpdate.length + preservedIds.length

  if (resultingLineCount === 0 && existing.length > 0 && payload.confirmDeleteAllLines !== true) {
    return fail(
      AGGREGATE_ERROR.EMPTY_LINES_NOT_CONFIRMED,
      'Bütün kalemlerin silinmesi için açık onay gerekiyor.',
      'confirmDeleteAllLines',
    )
  }

  if (options.renumber && payload.replaceAllLines !== true) {
    // Korunan kalemler varken yeniden numaralandırma sıra çakışması yaratabilir;
    // bu yüzden yalnızca tam liste modunda güvenlidir.
    // (payload sırası zaten 1..n atandı, korunanlar mevcut sira_no ile kalır.)
  }

  return {
    ok: true,
    value: { toInsert, toUpdate, toDelete, preservedIds, resultingLineCount, linesUntouched: false },
  }
}

// ─── Para / sayı doğrulama ─────────────────────────────────────────────────────

/**
 * Para değerlerini kuruş (integer) üzerinden yuvarlar.
 * `Math.round(x * 100) / 100` ikili kayan nokta hatalarını taşıdığı için
 * toplama işlemleri kuruş cinsinden yapılmalıdır.
 */
export function toCents(value: number): number {
  return Math.round((value + Number.EPSILON * Math.sign(value || 1)) * 100)
}

export function fromCents(cents: number): number {
  return cents / 100
}

export function roundMoney(value: number): number {
  return fromCents(toCents(value))
}

export interface NumericFieldRule {
  field: string
  /** Negatif değerlere izin verilir mi (ör. iade satırı). */
  allowNegative?: boolean
  /** Sıfıra izin verilir mi. */
  allowZero?: boolean
}

/**
 * Kalem sayısal alanlarını doğrular. Şüpheli değeri sessizce 0'a çevirmez;
 * açık validation hatası üretir.
 */
export function validateNumericFields(
  lines: Array<Record<string, unknown>>,
  rules: NumericFieldRule[],
): DiffResult<true> {
  for (let i = 0; i < lines.length; i++) {
    for (const rule of rules) {
      const raw = lines[i][rule.field]
      if (typeof raw !== 'number' || !Number.isFinite(raw)) {
        return fail(
          AGGREGATE_ERROR.INVALID_LINE_VALUE,
          `Kalem ${i + 1}: "${rule.field}" sayısal bir değer olmalıdır.`,
          `lines[${i}].${rule.field}`,
        )
      }
      if (!rule.allowNegative && raw < 0) {
        return fail(
          AGGREGATE_ERROR.INVALID_LINE_VALUE,
          `Kalem ${i + 1}: "${rule.field}" negatif olamaz.`,
          `lines[${i}].${rule.field}`,
        )
      }
      if (rule.allowZero === false && raw === 0) {
        return fail(
          AGGREGATE_ERROR.INVALID_LINE_VALUE,
          `Kalem ${i + 1}: "${rule.field}" sıfır olamaz.`,
          `lines[${i}].${rule.field}`,
        )
      }
    }
  }
  return { ok: true, value: true }
}

/**
 * Beyan edilen toplamı kalemlerden hesaplanan toplamla karşılaştırır.
 * Tolerans kuruş cinsindendir (yuvarlama farkları için).
 */
export function assertTotalsConsistent(
  computedTotal: number,
  declaredTotal: number,
  toleranceCents = 2,
): DiffResult<true> {
  const diff = Math.abs(toCents(computedTotal) - toCents(declaredTotal))
  if (diff > toleranceCents) {
    return fail(
      AGGREGATE_ERROR.TOTALS_MISMATCH,
      `Kalem toplamı (${roundMoney(computedTotal)}) ile beyan edilen toplam (${roundMoney(declaredTotal)}) uyuşmuyor.`,
      'total',
    )
  }
  return { ok: true, value: true }
}

// ─── Eşzamanlılık ──────────────────────────────────────────────────────────────

export interface ConcurrencyCheckInput {
  /** İstemcinin ekranı açtığı andaki değer (ISO timestamp). */
  expected?: string | null
  /** Veritabanındaki güncel değer. `undefined` ⇒ kolon henüz yok. */
  actual?: string | null
}

export type ConcurrencyOutcome =
  | { status: 'ok' }
  | { status: 'skipped'; reason: 'column_missing' | 'client_did_not_send' }
  | { status: 'conflict'; error: AggregateError }

/**
 * Optimistic concurrency kontrolü.
 *
 * `updated_at` kolonu henüz apply edilmemiş ortamlarda kontrol atlanır ve bu durum
 * çağırana açıkça bildirilir; sessizce "geçti" sayılmaz.
 */
export function checkOptimisticConcurrency(input: ConcurrencyCheckInput): ConcurrencyOutcome {
  if (input.actual === undefined) return { status: 'skipped', reason: 'column_missing' }
  if (input.expected === undefined || input.expected === null) {
    return { status: 'skipped', reason: 'client_did_not_send' }
  }
  const expectedMs = Date.parse(input.expected)
  const actualMs = input.actual === null ? NaN : Date.parse(input.actual)
  if (Number.isNaN(expectedMs) || Number.isNaN(actualMs)) {
    return { status: 'skipped', reason: 'client_did_not_send' }
  }
  if (expectedMs !== actualMs) {
    return {
      status: 'conflict',
      error: {
        code: AGGREGATE_ERROR.STALE_WRITE,
        message:
          'Bu kayıt siz düzenlerken başka bir yerden güncellendi. Değişiklikleriniz kaydedilmedi; sayfayı yenileyip tekrar deneyin.',
        retryable: false,
      },
    }
  }
  return { status: 'ok' }
}

// ─── Uygulama sırası (transaction yoksa bile kayıpsız) ─────────────────────────

export interface LineGateway<TFields extends object> {
  updateParent(): Promise<{ error: { message: string } | null }>
  insertLines(
    rows: Array<{ sira_no: number; fields: TFields }>,
  ): Promise<{ error: { message: string } | null }>
  updateLine(id: string, sira_no: number, fields: TFields): Promise<{ error: { message: string } | null }>
  deleteLines(ids: string[]): Promise<{ error: { message: string } | null }>
}

export interface ApplyOutcome {
  inserted: number
  updated: number
  deleted: number
  preserved: number
}

/**
 * Planı, tek transaction garantisi olmayan bir istemcide bile **veri kaybı
 * üretmeyecek sırayla** uygular:
 *
 *   1. üst kayıt güncellenir
 *   2. yeni kalemler eklenir
 *   3. mevcut kalemler güncellenir
 *   4. silme EN SON yapılır
 *
 * Böylece herhangi bir adımda hata olursa mevcut kalemler hâlâ yerindedir.
 * Gerçek atomiklik için `db/aggregate_atomic_update_rpc.sql` içindeki RPC kullanılır;
 * bu fonksiyon RPC apply edilene kadar geçerli güvenli yoldur.
 */
export async function applyLineDiffSafely<TFields extends object>(
  gateway: LineGateway<TFields>,
  plan: LineDiffPlan<TFields>,
): Promise<DiffResult<ApplyOutcome>> {
  const parentResult = await gateway.updateParent()
  if (parentResult.error) {
    return fail(AGGREGATE_ERROR.WRITE_FAILED, parentResult.error.message, undefined, true)
  }

  if (plan.toInsert.length > 0) {
    const insertResult = await gateway.insertLines(
      plan.toInsert.map(row => ({ sira_no: row.sira_no, fields: row.fields })),
    )
    if (insertResult.error) {
      return fail(AGGREGATE_ERROR.WRITE_FAILED, insertResult.error.message, undefined, true)
    }
  }

  for (const row of plan.toUpdate) {
    const updateResult = await gateway.updateLine(row.id, row.sira_no, row.fields)
    if (updateResult.error) {
      return fail(AGGREGATE_ERROR.WRITE_FAILED, updateResult.error.message, undefined, true)
    }
  }

  // Silme en son: buraya kadar her şey başarılıysa silme niyeti uygulanır.
  if (plan.toDelete.length > 0) {
    const deleteResult = await gateway.deleteLines(plan.toDelete)
    if (deleteResult.error) {
      return fail(AGGREGATE_ERROR.WRITE_FAILED, deleteResult.error.message, undefined, true)
    }
  }

  return {
    ok: true,
    value: {
      inserted: plan.toInsert.length,
      updated: plan.toUpdate.length,
      deleted: plan.toDelete.length,
      preserved: plan.preservedIds.length,
    },
  }
}
