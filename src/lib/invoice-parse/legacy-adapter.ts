import { normalizeProductCapacity } from './product-capacity'

/**
 * Kanonik parse hattı ↔ eski `ParseResult` sözleşmesi arasındaki köprü.
 *
 * ── NEDEN ADAPTER, NEDEN TOPTAN DEĞİŞİM DEĞİL ───────────────────────────────
 * `/api/pdf-fatura-parse` ve `/api/gelen-pdf-parse` route'ları `{ invoices: [] }`
 * döndürüyor ve `src/app/(dashboard)/cari-hesap/fatura-import/page.tsx` bu şekle
 * bağlı. Yanıt şeklini değiştirmek, staging'de doğrulanamayacak bir UI davranış
 * değişikliği olurdu (Gate 0 NO-GO). Bu yüzden **iç mantık** kanonik hatta
 * taşınır, **dış sözleşme** korunur.
 *
 * ── KAPATILAN AÇIKLAR ───────────────────────────────────────────────────────
 * 1. AI BİRİNCİL KAYNAKTI. `pdf-fatura-parse` önce AI'ı deniyor, deterministik
 *    regex parse'ı yalnızca AI patlarsa kullanıyordu; üstelik AI sonucuna sabit
 *    `parse_confidence: 95` ve `parse_durumu: 'temiz_parse'` yazıyordu — hiçbir
 *    doğrulamadan geçmemiş bir çıktı "temiz" ilan ediliyordu.
 *    `gelen-pdf-parse` ise AI dönen her alanı deterministik sonucun ÜZERİNE
 *    yazıyor ve `parsed.hata = null` ile gerçek hataları siliyordu.
 *    Artık AI yalnızca **boş kalan alanı doldurur** (`mergeAiGaps`); dolu bir
 *    alanı asla ezmez, hatayı asla temizlemez, güven skorunu asla yükseltmez.
 *
 * 2. ZIP İÇİNDEKİ XML TAMAMEN YOK SAYILIYORDU. İki route da yalnızca `.pdf`
 *    entry'lerini geziyordu; UBL-TR e-fatura paketleri (XML) sessizce "geçerli
 *    fatura bulunamadı" veriyordu. Artık XML deterministik olarak ve PDF'ten
 *    ÖNCE işlenir.
 *
 * Bu modül saf ve bağımlılıksızdır (`ParseResult` yalnızca **tip** olarak
 * import edilir), böylece `node --test` altında doğrudan test edilir.
 */

import type { KalemItem, ParseResult } from '../parsePdfBuffer.ts'
import type { UblInvoice } from './ubl-tr.ts'

/** Parse sonucunun hangi basamaktan geldiği — ön izlemede ve raporda kullanılır. */
export type ParseKaynagi = 'ubl-xml' | 'pdf-text' | 'ai-destekli'

export interface LegacyParseResult extends ParseResult {
  /** Hangi basamağın ürettiği. Eski alanlara EK'tir; mevcut UI'yı bozmaz. */
  parse_kaynagi?: ParseKaynagi
  /** 0–1 arası güven skoru. */
  parse_guven?: number
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * UBL-TR faturasını eski `ParseResult` şekline çevirir.
 *
 * `mode`:
 *   - `'satis'` ⇒ karşı taraf **alıcıdır** (`musteri_*` doldurulur)
 *   - `'gelen'` ⇒ karşı taraf **düzenleyendir** (`satici_*` doldurulur)
 *
 * Taraflar UBL'de açıkça ayrıldığı için düzenleyen/alıcı **ters yazılamaz**;
 * eski PDF regex yolundaki en sık hata sınıfı burada yapısal olarak yok.
 */
export function ublToParseResult(
  ubl: UblInvoice,
  filename: string,
  mode: 'satis' | 'gelen',
): LegacyParseResult {
  const kalemler: KalemItem[] = ubl.lines.map(line => {
    const miktar = line.quantity ?? 0
    const birimFiyat = line.unitPrice ?? 0
    const satirToplam = line.lineTotal ?? round2(miktar * birimFiyat)
    return {
      urun_adi: normalizeProductCapacity(line.description ?? ''),
      miktar,
      birim: line.unit ?? 'Adet',
      birim_fiyat: birimFiyat,
      iskonto_orani: 0,
      iskonto_tutari: line.discountAmount ?? 0,
      kdv_orani: line.kdvRate ?? 0,
      kdv_tutari: line.kdvAmount ?? 0,
      satir_toplam: satirToplam,
    } as KalemItem
  })

  // Tutarsızlık varsa "temiz" denmez — dürüst sınıflandırma.
  const durum: ParseResult['parse_durumu'] =
    ubl.issues.length > 0 ? 'manuel_kontrol_gerekli' : 'temiz_parse'

  const base: LegacyParseResult = {
    filename,
    fatura_no: ubl.invoiceNumber,
    fatura_tarihi: ubl.issueDate,
    vade_tarihi: null,
    senaryo: ubl.profileId,
    musteri_adi: null,
    musteri_vkn: null,
    musteri_adresi: null,
    mal_hizmet_toplami: ubl.subtotal,
    kdv_matrahi: ubl.subtotal,
    kdv_tutari: ubl.taxTotal,
    vergiler_dahil_toplam: ubl.taxInclusiveTotal,
    odenecek_tutar: ubl.payableAmount,
    kalemler,
    banka_bilgileri: [],
    hata: null,
    parse_durumu: durum,
    parse_uyarilari: ubl.issues.map(issue => issue.message),
    parse_kaynagi: 'ubl-xml',
    // UBL deterministiktir; skor yalnızca alan doluluğundan gelir, uydurulmaz.
    parse_guven: ubl.issues.length > 0 ? 0.7 : 0.95,
  }

  if (mode === 'gelen') {
    base.satici_adi = ubl.supplier.name
    base.satici_vkn = ubl.supplier.taxId
    base.musteri_adi = ubl.customer.name
    base.musteri_vkn = ubl.customer.taxId
  } else {
    base.musteri_adi = ubl.customer.name
    base.musteri_vkn = ubl.customer.taxId
  }

  return base
}

/** `mergeAiGaps` için AI çıktısının alan eşlemesi. */
export type AiGapFields = Partial<
  Pick<
    ParseResult,
    | 'fatura_no'
    | 'fatura_tarihi'
    | 'vade_tarihi'
    | 'musteri_adi'
    | 'musteri_vkn'
    | 'musteri_adresi'
    | 'satici_adi'
    | 'satici_vkn'
    | 'tedarikci_adres'
    | 'tedarikci_il'
    | 'kdv_tutari'
    | 'odenecek_tutar'
    | 'gider_kategorisi'
  >
> & { kalemler?: KalemItem[] }

const GAP_FIELDS = [
  'fatura_no',
  'fatura_tarihi',
  'vade_tarihi',
  'musteri_adi',
  'musteri_vkn',
  'musteri_adresi',
  'satici_adi',
  'satici_vkn',
  'tedarikci_adres',
  'tedarikci_il',
  'kdv_tutari',
  'odenecek_tutar',
  'gider_kategorisi',
] as const

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '' || Number.isNaN(value)
}

/**
 * AI çıktısını **yalnızca boş alanlara** uygular.
 *
 * SÖZLEŞME (GOREV.md §12 — "AI tek doğruluk kaynağı olamaz"):
 *   * Deterministik olarak dolmuş hiçbir alan EZİLMEZ.
 *   * `hata` alanı AI tarafından TEMİZLENMEZ.
 *   * Kalemler yalnızca deterministik parse **hiç kalem bulamadıysa** eklenir.
 *   * AI herhangi bir alanı doldurduysa sonuç `manuel_kontrol_gerekli` olur ve
 *     güven skoru YÜKSELMEZ — kullanıcı doğrulaması zorunlu kalır.
 *   * Hangi alanların AI'dan geldiği `parse_uyarilari` içinde açıkça yazılır.
 *
 * `base` mutasyona uğratılmaz; yeni nesne döner.
 */
export function mergeAiGaps(base: LegacyParseResult, ai: AiGapFields | null | undefined): LegacyParseResult {
  if (!ai) return base

  const result: LegacyParseResult = { ...base, kalemler: [...base.kalemler] }
  const doldurulan: string[] = []

  for (const field of GAP_FIELDS) {
    const current = result[field]
    const proposed = ai[field]
    if (isEmpty(current) && !isEmpty(proposed)) {
      // Tip güvenliği: alan başına atama, geniş cast YOK.
      switch (field) {
        case 'kdv_tutari':
        case 'odenecek_tutar':
          result[field] = proposed as number
          break
        case 'gider_kategorisi':
          result.gider_kategorisi = proposed as string
          break
        default:
          result[field] = proposed as string
      }
      doldurulan.push(field)
    }
  }

  if (result.kalemler.length === 0 && ai.kalemler && ai.kalemler.length > 0) {
    result.kalemler = ai.kalemler
    doldurulan.push('kalemler')
  }

  if (doldurulan.length === 0) return base

  return {
    ...result,
    // AI dokunduysa "temiz" denemez ve güven skoru yükseltilemez.
    parse_durumu: 'manuel_kontrol_gerekli',
    parse_kaynagi: 'ai-destekli',
    parse_guven: Math.min(base.parse_guven ?? 0.5, 0.5),
    parse_uyarilari: [
      ...(result.parse_uyarilari ?? []),
      `Şu alanlar yapay zekâ tarafından tamamlandı ve doğrulanmamıştır: ${doldurulan.join(', ')}. Kaydetmeden önce kontrol edin.`,
    ],
    // AI hatayı ASLA temizlemez.
    hata: base.hata,
  }
}

/**
 * PDF metin katmanı sonucunu ortak sözleşmeye taşır.
 * `parsePdfBuffer` kendi `parse_durumu`/`parse_uyarilari` alanlarını üretir;
 * burada yalnızca kaynak ve güven skoru eklenir.
 */
export function tagPdfResult(result: ParseResult): LegacyParseResult {
  const uyariSayisi = result.parse_uyarilari?.length ?? 0
  const guven =
    result.parse_durumu === 'parse_hatasi' ? 0.2 : uyariSayisi > 0 ? 0.5 : 0.75

  return { ...result, parse_kaynagi: 'pdf-text', parse_guven: guven }
}
