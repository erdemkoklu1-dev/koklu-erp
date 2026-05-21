import { NextRequest, NextResponse } from 'next/server'
import AdmZip from 'adm-zip'
import { parsePdfBuffer, extractRawTextFromPdf } from '@/lib/parsePdfBuffer'
import { parseGelenFaturaWithAI } from '@/lib/invoice-ai-parser'

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const INVALID_SATICI_NAMES = new Set([
  'A.Ş.', 'LTD.', 'ŞTİ.', 'LTD', 'A.S.', 'ŞTİ', 'A.S',
  'ANONIM SIRKETI', 'LIMITED SIRKETI',
  'ÖDER', 'ÖDEME', 'FATURA', 'ÖDER.', 'ÖDEME.',
])

function isValidSaticiAdi(name: string | null | undefined): boolean {
  if (!name) return false
  const trimmed = name.trim()
  if (trimmed.length < 4) return false
  // E-posta adresi → geçersiz (ayrıca fixEmail ile düzeltilecek)
  if (trimmed.includes('@')) return false
  const upper = trimmed.toUpperCase().replace(/\s+/g, ' ')
  if (INVALID_SATICI_NAMES.has(upper)) return false
  // Sadece hukuki suffix'ten ibaret mi?
  if (/^(A\.Ş\.|LTD\.|ŞTİ\.|A\.S\.)$/i.test(trimmed)) return false
  // Tamamen küçük harf + kısa ise muhtemelen hatalı parse (unvanlar büyük harf)
  if (trimmed === trimmed.toLowerCase() && trimmed.length < 10) return false
  return true
}

function applyPostProcessing(parsed: Awaited<ReturnType<typeof parsePdfBuffer>>, filename: string) {
  // Fatura no yoksa dosya adından fallback üret — kritik hata sayma
  if (!parsed.fatura_no) {
    const base = filename
      .replace(/\.pdf$/i, '')
      .replace(/[^a-zA-Z0-9ÇĞİÖŞÜçğışöşü-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 50)
    parsed.fatura_no = `IMP-${base}`
    // Yalnızca "fatura numarası" sebebiyle set edilen hatayı temizle
    if (parsed.hata && /fatura numara/i.test(parsed.hata)) {
      parsed.hata = null
    }
  }

  // E-posta adresi tedarikçi adı olarak çıkmışsa → alan adından çıkar
  if (parsed.satici_adi && parsed.satici_adi.includes('@')) {
    const domain = parsed.satici_adi.split('@')[1]?.split('.')[0] ?? ''
    parsed.satici_adi = domain.toUpperCase() || `Tedarikçi (${parsed.satici_vkn ?? 'bilinmiyor'})`
  }

  // Geçersiz tedarikçi adını düzelt ("A.Ş.", "LTD", "öder" vb.)
  if (!isValidSaticiAdi(parsed.satici_adi)) {
    const vkn = parsed.satici_vkn ?? 'VKN bilinmiyor'
    parsed.satici_adi = `Tedarikçi (${vkn})`
  }
}

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
        applyPostProcessing(parsed, entry.entryName)
        invoices.push(parsed)
      }
    } else {
      const parsed = await parsePdfBuffer(buffer, file.name, 'gelen')
      await enhanceWithAI(buffer, parsed)
      applyPostProcessing(parsed, file.name)
      invoices.push(parsed)
    }

    return NextResponse.json({ invoices })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
