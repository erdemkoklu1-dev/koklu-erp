import { NextRequest, NextResponse } from 'next/server'
import { extractRawTextFromPdf } from '@/lib/parsePdfBuffer'
import { parseGelenFaturaWithAI } from '@/lib/invoice-ai-parser'
import { newRequestId } from '@/lib/api/response'
import { parseInvoiceBatch } from '@/lib/invoice-parse/server-batch'
import type { AiGapFields, LegacyParseResult } from '@/lib/invoice-parse/legacy-adapter'
import type { KalemItem } from '@/lib/parsePdfBuffer'

/**
 * Gelen (tedarikçi) fatura toplu ayrıştırma — **kanonik hatta delege eder**.
 *
 * ── ÖNCE (kapatılan açıklar) ────────────────────────────────────────────────
 *  1. **AI deterministik sonucu EZİYORDU.** `enhanceWithAI` her dolu AI alanını
 *     regex sonucunun üzerine yazıyor, üstelik kalem bulduğunda
 *     `parsed.hata = null` ile gerçek parse hatasını siliyordu. Bu, AI'ı fiilen
 *     birincil doğruluk kaynağı yapıyordu.
 *  2. **ZIP içindeki XML tamamen yok sayılıyordu** (`.pdf` filtresi).
 *  3. Dosya türü yalnızca **uzantıdan** belirleniyordu.
 *  4. ZIP güvenlik sınırları (entry sayısı/boyut/oran/traversal) YOKTU.
 *  5. Hata yolunda **ham exception mesajı** istemciye dönüyordu.
 *
 * ── SONRA ───────────────────────────────────────────────────────────────────
 * Ayrıştırma `parseInvoiceBatch` içinde; AI yalnızca boş alan doldurucu ve
 * dokunduğu sonucu `manuel_kontrol_gerekli` yapar.
 *
 * Yanıt şekli (`{ invoices: [...] }` / `{ error }`) bilinçli olarak KORUNDU.
 */

export const runtime = 'nodejs'

const AI_TIMEOUT_MS = 45_000

const INVALID_SATICI_NAMES = new Set([
  'A.Ş.', 'LTD.', 'ŞTİ.', 'LTD', 'A.S.', 'ŞTİ', 'A.S',
  'ANONIM SIRKETI', 'LIMITED SIRKETI',
  'ÖDER', 'ÖDEME', 'FATURA', 'ÖDER.', 'ÖDEME.',
])

function isValidSaticiAdi(name: string | null | undefined): boolean {
  if (!name) return false
  const trimmed = name.trim()
  if (trimmed.length < 4) return false
  if (trimmed.includes('@')) return false
  const upper = trimmed.toUpperCase().replace(/\s+/g, ' ')
  if (INVALID_SATICI_NAMES.has(upper)) return false
  if (/^(A\.Ş\.|LTD\.|ŞTİ\.|A\.S\.)$/i.test(trimmed)) return false
  if (trimmed === trimmed.toLowerCase() && trimmed.length < 10) return false
  return true
}

/**
 * Ad/numara temizliği.
 *
 * DİKKAT: UBL-XML'den gelen sonuçlara DOKUNULMAZ. Bu düzeltmeler PDF metin
 * katmanının bilinen kusurları içindir; deterministik XML çıktısını "onarmaya"
 * çalışmak doğru veriyi bozardı.
 */
function applyPostProcessing(parsed: LegacyParseResult): LegacyParseResult {
  if (parsed.parse_kaynagi === 'ubl-xml') return parsed

  const result = { ...parsed }

  if (!result.fatura_no) {
    const base = result.filename
      .replace(/\.pdf$/i, '')
      .replace(/[^a-zA-Z0-9ÇĞİÖŞÜçğışöşü-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 50)
    result.fatura_no = `IMP-${base}`
    if (result.hata && /fatura numara/i.test(result.hata)) {
      result.hata = null
    }
  }

  if (result.satici_adi && result.satici_adi.includes('@')) {
    const domain = result.satici_adi.split('@')[1]?.split('.')[0] ?? ''
    result.satici_adi = domain.toUpperCase() || `Tedarikçi (${result.satici_vkn ?? 'bilinmiyor'})`
  }

  if (!isValidSaticiAdi(result.satici_adi)) {
    result.satici_adi = `Tedarikçi (${result.satici_vkn ?? 'VKN bilinmiyor'})`
  }

  return result
}

/** AI **boşluk doldurucu**; dolu alanı ezmez, hatayı silmez. */
async function aiFill(pdfBuffer: Buffer, base: LegacyParseResult): Promise<AiGapFields | null> {
  if (!process.env.GROQ_API_KEY) return null

  const eksik =
    !base.satici_adi || !base.satici_vkn || !base.fatura_no || !base.fatura_tarihi ||
    !base.odenecek_tutar || base.kalemler.length === 0
  if (!eksik) return null

  const rawText = await extractRawTextFromPdf(pdfBuffer)
  const ai = await Promise.race([
    parseGelenFaturaWithAI(rawText),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('AI_TIMEOUT')), AI_TIMEOUT_MS).unref?.()
    }),
  ])

  const kalemler: KalemItem[] = (ai.kalemler ?? []).map(k => ({
    urun_adi: k.aciklama,
    miktar: k.miktar || 1,
    birim: k.birim || 'Adet',
    birim_fiyat: k.birim_fiyat || 0,
    iskonto_orani: 0,
    iskonto_tutari: 0,
    kdv_orani: k.kdv_orani || 20,
    kdv_tutari: k.kdv_tutari || 0,
    satir_toplam: k.tutar || 0,
  } as KalemItem))

  return {
    satici_adi: ai.tedarikci_adi || undefined,
    satici_vkn: ai.tedarikci_vkn || undefined,
    tedarikci_adres: ai.tedarikci_adres || undefined,
    tedarikci_il: ai.tedarikci_il || undefined,
    fatura_no: ai.fatura_no || undefined,
    fatura_tarihi: ai.fatura_tarihi || undefined,
    vade_tarihi: ai.vade_tarihi || undefined,
    odenecek_tutar: ai.toplam_tutar ?? undefined,
    kdv_tutari: ai.kdv_toplam ?? undefined,
    gider_kategorisi: ai.kategori || undefined,
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
      mode: 'gelen',
      filename: file.name,
      aiFill,
      aiDelayMs: 200,
    })

    if (!outcome.ok) {
      console.error(`[gelen-pdf-parse] requestId=${requestId} code=${outcome.error.code}`)
      return NextResponse.json({ error: outcome.error.message }, { status: outcome.error.status })
    }

    return NextResponse.json({ invoices: outcome.invoices.map(applyPostProcessing) })
  } catch (err) {
    console.error(
      `[gelen-pdf-parse] requestId=${requestId} code=UNEXPECTED`,
      err instanceof Error ? err.message : 'bilinmeyen',
    )
    return NextResponse.json(
      { error: 'Fatura ayrıştırılamadı. Lütfen tekrar deneyin.' },
      { status: 500 },
    )
  }
}
