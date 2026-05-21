import { NextRequest, NextResponse } from 'next/server'
import AdmZip from 'adm-zip'
import { parsePdfBuffer, extractRawTextFromPdf } from '@/lib/parsePdfBuffer'
import { parseGelenFaturaWithAI } from '@/lib/invoice-ai-parser'

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

async function enhanceWithAI(pdfBuffer: Buffer, parsed: Awaited<ReturnType<typeof parsePdfBuffer>>) {
  try {
    const rawText = await extractRawTextFromPdf(pdfBuffer)
    const ai = await parseGelenFaturaWithAI(rawText)

    if (ai.tedarikci_adi) parsed.satici_adi = ai.tedarikci_adi
    if (ai.tedarikci_vkn) parsed.satici_vkn = ai.tedarikci_vkn
    if (ai.tedarikci_adres) parsed.tedarikci_adres = ai.tedarikci_adres
    if (ai.fatura_no) parsed.fatura_no = ai.fatura_no
    if (ai.fatura_tarihi) parsed.fatura_tarihi = ai.fatura_tarihi
    if (ai.vade_tarihi) parsed.vade_tarihi = ai.vade_tarihi || null
    if (ai.toplam_tutar) parsed.odenecek_tutar = ai.toplam_tutar
    if (ai.kdv_toplam) parsed.kdv_tutari = ai.kdv_toplam
    if (ai.kategori) parsed.gider_kategorisi = ai.kategori

    if (ai.kalemler && ai.kalemler.length > 0) {
      parsed.kalemler = ai.kalemler.map(k => ({
        urun_adi:       k.aciklama,
        miktar:         k.miktar   || 1,
        birim:          k.birim    || 'Adet',
        birim_fiyat:    k.birim_fiyat || 0,
        iskonto_orani:  0,
        iskonto_tutari: 0,
        kdv_orani:      k.kdv_orani  || 20,
        kdv_tutari:     k.kdv_tutari || 0,
        satir_toplam:   k.tutar      || 0,
      }))
      parsed.hata = null
    }
  } catch (aiError) {
    console.error('[gelen-pdf-parse] AI parse hatası, regex sonucu kullanılıyor:', aiError)
  }
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
    const invoices = []

    if (ext === 'zip') {
      const zip = new AdmZip(buffer)
      const entries = zip.getEntries()
        .filter(e => e.entryName.toLowerCase().endsWith('.pdf') && !e.entryName.startsWith('__MACOSX'))
        .sort((a, b) => a.entryName.localeCompare(b.entryName))

      for (let i = 0; i < entries.length; i++) {
        if (i > 0) await delay(200)
        const entry = entries[i]
        const pdfBuffer = entry.getData()
        const parsed = await parsePdfBuffer(pdfBuffer, entry.entryName, 'gelen')
        await enhanceWithAI(pdfBuffer, parsed)
        invoices.push(parsed)
      }
    } else {
      const parsed = await parsePdfBuffer(buffer, file.name, 'gelen')
      await enhanceWithAI(buffer, parsed)
      invoices.push(parsed)
    }

    return NextResponse.json({ invoices })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
