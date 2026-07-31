/**
 * Fatura kalemi sahipliği sözleşmesi — **saf ve bağımlılıksız** karar katmanı.
 *
 * Kök neden (denetim raporu §2.5 / R6):
 *   `src/app/(dashboard)/cari-hesap/faturalar/[id]/edit/actions.ts:115-129`
 *   `invoice_items` silme/güncellemeyi yalnızca `eq('id', ...)` ile yapıyordu.
 *   Başka faturaya — hatta başka tenant'a — ait bir kalem kimliği gönderilirse
 *   o satır siliniyor/güncelleniyordu.
 *
 * Bu dosya hiçbir import içermez ve hiçbir I/O yapmaz; `node --test` altında
 * doğrudan test edilebilir. Yazma tarafı `db/invoice_atomic_update_rpc.sql`
 * içindeki tek transaction'dır.
 *
 * ÖNEMLİ: Buradaki doğrulama **tek başına yeterli değildir** — GOREV.md §9 gereği
 * sahiplik son sözü RPC'nindir (`id + invoice_id` çifti + etkilenen satır sayısı
 * kontrolü). Bu katman erken ve anlaşılır hata üretir.
 */

// ─── Hata kodları ──────────────────────────────────────────────────────────────

export const INVOICE_ERROR = {
  INVALID_PAYLOAD: 'INVOICE_INVALID_PAYLOAD',
  /** Gönderilen kalem kimliği bu faturaya ait değil (repo hata sözleşmesi) */
  FOREIGN_LINE_ID: 'INVOICE_FOREIGN_LINE_ID',
  /** Gönderilen aracı kimliği bu faturaya ait değil */
  FOREIGN_BROKER_ID: 'INVOICE_FOREIGN_BROKER_ID',
  DUPLICATE_LINE_ID: 'INVOICE_DUPLICATE_LINE_ID',
  EMPTY_LINES_NOT_CONFIRMED: 'INVOICE_EMPTY_LINES_NOT_CONFIRMED',
  STALE_WRITE: 'INVOICE_STALE_WRITE',
  NOT_FOUND: 'INVOICE_NOT_FOUND',
  TENANT_MISMATCH: 'INVOICE_TENANT_MISMATCH',
  IDEMPOTENCY_CONFLICT: 'INVOICE_IDEMPOTENCY_CONFLICT',
  /** Atomik RPC henüz apply edilmemiş */
  RPC_MISSING: 'INVOICE_RPC_MISSING',
  WRITE_FAILED: 'INVOICE_WRITE_FAILED',
} as const

export type InvoiceErrorCode = (typeof INVOICE_ERROR)[keyof typeof INVOICE_ERROR]

export interface InvoiceError {
  code: InvoiceErrorCode
  message: string
  retryable: boolean
}

export type InvoiceResult<T> = { ok: true; value: T } | { ok: false; error: InvoiceError }

function fail(code: InvoiceErrorCode, message: string, retryable = false): { ok: false; error: InvoiceError } {
  return { ok: false, error: { code, message, retryable } }
}

// ─── Payload sözleşmesi ────────────────────────────────────────────────────────

export type InvoiceItemFields = {
  description: string
  quantity: number
  unit: string
  unit_price: number
  kdv_rate: number
  line_order?: number
  notes?: string | null
}

export type InvoiceBrokerFields = {
  broker_id?: string
  commission_rate: number
  commission_amount: number
}

export type SubmittedLine<TFields extends object> = {
  /** Mevcut satırın kimliği. `null`/`undefined` ⇒ yeni satır. */
  id?: string | null
  fields: TFields
}

export interface InvoiceLinesPayload {
  /**
   * `undefined` ⇒ kalem alanı gönderilmedi ⇒ mevcut kalemler AYNEN KORUNUR.
   * Dizi ⇒ tam ve nihai liste.
   */
  items?: SubmittedLine<InvoiceItemFields>[]
  deleteItemIds?: string[]
  brokers?: SubmittedLine<InvoiceBrokerFields>[]
  deleteBrokerIds?: string[]
  confirmDeleteAllLines?: boolean
}

export interface InvoiceLinePlan {
  items: SubmittedLine<InvoiceItemFields>[] | null
  deleteItemIds: string[]
  brokers: SubmittedLine<InvoiceBrokerFields>[] | null
  deleteBrokerIds: string[]
  resultingItemCount: number
  itemsUntouched: boolean
}

/**
 * Gönderilen bütün mevcut kimliklerin **bu faturaya** ait olduğunu doğrular.
 *
 * @param existingItemIds  `invoice_items` içinde `invoice_id = <bu fatura>` olan kimlikler
 * @param existingBrokerIds `invoice_brokers` içinde aynı kısıtla okunan kimlikler
 */
export function planInvoiceLines(
  existingItemIds: string[],
  existingBrokerIds: string[],
  payload: InvoiceLinesPayload,
): InvoiceResult<InvoiceLinePlan> {
  if (payload === null || typeof payload !== 'object') {
    return fail(INVOICE_ERROR.INVALID_PAYLOAD, 'Fatura kalem payload’u geçersiz.')
  }

  const itemIdSet = new Set(existingItemIds)
  const brokerIdSet = new Set(existingBrokerIds)

  // ── Açık silme niyeti ──
  const deleteItemIds = payload.deleteItemIds ?? []
  if (!Array.isArray(deleteItemIds)) {
    return fail(INVOICE_ERROR.INVALID_PAYLOAD, 'deleteItemIds bir dizi olmalıdır.')
  }
  for (const id of deleteItemIds) {
    if (typeof id !== 'string' || id.length === 0) {
      return fail(INVOICE_ERROR.INVALID_PAYLOAD, 'Geçersiz kalem kimliği gönderildi.')
    }
    if (!itemIdSet.has(id)) {
      // Başka faturaya (veya tenant'a) ait kimlikle silme denemesi.
      return fail(INVOICE_ERROR.FOREIGN_LINE_ID, 'Silinmek istenen kalem bu faturaya ait değil.')
    }
  }

  const deleteBrokerIds = payload.deleteBrokerIds ?? []
  if (!Array.isArray(deleteBrokerIds)) {
    return fail(INVOICE_ERROR.INVALID_PAYLOAD, 'deleteBrokerIds bir dizi olmalıdır.')
  }
  for (const id of deleteBrokerIds) {
    if (typeof id !== 'string' || !brokerIdSet.has(id)) {
      return fail(INVOICE_ERROR.FOREIGN_BROKER_ID, 'Silinmek istenen aracı bu faturaya ait değil.')
    }
  }

  // ── Kalemler ──
  let resultingItemCount: number
  let itemsUntouched = false

  if (payload.items === undefined) {
    // Kalem alanı gönderilmedi ⇒ mevcut kalemler korunur.
    resultingItemCount = existingItemIds.length - deleteItemIds.length
    itemsUntouched = deleteItemIds.length === 0
  } else {
    if (!Array.isArray(payload.items)) {
      return fail(INVOICE_ERROR.INVALID_PAYLOAD, 'items bir dizi olmalıdır.')
    }

    const seen = new Set<string>()
    for (let i = 0; i < payload.items.length; i++) {
      const line = payload.items[i]
      if (line === null || typeof line !== 'object' || line.fields === null || typeof line.fields !== 'object') {
        return fail(INVOICE_ERROR.INVALID_PAYLOAD, `Kalem ${i + 1} geçersiz.`)
      }
      const id = line.id ?? null
      if (id === null) continue
      if (typeof id !== 'string' || id.length === 0) {
        return fail(INVOICE_ERROR.INVALID_PAYLOAD, `Kalem ${i + 1} kimliği geçersiz.`)
      }
      if (seen.has(id)) {
        return fail(INVOICE_ERROR.DUPLICATE_LINE_ID, 'Aynı kalem birden fazla kez gönderildi.')
      }
      if (!itemIdSet.has(id)) {
        return fail(INVOICE_ERROR.FOREIGN_LINE_ID, 'Gönderilen kalem bu faturaya ait değil.')
      }
      if (deleteItemIds.includes(id)) {
        return fail(INVOICE_ERROR.INVALID_PAYLOAD, 'Bir kalem hem güncellenip hem silinemez.')
      }
      seen.add(id)
    }
    resultingItemCount = payload.items.length
  }

  if (resultingItemCount <= 0 && existingItemIds.length > 0 && payload.confirmDeleteAllLines !== true) {
    return fail(
      INVOICE_ERROR.EMPTY_LINES_NOT_CONFIRMED,
      'Faturadaki bütün kalemlerin silinmesi için açık onay gerekiyor.',
    )
  }

  // ── Aracılar ──
  if (payload.brokers !== undefined) {
    if (!Array.isArray(payload.brokers)) {
      return fail(INVOICE_ERROR.INVALID_PAYLOAD, 'brokers bir dizi olmalıdır.')
    }
    for (const line of payload.brokers) {
      const id = line?.id ?? null
      if (id === null) continue
      if (typeof id !== 'string' || !brokerIdSet.has(id)) {
        return fail(INVOICE_ERROR.FOREIGN_BROKER_ID, 'Gönderilen aracı bu faturaya ait değil.')
      }
    }
  }

  return {
    ok: true,
    value: {
      items: payload.items ?? null,
      deleteItemIds: [...deleteItemIds],
      brokers: payload.brokers ?? null,
      deleteBrokerIds: [...deleteBrokerIds],
      resultingItemCount,
      itemsUntouched,
    },
  }
}

// ─── Toplam tutarlılığı ────────────────────────────────────────────────────────

/**
 * Kalemlerden hesaplanan ara toplam (kuruş bazlı).
 *
 * Mevcut iş kuralı: `invoices.subtotal` üst kayıtta ayrı tutulur ve istemci
 * tarafından hesaplanır — kalemlerden türetilmez. Bu yüzden uyuşmazlık bir HATA
 * değil, raporlanan bir uyarıdır. Resmî toplam kaynağı kararı beklemektedir
 * (`docs/erp_data_integrity_and_invoice_parse_audit.md` §7.4).
 */
export function computeItemsSubtotal(items: Array<{ quantity: number; unit_price: number }>): number {
  const cents = items.reduce(
    (sum, item) => sum + Math.round(Number(item.quantity ?? 0) * Number(item.unit_price ?? 0) * 100),
    0,
  )
  return cents / 100
}

export function totalsMatch(computed: number, declared: number, toleranceCents = 2): boolean {
  return Math.abs(Math.round(computed * 100) - Math.round(declared * 100)) <= toleranceCents
}

// ─── RPC hata eşlemesi ─────────────────────────────────────────────────────────

const RPC_ERROR_MESSAGES: Record<InvoiceErrorCode, string> = {
  [INVOICE_ERROR.INVALID_PAYLOAD]: 'Gönderilen fatura verisi geçersiz.',
  [INVOICE_ERROR.FOREIGN_LINE_ID]: 'Gönderilen kalem bu faturaya ait değil.',
  [INVOICE_ERROR.FOREIGN_BROKER_ID]: 'Gönderilen aracı bu faturaya ait değil.',
  [INVOICE_ERROR.DUPLICATE_LINE_ID]: 'Aynı kalem birden fazla kez gönderildi.',
  [INVOICE_ERROR.EMPTY_LINES_NOT_CONFIRMED]:
    'Faturadaki bütün kalemlerin silinmesi için açık onay gerekiyor.',
  [INVOICE_ERROR.STALE_WRITE]:
    'Bu fatura siz düzenlerken başka bir oturumda güncellendi. Değişiklikleriniz kaydedilmedi; sayfayı yenileyip tekrar deneyin.',
  [INVOICE_ERROR.NOT_FOUND]: 'Fatura bulunamadı.',
  [INVOICE_ERROR.TENANT_MISMATCH]: 'Bu fatura kullanıcının firmasına ait değil.',
  [INVOICE_ERROR.IDEMPOTENCY_CONFLICT]:
    'Aynı kaydetme anahtarı farklı bir içerikle gönderildi. Sayfayı yenileyip tekrar deneyin.',
  [INVOICE_ERROR.RPC_MISSING]:
    'Fatura güncelleme veritabanı işlevi bulunamadı. `db/invoice_atomic_update_rpc.sql` migration’ı henüz apply edilmemiş.',
  [INVOICE_ERROR.WRITE_FAILED]: 'Fatura kaydedilemedi.',
}

export function mapInvoiceRpcError(raw: { code?: string; message?: string } | null | undefined): InvoiceError {
  const message = raw?.message ?? ''

  if (raw?.code === 'PGRST202' || raw?.code === '42883' || /could not find the function/i.test(message)) {
    return {
      code: INVOICE_ERROR.RPC_MISSING,
      message: RPC_ERROR_MESSAGES[INVOICE_ERROR.RPC_MISSING],
      retryable: false,
    }
  }

  for (const code of Object.values(INVOICE_ERROR)) {
    if (message.includes(code)) {
      return { code, message: RPC_ERROR_MESSAGES[code], retryable: false }
    }
  }

  // Şema uyumsuzluğu mesajı kullanıcıya anlaşılır biçimde çevrilir.
  if (/schema cache|column|could not find/i.test(message)) {
    return {
      code: INVOICE_ERROR.WRITE_FAILED,
      message: 'Fatura güncellenemedi. Kayıt alanları ile veritabanı şeması arasında uyumsuzluk var.',
      retryable: false,
    }
  }

  return {
    code: INVOICE_ERROR.WRITE_FAILED,
    message: RPC_ERROR_MESSAGES[INVOICE_ERROR.WRITE_FAILED],
    retryable: true,
  }
}
