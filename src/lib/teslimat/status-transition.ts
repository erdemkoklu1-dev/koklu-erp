/**
 * Teslimat **durum geçişi** ve **takip kapatma** sözleşmesi — saf, I/O'suz katman.
 *
 * ── ÇÖZÜLEN P0 BULGUSU ────────────────────────────────────────────────────────
 * Stok yan etkisinin İKİ ayrı yazarı vardı:
 *   1. `updateTeslimat` → `teslimat_update_atomic` (net delta, kilitli, idempotent),
 *   2. `updateTeslimatDurumAction` → `syncTeslimatSideEffects` → `adjustUrunStok`
 *      (mutlak düşüm; kilit yok, idempotency yok, transaction yok).
 * İkincisi `tamamlandi` durumuna her girişte kalemlerin TAMAMINI stoktan tekrar
 * düşüyordu: `sevkte → tamamlandi → sevkte → tamamlandi` stoku iki kez eksiltiyordu.
 *
 * ── TEK YAZMA NOKTASI ─────────────────────────────────────────────────────────
 * Durum geçişi için AYRI bir RPC yazılmadı. Bunun yerine geçiş, mevcut kanonik
 * yazar olan `public.teslimat_update_atomic`'e **yalnızca `durum` içeren bir
 * parent patch** ve `p_lines = null` ("kalemlere dokunma") ile devredilir:
 *
 *     teslimat_update_atomic(id, '{"durum":"tamamlandi"}'::jsonb, null, ...)
 *
 * Böylece stok deltası, emanet/geri teslim mutabakatı, FIFO kapatma defteri,
 * durum geçmişi ve idempotency kaydı tek transaction'da ve TEK kod yolundan
 * uygulanır. İkinci bir yazar olmadığı için "iki yerde çoğaltma" riski
 * yapısal olarak ortadan kalkar (GOREV.md §8 "tek yazma noktası").
 *
 * Emanet/geri teslim **kapatma** işlemleri üst kaydı değil takip satırını
 * değiştirdiği için ayrı ve dar kapsamlı RPC'lere devredilir:
 * `db/teslimat_takip_action_atomic.sql`.
 *
 * Buradaki hesaplama **yetki kararı değildir**; erken/anlaşılır hata üretmek ve
 * RPC argümanlarını kurmak içindir. Sahiplik son sözü daima RPC'nindir.
 */

import {
  STOK_ETKILI_DURUM,
  computeStokDelta,
  computeStokEtkisi,
  type ExistingTeslimatKalem,
  type StokDelta,
  type TeslimatDurum,
  // Açık `.ts` uzantısı bilinçlidir: bu modül `node --test
  // --experimental-strip-types` altında doğrudan çalıştırılır ve Node ESM
  // çözümlemesi uzantısız göreli yolu kabul etmez.
  // `tsconfig.json` → `allowImportingTsExtensions: true`.
} from './teslimat-update.ts'

// ─── Durum kümesi ──────────────────────────────────────────────────────────────

/**
 * Gerçek durum adları — tahmin DEĞİL, üç bağımsız kaynaktan doğrulandı:
 *   - `src/app/(dashboard)/teslimatlar/actions.ts` durum doğrulama listesi,
 *   - `db/teslimat_atomic_update_rpc.sql` §6 `v_new_durum not in (...)`,
 *   - `src/lib/teslimatlar.ts` `TeslimatInput['durum']` + `softDeleteTeslimat`
 *     tarafından yazılan `'iptal'`.
 */
export const TESLIMAT_DURUMLAR = ['taslak', 'sevkte', 'tamamlandi', 'iptal'] as const

export function isTeslimatDurum(value: unknown): value is TeslimatDurum {
  return typeof value === 'string' && (TESLIMAT_DURUMLAR as readonly string[]).includes(value)
}

// ─── Geçiş matrisi ─────────────────────────────────────────────────────────────

/** Geçişin stok üzerindeki yönü. */
export type StokYonu =
  /** Stoktan düşülür (etkisiz durum → `tamamlandi`) */
  | 'dus'
  /** Stoğa iade edilir (`tamamlandi` → etkisiz durum) */
  | 'iade'
  /** Stok değişmez */
  | 'yok'

export interface DurumGecisPlani {
  eskiDurum: TeslimatDurum
  yeniDurum: TeslimatDurum
  /** Aynı durum tekrar gönderildi ⇒ hiçbir yazma yapılmaz. */
  noOp: boolean
  stokYonu: StokYonu
  /** `urun_id` bazında uygulanacak net fark. `noOp` ise daima boş. */
  deltalar: StokDelta[]
}

/**
 * Bir durumun stok etkisi var mı?
 *
 * Tek kaynak: `computeStokEtkisi` yalnızca `durum === 'tamamlandi'` iken etki
 * üretir. Aynı sabit burada yeniden kullanılır ki iki modül ayrışamasın.
 */
export function stokEtkisiVarMi(durum: string): boolean {
  return durum === STOK_ETKILI_DURUM
}

/**
 * Durum geçişinin stok yönünü ve net deltalarını hesaplar.
 *
 * TASARIM KARARI — yeni geçiş yasağı UYDURULMADI:
 *   Mevcut UI (`src/app/(dashboard)/teslimatlar/[id]/page.tsx:159-169`) dört durum
 *   arasında serbest geçişe izin verir; `iptal` durumundan geri dönüş de render
 *   edilir. Bu sprintte yeni bir business kuralı eklenmez (GOREV.md §8, §10).
 *   Güvenlik geçişi yasaklayarak değil, etkiyi **net delta** olarak tek kez
 *   uygulayarak sağlanır:
 *       f(durum) = durum === 'tamamlandi' ? Σ miktar : 0
 *       delta    = f(yeni) − f(eski)
 *   Bu fonksiyon idempotenttir: aynı geçiş ikinci kez geldiğinde `eski === yeni`
 *   olur, delta sıfırdır ve hiçbir stok hareketi üretilmez.
 */
export function planDurumGecisi(
  eskiDurum: TeslimatDurum,
  yeniDurum: TeslimatDurum,
  kalemler: ExistingTeslimatKalem[],
): DurumGecisPlani {
  if (eskiDurum === yeniDurum) {
    return { eskiDurum, yeniDurum, noOp: true, stokYonu: 'yok', deltalar: [] }
  }

  const deltalar = computeStokDelta(
    computeStokEtkisi(kalemler, eskiDurum),
    computeStokEtkisi(kalemler, yeniDurum),
  )

  const eskiEtkili = stokEtkisiVarMi(eskiDurum)
  const yeniEtkili = stokEtkisiVarMi(yeniDurum)

  let stokYonu: StokYonu = 'yok'
  if (!eskiEtkili && yeniEtkili) stokYonu = 'dus'
  else if (eskiEtkili && !yeniEtkili) stokYonu = 'iade'

  return { eskiDurum, yeniDurum, noOp: false, stokYonu, deltalar }
}

/**
 * Geçişin `teslimat_update_atomic` parent patch'i.
 *
 * YALNIZCA `durum` taşır. RPC'nin (9a) bloğu `p_parent_patch ? 'alan'` ve
 * `coalesce(...)` kullandığı için gönderilmeyen alanlar OLDUĞU GİBİ KALIR —
 * durum geçişi müşteri/şube/tarih/açıklama alanlarını sıfırlamaz.
 */
export function buildDurumPatch(yeniDurum: TeslimatDurum): { durum: TeslimatDurum } {
  return { durum: yeniDurum }
}

// ─── Idempotency anahtarları ───────────────────────────────────────────────────

/**
 * Durum geçişi için **deterministik** idempotency anahtarı.
 *
 * Aynı teslimatın, aynı sürümden (`updated_at`), aynı hedef duruma geçişi TEK bir
 * iş olayıdır; çift tıklama ikinci stok hareketi üretmemelidir. Sürüm anahtara
 * girdiği için gerçekten farklı olan bir sonraki geçiş yeni anahtar alır.
 *
 * Anahtar hassas veri taşımaz (yalnızca kimlik + durum + sürüm damgası).
 */
export function buildDurumGecisKey(
  teslimatId: string,
  yeniDurum: string,
  version: string | null | undefined,
): string {
  return `teslimat-durum:${teslimatId}:${yeniDurum}:${version ?? 'v0'}`
}

/** Emanet/geri teslim kapatma için deterministik idempotency anahtarı. */
export function buildTakipKapatmaKey(
  tip: 'emanet' | 'geri_teslim',
  takipId: string,
  version: string | null | undefined,
): string {
  return `teslimat-takip:${tip}:${takipId}:${version ?? 'v0'}`
}

// ─── Takip kapatma (emanet geri al / geri teslim yap) ──────────────────────────

export const TAKIP_ERROR = {
  /** Takip kaydı yok veya üst teslimat başka tenant'a ait */
  NOT_FOUND: 'TESLIMAT_TAKIP_NOT_FOUND',
  /** Kullanıcının firması ile kaydın firması uyuşmuyor */
  TENANT_MISMATCH: 'TESLIMAT_TENANT_MISMATCH',
  /** Kullanıcıya bağlı firma bulunamadı */
  NO_TENANT: 'TESLIMAT_NO_TENANT',
  /** Oturum doğrulanamadı */
  NOT_AUTHENTICATED: 'TESLIMAT_NOT_AUTHENTICATED',
  /** Aynı anahtar farklı payload ile geldi */
  IDEMPOTENCY_CONFLICT: 'TESLIMAT_IDEMPOTENCY_CONFLICT',
  /** Geçersiz miktar/argüman */
  INVALID_PAYLOAD: 'TESLIMAT_INVALID_PAYLOAD',
  /** Atomik takip RPC'si apply edilmemiş */
  RPC_MISSING: 'TESLIMAT_TAKIP_RPC_MISSING',
  /** Yazma sırasında veritabanı hatası */
  WRITE_FAILED: 'TESLIMAT_WRITE_FAILED',
} as const

export type TakipErrorCode = (typeof TAKIP_ERROR)[keyof typeof TAKIP_ERROR]

export interface TakipError {
  code: TakipErrorCode
  message: string
  retryable: boolean
}

/**
 * Kullanıcıya gösterilecek metinler.
 *
 * Hiçbiri VKN, müşteri adı, ham veritabanı mesajı veya kayıt içeriği taşımaz
 * (GOREV.md §9-9). "Bulunamadı" ile "başka tenant" bilinçli olarak AYNI mesajı
 * döndürür: aksi hâlde mesaj, başka firmanın kaydının var olduğunu sızdırır.
 */
const TAKIP_ERROR_MESSAGES: Record<TakipErrorCode, string> = {
  [TAKIP_ERROR.NOT_FOUND]: 'Kayıt bulunamadı veya bu kayda erişim yetkiniz yok.',
  [TAKIP_ERROR.TENANT_MISMATCH]: 'Kayıt bulunamadı veya bu kayda erişim yetkiniz yok.',
  [TAKIP_ERROR.NO_TENANT]: 'Kullanıcıya bağlı firma bulunamadı.',
  [TAKIP_ERROR.NOT_AUTHENTICATED]: 'Oturum gerekli.',
  [TAKIP_ERROR.IDEMPOTENCY_CONFLICT]:
    'Aynı işlem anahtarı farklı bir içerikle gönderildi. Sayfayı yenileyip tekrar deneyin.',
  [TAKIP_ERROR.INVALID_PAYLOAD]: 'Gönderilen işlem verisi geçersiz.',
  [TAKIP_ERROR.RPC_MISSING]:
    'Takip kapatma veritabanı işlevi bulunamadı. `db/teslimat_takip_action_atomic.sql` migration’ı henüz apply edilmemiş.',
  [TAKIP_ERROR.WRITE_FAILED]: 'İşlem kaydedilemedi.',
}

/**
 * PostgreSQL `raise exception` mesajını stabil hata koduna çevirir.
 * Kod bulunamazsa ham veritabanı mesajı **kullanıcıya sızdırılmaz**.
 */
export function mapTakipRpcError(
  raw: { code?: string; message?: string } | null | undefined,
): TakipError {
  const message = raw?.message ?? ''

  if (
    raw?.code === 'PGRST202' ||
    raw?.code === '42883' ||
    /could not find the function|does not exist/i.test(message)
  ) {
    return {
      code: TAKIP_ERROR.RPC_MISSING,
      message: TAKIP_ERROR_MESSAGES[TAKIP_ERROR.RPC_MISSING],
      retryable: false,
    }
  }

  // Uzun kodlar önce eşleşir: kısa bir kod uzun kodun alt dizesi olabilir.
  const codes = [...Object.values(TAKIP_ERROR)].sort((a, b) => b.length - a.length)
  for (const code of codes) {
    if (message.includes(code)) {
      return { code, message: TAKIP_ERROR_MESSAGES[code], retryable: false }
    }
  }

  return {
    code: TAKIP_ERROR.WRITE_FAILED,
    message: TAKIP_ERROR_MESSAGES[TAKIP_ERROR.WRITE_FAILED],
    retryable: true,
  }
}

/** Stabil kodlu takip hatası; ham veritabanı mesajı kullanıcıya sızmaz. */
export class TeslimatTakipError extends Error {
  code: TakipErrorCode
  retryable: boolean

  constructor(error: TakipError) {
    super(error.message)
    this.name = 'TeslimatTakipError'
    this.code = error.code
    this.retryable = error.retryable
  }
}
