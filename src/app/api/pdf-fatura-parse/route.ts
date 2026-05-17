import { NextRequest, NextResponse } from 'next/server'
import AdmZip from 'adm-zip'
import { parsePdfBuffer, extractRawTextFromPdf } from '@/lib/parsePdfBuffer'
import { parseInvoiceWithAI } from '@/lib/invoice-ai-parser'
import type { ParseResult, KalemItem } from '@/lib/parsePdfBuffer'

// AI parse sonucunu ParseResult formatına dönüştür
function aiToParseResult(ai: Awaited<ReturnType<typeof parseInvoiceWithAI>>, filename: string): ParseResult {
  const kalemler: KalemItem[] = ai.kalemler.map(k => ({
    urun_adi:         k.aciklama,
    raw_description:  k.aciklama,
    normalized_description: k.aciklama,
    miktar:           k.miktar,
    birim:            k.birim || 'Adet',
    birim_fiyat:      k.birim_fiyat,
    iskonto_orani:    k.iskonto_orani ?? 0,
    iskonto_tutari:   0,
    kdv_orani:        k.kdv_orani,
    kdv_tutari:       k.kdv_tutari,
    satir_toplam:     k.tutar,
    parse_confidence: 95,
    parse_warnings:   [],
  }))

  const vkn = ai.musteri_vkn || ai.musteri_tckn || null

  return {
    filename,
    fatura_no:              ai.fatura_no || null,
    fatura_tarihi:          ai.fatura_tarihi || null,
    vade_tarihi:            ai.vade_tarihi || null,
    senaryo:                null,
    musteri_adi:            ai.musteri_adi || null,
    musteri_vkn:            vkn,
    musteri_adresi:         ai.musteri_adres || null,
    musteri_il:             ai.musteri_il || null,
    mal_hizmet_toplami:     null,
    kdv_matrahi:            null,
    kdv_tutari:             ai.kdv_toplam || null,
    vergiler_dahil_toplam:  ai.toplam_tutar || null,
    odenecek_tutar:         ai.toplam_tutar || null,
    kalemler,
    banka_bilgileri:        [],
    hata:                   null,
    parse_durumu:           'temiz_parse',
    parse_uyarilari:        [],
  }
}

// Dosya adından (KOK..._VKN_AD.pdf) bilgi çıkar ve parse sonucunu zenginleştir
function enrichFromFilename(result: ParseResult, filename: string): ParseResult {
  const baseName = (filename.split('/').pop() ?? filename).replace(/\.pdf$/i, '')
  const match = baseName.match(/^([A-Z]{2,4}\d{13})_(\d{10,11})_(.+)$/)
  if (!match) return result
  if (!result.fatura_no)   result.fatura_no   = match[1]
  if (!result.musteri_vkn) result.musteri_vkn  = match[2]
  if (!result.musteri_adi) result.musteri_adi  = match[3].trim()
  return result
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'Dosya bulunamadı' }, { status: 400 })
    }

    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'zip' && ext !== 'pdf') {
      return NextResponse.json({ error: 'Yalnızca PDF veya ZIP dosyası yükleyebilirsiniz' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const invoices: ParseResult[] = []

    const useAI = !!process.env.GROQ_API_KEY

    async function parseSinglePdf(pdfBuffer: Buffer, entryName: string): Promise<ParseResult> {
      // AI parse dene
      if (useAI) {
        try {
          const rawText = await extractRawTextFromPdf(pdfBuffer)
          const aiResult = await parseInvoiceWithAI(rawText)
          const result = aiToParseResult(aiResult, entryName)
          return enrichFromFilename(result, entryName)
        } catch (aiErr) {
          console.warn('[pdf-parse] AI parse başarısız, regex fallback:', (aiErr as Error).message)
        }
      }

      // Regex fallback
      return parsePdfBuffer(pdfBuffer, entryName, 'satis')
    }

    if (ext === 'zip') {
      const zip = new AdmZip(buffer)
      const entries = zip.getEntries()
        .filter(e => e.entryName.toLowerCase().endsWith('.pdf') && !e.entryName.startsWith('__MACOSX'))
        .sort((a, b) => a.entryName.localeCompare(b.entryName))

      for (const entry of entries) {
        const pdfBuffer = entry.getData()
        const parsed = await parseSinglePdf(pdfBuffer, entry.entryName)
        invoices.push(parsed)
      }
    } else {
      const parsed = await parseSinglePdf(buffer, file.name)
      invoices.push(parsed)
    }

    return NextResponse.json({ invoices })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
