/**
 * `parsePdfBuffer` ↔ kanonik hat (`PdfParseOutcome`) köprüsü.
 *
 * ── KAPATILAN AÇIK ──────────────────────────────────────────────────────────
 * Route'lar metin katmanının varlığını şöyle belirliyordu:
 *
 *     hasTextLayer = hata !== 'PDF_METIN_KATMANI_YOK' && parse_durumu !== 'parse_hatasi'
 *
 * `parsePdfBuffer` `'PDF_METIN_KATMANI_YOK'` değerini hiç üretmez; pratikte tek
 * ölçüt `parse_durumu !== 'parse_hatasi'` kalıyordu. Kalemleri çözülemeyen ama
 * metni gayet okunabilen bir PDF böylece
 * **"Bu PDF taranmış görüntü içeriyor ve metin katmanı yok"** hatası alıyordu.
 * Kullanıcı, aslında yalnızca kalemleri elle girmesi yeterliyken belgeyi yeniden
 * taratmaya yönlendiriliyordu.
 *
 * Artık metin katmanı **doğrudan** ölçülür: `extractRawTextFromPdf` boş metin
 * döndürürse belge gerçekten taranmıştır. Metin varsa ama alanlar eksikse hat
 * bunu ayrı kodla (`PARSE_PDF_FIELDS_MISSING`) veya uyarılı bir ön izlemeyle
 * raporlar.
 */

import type { PdfParseOutcome } from './pipeline.ts'

export type PdfParseMode = 'satis' | 'gelen'

export async function parsePdfForPipeline(
  bytes: Uint8Array,
  filename: string,
  mode: PdfParseMode,
): Promise<PdfParseOutcome> {
  // `pdfjs-dist` ağırdır ve XML/ZIP yollarında hiç gerekmez ⇒ tembel import.
  const { extractRawTextFromPdf, parsePdfBuffer } = await import('../parsePdfBuffer.ts')
  const buffer = Buffer.from(bytes)

  let rawText = ''
  try {
    rawText = await extractRawTextFromPdf(buffer)
  } catch {
    // Metin hiç çıkarılamadı: aşağıda "metin katmanı yok" olarak raporlanır.
    // Bozuk/şifreli PDF'ler zaten `acceptInvoiceFile` katmanında elenir.
    rawText = ''
  }

  if (rawText.trim().length === 0) {
    return { hasTextLayer: false, hasRequiredFields: false, data: null, warnings: [] }
  }

  const result = await parsePdfBuffer(buffer, filename, mode)

  const warnings = [...(result.parse_uyarilari ?? [])]
  // `hata` burada "ölümcül" değil, kullanıcıya gösterilecek bir uyarıdır:
  // metin okundu, bazı alanlar çıkarılamadı. Sessizce yutulmaz.
  if (result.hata) warnings.push(result.hata)

  return {
    hasTextLayer: true,
    hasRequiredFields: Boolean(result.fatura_no) && Boolean(result.fatura_tarihi),
    data: result,
    warnings,
  }
}
