import { NextRequest, NextResponse } from 'next/server'
import { extractRawTextFromPdf } from '@/lib/parsePdfBuffer'
import { parseInvoiceWithAI } from '@/lib/invoice-ai-parser'
import { newRequestId } from '@/lib/api/response'
import { parseInvoiceBatch } from '@/lib/invoice-parse/server-batch'
import type { AiGapFields, LegacyParseResult } from '@/lib/invoice-parse/legacy-adapter'
import type { KalemItem } from '@/lib/parsePdfBuffer'

/**
 * Satış faturası toplu ayrıştırma — **kanonik hatta delege eder**.
 *
 * ── ÖNCE (kapatılan açıklar) ────────────────────────────────────────────────
 *  1. **AI BİRİNCİL KAYNAKTI.** Rota önce `parseInvoiceWithAI`'ı çağırıyor,
 *     deterministik `parsePdfBuffer` yalnızca AI patlarsa devreye giriyordu.
 *     Üstelik AI çıktısına sabit `parse_confidence: 95` ve
 *     `parse_durumu: 'temiz_parse'` yazılıyordu — hiçbir şema/toplam
 *     doğrulamasından geçmemiş bir sonuç "temiz" ilan ediliyordu.
 *  2. **ZIP içindeki XML tamamen yok sayılıyordu** (`.pdf` filtresi). UBL-TR
 *     e-fatura paketleri sessizce "geçerli fatura bulunamadı" veriyordu.
 *  3. Dosya türü yalnızca **uzantıdan** belirleniyordu.
 *  4. ZIP'te entry sayısı, açılmış boyut, sıkıştırma oranı ve path traversal
 *     kontrolü YOKTU.
 *  5. Hata yolunda **ham exception mesajı** istemciye dönüyordu.
 *
 * ── SONRA ───────────────────────────────────────────────────────────────────
 * Bütün ayrıştırma `parseInvoiceBatch` içinde; öncelik sırası
 * XML → PDF, AI yalnızca boş alan doldurucu (`mergeAiGaps`).
 *
 * Yanıt şekli (`{ invoices: [...] }` / `{ error }`) bilinçli olarak KORUNDU:
 * `src/app/(dashboard)/cari-hesap/fatura-import/page.tsx` buna bağlı ve Gate 0
 * NO-GO iken UI davranışı değiştirmek doğrulanamaz.
 */

export const runtime = 'nodejs'

/** AI çağrısı için üst süre; aşılırsa deterministik sonuç korunur. */
const AI_TIMEOUT_MS = 45_000

/** Dosya adından (KOK..._VKN_AD.pdf) yalnızca BOŞ alanları tamamlar. */
function enrichFromFilename(result: LegacyParseResult, filename: string): LegacyParseResult {
  const baseName = (filename.split('/').pop() ?? filename).replace(/\.pdf$/i, '')
  const match = baseName.match(/^([A-Z]{2,4}\d{13})_(\d{10,11})_(.+)$/)
  if (!match) return result
  if (!result.fatura_no) result.fatura_no = match[1]
  if (!result.musteri_vkn) result.musteri_vkn = match[2]
  if (!result.musteri_adi) result.musteri_adi = match[3].trim()
  return result
}

/**
 * AI **boşluk doldurucu**. Hiçbir alanı ezmez; `mergeAiGaps` yalnızca boş
 * alanlara uygular ve sonucu `manuel_kontrol_gerekli` olarak işaretler.
 */
async function aiFill(pdfBuffer: Buffer, base: LegacyParseResult): Promise<AiGapFields | null> {
  if (!process.env.GROQ_API_KEY) return null

  // Deterministik parse zaten yeterliyse AI'a hiç gidilmez (maliyet + gürültü).
  const eksik = !base.fatura_no || !base.fatura_tarihi || !base.odenecek_tutar || base.kalemler.length === 0
  if (!eksik) return null

  const rawText = await extractRawTextFromPdf(pdfBuffer)
  const ai = await Promise.race([
    parseInvoiceWithAI(rawText),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('AI_TIMEOUT')), AI_TIMEOUT_MS).unref?.()
    }),
  ])

  const kalemler: KalemItem[] = (ai.kalemler ?? []).map(k => ({
    urun_adi: k.aciklama,
    miktar: k.miktar,
    birim: k.birim || 'Adet',
    birim_fiyat: k.birim_fiyat,
    iskonto_orani: k.iskonto_orani ?? 0,
    iskonto_tutari: 0,
    kdv_orani: k.kdv_orani,
    kdv_tutari: k.kdv_tutari,
    satir_toplam: k.tutar,
  } as KalemItem))

  return {
    fatura_no: ai.fatura_no || undefined,
    fatura_tarihi: ai.fatura_tarihi || undefined,
    vade_tarihi: ai.vade_tarihi || undefined,
    musteri_adi: ai.musteri_adi || undefined,
    musteri_vkn: ai.musteri_vkn || ai.musteri_tckn || undefined,
    musteri_adresi: ai.musteri_adres || undefined,
    kdv_tutari: ai.kdv_toplam ?? undefined,
    odenecek_tutar: ai.toplam_tutar ?? undefined,
    kalemler: kalemler.length > 0 ? kalemler : undefined,
  }
}

export async function POST(req: NextRequest) {
  const requestId = newRequestId()

  try {
    const formData = await req.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 400 })
    }

    const outcome = await parseInvoiceBatch(new Uint8Array(await file.arrayBuffer()), {
      mode: 'satis',
      filename: file.name,
      aiFill,
      aiDelayMs: 200,
    })

    if (!outcome.ok) {
      console.error(`[pdf-fatura-parse] requestId=${requestId} code=${outcome.error.code}`)
      return NextResponse.json({ error: outcome.error.message }, { status: outcome.error.status })
    }

    const invoices = outcome.invoices.map(invoice => enrichFromFilename(invoice, invoice.filename))
    return NextResponse.json({ invoices })
  } catch (err) {
    // Ham exception mesajı ve stack trace istemciye DÖNMEZ.
    console.error(
      `[pdf-fatura-parse] requestId=${requestId} code=UNEXPECTED`,
      err instanceof Error ? err.message : 'bilinmeyen',
    )
    return NextResponse.json(
      { error: 'Fatura ayrıştırılamadı. Lütfen tekrar deneyin.' },
      { status: 500 },
    )
  }
}
