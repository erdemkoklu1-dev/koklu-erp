/**
 * Teslimat atomik güncelleme sözleşmesi — **saf ve bağımlılıksız** karar katmanı.
 *
 * Bu dosya hiçbir import içermez ve hiçbir I/O yapmaz. Böylece stok delta modeli,
 * kimlik doğrulaması ve payload sözleşmesi gerçek veritabanı olmadan
 * `node --test` altında doğrudan test edilebilir.
 *
 * Domain kanıtları ve delta modelinin eşdeğerlik ispatı:
 *   `docs/teslimat_atomic_update_design.md`
 *
 * Yazma tarafı `db/teslimat_atomic_update_rpc.sql` içindeki tek transaction'dır.
 * Buradaki hesaplama **yetki kararı değildir**; erken ve anlaşılır hata üretmek ve
 * RPC argümanlarını kurmak içindir. Sahiplik son sözü daima RPC'nindir.
 */

// ─── Hata kodları ──────────────────────────────────────────────────────────────

export const TESLIMAT_ERROR = {
  /** Payload yapısı geçersiz */
  INVALID_PAYLOAD: 'TESLIMAT_INVALID_PAYLOAD',
  /** Gönderilen kalem kimliği bu teslimata ait değil */
  LINE_NOT_IN_PARENT: 'TESLIMAT_LINE_NOT_IN_PARENT',
  /** Aynı kalem kimliği birden fazla kez gönderildi */
  DUPLICATE_LINE_ID: 'TESLIMAT_DUPLICATE_LINE_ID',
  /** Sonuç boş kalem listesi ama açık onay yok */
  EMPTY_LINES_NOT_CONFIRMED: 'TESLIMAT_EMPTY_LINES_NOT_CONFIRMED',
  /** Kayıt başka bir oturumda güncellendi */
  STALE_WRITE: 'TESLIMAT_STALE_WRITE',
  /** Teslimat bulunamadı veya tenant sınırı dışında */
  NOT_FOUND: 'TESLIMAT_NOT_FOUND',
  /** Tenant uyuşmazlığı */
  TENANT_MISMATCH: 'TESLIMAT_TENANT_MISMATCH',
  /** Kısmen kapanmış emanet/geri teslim kaydı kaldırılamaz */
  TRACKING_IN_PROGRESS: 'TESLIMAT_TRACKING_IN_PROGRESS',
  /** Aynı idempotency anahtarı farklı payload ile geldi */
  IDEMPOTENCY_CONFLICT: 'TESLIMAT_IDEMPOTENCY_CONFLICT',
  /** Atomik RPC henüz apply edilmemiş */
  RPC_MISSING: 'TESLIMAT_RPC_MISSING',
  /** Yazma sırasında veritabanı hatası */
  WRITE_FAILED: 'TESLIMAT_WRITE_FAILED',
} as const

export type TeslimatErrorCode = (typeof TESLIMAT_ERROR)[keyof typeof TESLIMAT_ERROR]

export interface TeslimatError {
  code: TeslimatErrorCode
  message: string
  retryable: boolean
}

export type TeslimatResult<T> = { ok: true; value: T } | { ok: false; error: TeslimatError }

function fail(code: TeslimatErrorCode, message: string, retryable = false): { ok: false; error: TeslimatError } {
  return { ok: false, error: { code, message, retryable } }
}

// ─── Domain tipleri ────────────────────────────────────────────────────────────

/** Stok etkisi olan durum — tasarım belgesi §2.5. */
export const STOK_ETKILI_DURUM = 'tamamlandi'

export type TeslimatDurum = 'taslak' | 'sevkte' | 'tamamlandi' | 'iptal'

/** Stok hesabı için gereken minimum kalem alanları. */
export interface StokEtkiliKalem {
  urun_id: string | null
  miktar: number
  stoktan_duser_mi: boolean
}

/** Veritabanındaki mevcut kalem (kimliğiyle). */
export interface ExistingTeslimatKalem extends StokEtkiliKalem {
  id: string
}

/** İstemciden gelen kalem. `id` yoksa yeni kalemdir. */
export interface SubmittedTeslimatKalem<TFields extends StokEtkiliKalem = StokEtkiliKalem> {
  id?: string | null
  fields: TFields
}

export interface TeslimatLinesPayload<TFields extends StokEtkiliKalem = StokEtkiliKalem> {
  /**
   * `undefined` ⇒ kalem alanı gönderilmedi ⇒ mevcut kalemler AYNEN KORUNUR.
   * Dizi ⇒ tam ve nihai liste; listede olmayan mevcut kalemler silinir.
   */
  lines?: SubmittedTeslimatKalem<TFields>[]
  /** Kullanıcının açıkça silmeyi seçtiği kalem kimlikleri. */
  deleteLineIds?: string[]
  /** Sonuçta hiç kalem kalmayacaksa zorunlu açık onay. */
  confirmDeleteAllLines?: boolean
}

// ─── Stok delta modeli (tasarım §4) ────────────────────────────────────────────

/** `urun_id` → toplam düşülecek miktar. */
export type StokEtkisi = Map<string, number>

/**
 * Bir kalem kümesinin stok etkisini hesaplar.
 *
 * Kritik kural: etki **yalnızca** `durum = 'tamamlandi'` iken vardır
 * (`src/lib/teslimatlar.ts:450` — `applyKalemSideEffects` erken dönüşü).
 * Aynı ürünün birden çok kalemde bulunması tek toplamda birleştirilir.
 */
export function computeStokEtkisi(kalemler: StokEtkiliKalem[], durum: string): StokEtkisi {
  const effect: StokEtkisi = new Map()
  if (durum !== STOK_ETKILI_DURUM) return effect

  for (const kalem of kalemler) {
    const urunId = kalem.urun_id
    const miktar = Number(kalem.miktar ?? 0)
    if (!urunId || !kalem.stoktan_duser_mi || !(miktar > 0)) continue
    effect.set(urunId, (effect.get(urunId) ?? 0) + miktar)
  }
  return effect
}

export interface StokDelta {
  urun_id: string
  /** `> 0` ⇒ stoktan düş, `< 0` ⇒ stoğa iade et. */
  delta: number
}

/**
 * Net stok farkı: `yeni etki − eski etki`.
 *
 * Bu model, mevcut `reverseExistingStock` + `applyKalemSideEffects` çiftinin
 * **doğru çalıştığı senaryoda** (eski ve yeni durum ikisi de `tamamlandi`) birebir
 * aynı sonucu verir; farklı olduğu tek yer eski kodun stok şişiren hatasıdır
 * (tasarım §2.1 / T1). Kanıt: `tests/teslimat-stock-delta.test.ts`.
 */
export function computeStokDelta(oldEffect: StokEtkisi, newEffect: StokEtkisi): StokDelta[] {
  const urunIds = new Set<string>([...oldEffect.keys(), ...newEffect.keys()])
  const deltas: StokDelta[] = []

  for (const urunId of urunIds) {
    const delta = (newEffect.get(urunId) ?? 0) - (oldEffect.get(urunId) ?? 0)
    if (delta === 0) continue
    deltas.push({ urun_id: urunId, delta })
  }

  return deltas.sort((a, b) => (a.urun_id < b.urun_id ? -1 : a.urun_id > b.urun_id ? 1 : 0))
}

// ─── Kimlik doğrulaması ────────────────────────────────────────────────────────

export interface TeslimatLinePlan<TFields extends StokEtkiliKalem = StokEtkiliKalem> {
  /** RPC'ye gönderilecek nihai kalem listesi. `null` ⇒ kalemlere dokunma. */
  lines: SubmittedTeslimatKalem<TFields>[] | null
  /** Açıkça silinecek kimlikler (RPC ayrıca listede olmayanları da siler). */
  deleteLineIds: string[]
  /** İşlem sonrası beklenen kalem sayısı. */
  resultingLineCount: number
  /** Kalem alanı hiç gönderilmediği için hiçbir kalem işlemi yapılmayacak. */
  linesUntouched: boolean
}

/**
 * Gönderilen kalem kimliklerini mevcut kalemlerle karşılaştırır.
 *
 * Yabancı (başka teslimata ait veya silinmiş) kimlik **reddedilir** — RPC de aynı
 * kontrolü yapar; bu katman yalnızca kullanıcıya daha erken ve anlaşılır hata verir.
 */
export function planTeslimatLines<TFields extends StokEtkiliKalem>(
  existing: ExistingTeslimatKalem[],
  payload: TeslimatLinesPayload<TFields>,
): TeslimatResult<TeslimatLinePlan<TFields>> {
  if (payload === null || typeof payload !== 'object') {
    return fail(TESLIMAT_ERROR.INVALID_PAYLOAD, 'Kalem payload’u geçersiz.')
  }

  const existingIds = new Set(existing.map(row => row.id))

  const deleteLineIds = payload.deleteLineIds ?? []
  if (!Array.isArray(deleteLineIds)) {
    return fail(TESLIMAT_ERROR.INVALID_PAYLOAD, 'deleteLineIds bir dizi olmalıdır.')
  }
  const explicitDeletes = new Set<string>()
  for (const id of deleteLineIds) {
    if (typeof id !== 'string' || id.length === 0) {
      return fail(TESLIMAT_ERROR.INVALID_PAYLOAD, 'Geçersiz kalem kimliği gönderildi.')
    }
    if (!existingIds.has(id)) {
      return fail(TESLIMAT_ERROR.LINE_NOT_IN_PARENT, 'Silinmek istenen kalem bu teslimata ait değil.')
    }
    explicitDeletes.add(id)
  }

  // ── Kalem alanı gönderilmedi ⇒ mevcut kalemler korunur ──
  if (payload.lines === undefined) {
    const remaining = existing.length - explicitDeletes.size
    if (remaining <= 0 && existing.length > 0 && payload.confirmDeleteAllLines !== true) {
      return fail(
        TESLIMAT_ERROR.EMPTY_LINES_NOT_CONFIRMED,
        'Bütün kalemlerin silinmesi için açık onay gerekiyor.',
      )
    }
    return {
      ok: true,
      value: {
        lines: null,
        deleteLineIds: [...explicitDeletes],
        resultingLineCount: remaining,
        linesUntouched: explicitDeletes.size === 0,
      },
    }
  }

  if (!Array.isArray(payload.lines)) {
    return fail(TESLIMAT_ERROR.INVALID_PAYLOAD, 'lines bir dizi olmalıdır.')
  }

  const seenIds = new Set<string>()
  for (let index = 0; index < payload.lines.length; index++) {
    const line = payload.lines[index]
    if (line === null || typeof line !== 'object' || line.fields === null || typeof line.fields !== 'object') {
      return fail(TESLIMAT_ERROR.INVALID_PAYLOAD, `Kalem ${index + 1} geçersiz.`)
    }

    const id = line.id ?? null
    if (id === null) continue

    if (typeof id !== 'string' || id.length === 0) {
      return fail(TESLIMAT_ERROR.INVALID_PAYLOAD, `Kalem ${index + 1} kimliği geçersiz.`)
    }
    if (seenIds.has(id)) {
      return fail(TESLIMAT_ERROR.DUPLICATE_LINE_ID, 'Aynı kalem birden fazla kez gönderildi.')
    }
    if (!existingIds.has(id)) {
      return fail(TESLIMAT_ERROR.LINE_NOT_IN_PARENT, 'Gönderilen kalem bu teslimata ait değil.')
    }
    if (explicitDeletes.has(id)) {
      return fail(TESLIMAT_ERROR.INVALID_PAYLOAD, 'Bir kalem hem güncellenip hem silinemez.')
    }
    seenIds.add(id)
  }

  const resultingLineCount = payload.lines.length
  if (resultingLineCount === 0 && existing.length > 0 && payload.confirmDeleteAllLines !== true) {
    return fail(
      TESLIMAT_ERROR.EMPTY_LINES_NOT_CONFIRMED,
      'Bütün kalemlerin silinmesi için açık onay gerekiyor.',
    )
  }

  // `lines` tam listedir: listede olmayan mevcut kalemler de silinir.
  const implicitDeletes = existing
    .filter(row => !seenIds.has(row.id) && !explicitDeletes.has(row.id))
    .map(row => row.id)

  return {
    ok: true,
    value: {
      lines: payload.lines,
      deleteLineIds: [...new Set([...explicitDeletes, ...implicitDeletes])],
      resultingLineCount,
      linesUntouched: false,
    },
  }
}

// ─── Emanet / geri teslim koşulları (tasarım §5) ───────────────────────────────

/** `src/lib/teslimatlar.ts:68-72` ile birebir aynı küme. */
export const GERI_TESLIM_GEREKTIREN = new Set([
  'dolum_icin_alindi',
  'bakim_icin_alindi',
  'yenileme_icin_alindi',
])

/** `src/lib/teslimatlar.ts:458` koşulu. */
export function needsEmanetTakip(kalem: { hareket_tipi: string; emanet_mi: boolean; miktar: number }): boolean {
  if (!(Number(kalem.miktar ?? 0) > 0)) return false
  return kalem.hareket_tipi === 'emanet_teslim' || Boolean(kalem.emanet_mi)
}

/** `src/lib/teslimatlar.ts:461` koşulu. */
export function needsGeriTeslimTakip(kalem: {
  hareket_tipi: string
  geri_alinmasi_gerekir_mi: boolean
}): boolean {
  if (GERI_TESLIM_GEREKTIREN.has(kalem.hareket_tipi)) return true
  return Boolean(kalem.geri_alinmasi_gerekir_mi) && kalem.hareket_tipi !== 'emanet_teslim'
}

// ─── RPC hata eşlemesi ─────────────────────────────────────────────────────────

const RPC_ERROR_MESSAGES: Record<TeslimatErrorCode, string> = {
  [TESLIMAT_ERROR.INVALID_PAYLOAD]: 'Gönderilen teslimat verisi geçersiz.',
  [TESLIMAT_ERROR.LINE_NOT_IN_PARENT]: 'Gönderilen kalem bu teslimata ait değil.',
  [TESLIMAT_ERROR.DUPLICATE_LINE_ID]: 'Aynı kalem birden fazla kez gönderildi.',
  [TESLIMAT_ERROR.EMPTY_LINES_NOT_CONFIRMED]: 'Bütün kalemlerin silinmesi için açık onay gerekiyor.',
  [TESLIMAT_ERROR.STALE_WRITE]:
    'Bu teslimat siz düzenlerken başka bir oturumda güncellendi. Değişiklikleriniz kaydedilmedi; sayfayı yenileyip tekrar deneyin.',
  [TESLIMAT_ERROR.NOT_FOUND]: 'Teslimat bulunamadı.',
  [TESLIMAT_ERROR.TENANT_MISMATCH]: 'Bu teslimat kullanıcının firmasına ait değil.',
  [TESLIMAT_ERROR.TRACKING_IN_PROGRESS]:
    'Kısmen kapanmış emanet veya geri teslim kaydı bulunduğu için bu kalem kaldırılamaz.',
  [TESLIMAT_ERROR.IDEMPOTENCY_CONFLICT]:
    'Aynı kaydetme anahtarı farklı bir içerikle gönderildi. Sayfayı yenileyip tekrar deneyin.',
  [TESLIMAT_ERROR.RPC_MISSING]:
    'Teslimat güncelleme veritabanı işlevi bulunamadı. `db/teslimat_atomic_update_rpc.sql` migration’ı henüz apply edilmemiş.',
  [TESLIMAT_ERROR.WRITE_FAILED]: 'Teslimat kaydedilemedi.',
}

/**
 * PostgreSQL tarafından `raise exception` ile fırlatılan mesajı stabil hata koduna
 * çevirir. Kod bulunamazsa ham mesaj **kullanıcıya sızdırılmaz**.
 */
export function mapRpcError(raw: { code?: string; message?: string } | null | undefined): TeslimatError {
  const message = raw?.message ?? ''

  // RPC'nin hiç var olmaması: PostgREST PGRST202 / PostgreSQL 42883.
  if (raw?.code === 'PGRST202' || raw?.code === '42883' || /could not find the function|does not exist/i.test(message)) {
    return {
      code: TESLIMAT_ERROR.RPC_MISSING,
      message: RPC_ERROR_MESSAGES[TESLIMAT_ERROR.RPC_MISSING],
      retryable: false,
    }
  }

  for (const code of Object.values(TESLIMAT_ERROR)) {
    if (message.includes(code)) {
      return { code, message: RPC_ERROR_MESSAGES[code], retryable: false }
    }
  }

  return {
    code: TESLIMAT_ERROR.WRITE_FAILED,
    message: RPC_ERROR_MESSAGES[TESLIMAT_ERROR.WRITE_FAILED],
    retryable: true,
  }
}
