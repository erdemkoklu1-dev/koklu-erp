'use client'
import React, { useState, useRef, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { formatCurrency } from '@/lib/finance/formatters'
import { useSearchParams } from 'next/navigation'

// ---- Yardımcı fonksiyonlar ----

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim()
}
// ════════════════════════════════════════════════════════
//  PDF FATURA IMPORT
// ════════════════════════════════════════════════════════

type PdfInvoiceItem = {
  urun_adi: string
  miktar: number
  birim: string
  birim_fiyat: number
  iskonto_orani: number
  iskonto_tutari: number
  kdv_orani: number
  kdv_tutari: number
  satir_toplam: number
}

type ParsedInvoice = {
  filename: string
  fatura_no: string | null
  fatura_tarihi: string | null
  vade_tarihi: string | null
  senaryo: string | null
  musteri_adi: string | null
  musteri_vkn: string | null
  musteri_adresi: string | null
  kdv_matrahi: number | null
  kdv_tutari: number | null
  odenecek_tutar: number | null
  kalemler: PdfInvoiceItem[]
  banka_bilgileri: Array<{ iban: string; banka_adi?: string | null }>
  hata?: string | null
}

type PdfRowStatus = 'eklenecek' | 'yeni_musteri' | 'duplicate' | 'hata'

type PdfPreviewRow = ParsedInvoice & {
  rowStatus: PdfRowStatus
  editedName: string
  expanded: boolean
}

type PdfStep = 'upload' | 'parsing' | 'preview' | 'importing' | 'done'

type PdfImportResult = {
  eklendi: number
  atilandi: number
  yeniMusteri: number
  toplamCihaz: number
  results: Array<{
    filename: string
    fatura_no: string
    musteri_adi: string
    status: 'eklendi' | 'atilandi' | 'hata'
    customer_id?: string
    invoice_id?: string
    cihaz_sayisi?: number
    musteri_yeni: boolean
    error?: string
  }>
}

function fmtAmt(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return formatCurrency(v)
}

function PdfFaturaImport() {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<PdfStep>('upload')
  const [error, setError] = useState('')
  const [previewRows, setPreviewRows] = useState<PdfPreviewRow[]>([])
  const [importResult, setImportResult] = useState<PdfImportResult | null>(null)

  async function handleFile(file: File) {
    const lowerName = file.name.toLowerCase()
    if (!lowerName.endsWith('.zip') && !lowerName.endsWith('.pdf')) {
      setError('Yalnızca PDF veya ZIP dosyası yükleyebilirsiniz.')
      return
    }
    setStep('parsing')
    setError('')

    try {
      // ── Dosyayı API'ye gönder, Python ile parse et ────────────
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/pdf-fatura-parse', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Parse hatası')

      const invoices: ParsedInvoice[] = data.invoices ?? []
      if (invoices.length === 0) {
        throw new Error('Geçerli fatura bulunamadı.')
      }

      // ── Mevcut fatura no ve müşteri bilgilerini çek ───────────
      const [{ data: invData }, { data: custData }] = await Promise.all([
        supabase.from('invoices').select('invoice_number'),
        supabase.from('customers').select('full_name, tax_number'),
      ])
      const existingNos   = new Set((invData ?? []).map((i: any) => i.invoice_number))
      const existingNames = new Set((custData ?? []).map((c: any) => normalizeName(c.full_name)))
      const existingVkns  = new Set(
        (custData ?? []).filter((c: any) => c.tax_number).map((c: any) => c.tax_number!.trim())
      )

      const preview: PdfPreviewRow[] = invoices.map(inv => {
        let rowStatus: PdfRowStatus
        if (inv.hata) {
          rowStatus = 'hata'
        } else if (!inv.fatura_no || existingNos.has(inv.fatura_no)) {
          rowStatus = 'duplicate'
        } else {
          const name = inv.musteri_adi ?? ''
          const vkn  = inv.musteri_vkn ?? ''
          const vknMatch  = vkn  && existingVkns.has(vkn.trim())
          const nameMatch = name && existingNames.has(normalizeName(name))
          rowStatus = (vknMatch || nameMatch) ? 'eklenecek' : 'yeni_musteri'
        }
        return {
          ...inv,
          rowStatus,
          editedName: inv.musteri_adi ?? '',
          expanded: false,
        }
      })

      setPreviewRows(preview)
      setStep('preview')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setStep('upload')
    }
  }

  async function handleImport() {
    setStep('importing')
    setError('')
    try {
      const rowsToSend = previewRows
        .filter(r => r.rowStatus === 'eklenecek' || r.rowStatus === 'yeni_musteri')
        .map(r => ({
          filename:       r.filename,
          fatura_no:      r.fatura_no ?? '',
          fatura_tarihi:  r.fatura_tarihi ?? new Date().toISOString().split('T')[0],
          vade_tarihi:    r.vade_tarihi ?? null,
          senaryo:        r.senaryo ?? null,
          musteri_adi:    r.editedName.trim() || (r.musteri_adi ?? 'Bilinmiyor'),
          musteri_vkn:    r.musteri_vkn ?? null,
          musteri_adresi: r.musteri_adresi ?? null,
          kdv_matrahi:    r.kdv_matrahi ?? null,
          kdv_tutari:     r.kdv_tutari ?? null,
          odenecek_tutar: r.odenecek_tutar ?? null,
          kalemler:       r.kalemler ?? [],
          banka_bilgileri: r.banka_bilgileri ?? [],
        }))

      const res = await fetch('/api/pdf-fatura-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: rowsToSend }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Kayıt hatası')

      const dupCount = previewRows.filter(r => r.rowStatus === 'duplicate' || r.rowStatus === 'hata').length
      setImportResult({ ...data, atilandi: (data.atilandi ?? 0) + dupCount })
      setStep('done')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setStep('preview')
    }
  }

  function toggleExpand(idx: number) {
    setPreviewRows(prev => prev.map((r, i) => i === idx ? { ...r, expanded: !r.expanded } : r))
  }

  function removeRow(idx: number) {
    setPreviewRows(prev => prev.filter((_, i) => i !== idx))
  }

  function resetAll() {
    setStep('upload')
    setPreviewRows([])
    setImportResult(null)
    setError('')
  }

  // ── Adım 1: Upload ────────────────────────────────────────────
  if (step === 'upload') {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-5">
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800 space-y-1">
          <div className="font-semibold">e-Fatura PDF dosyaları otomatik parse edilir.</div>
          <div className="text-blue-600 text-xs">
            Çekilecek bilgiler: Fatura No · Tarih · Vade · Müşteri · VKN · Tutarlar · Kalemler · IBAN
          </div>
        </div>
        <div
          onClick={() => fileRef.current?.click()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
          onDragOver={e => e.preventDefault()}
          className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center cursor-pointer hover:border-[#C8102E] hover:bg-red-50 transition-colors"
        >
          <input ref={fileRef} type="file" accept=".zip,.pdf" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
          <div className="space-y-2">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700">ZIP veya PDF dosyası seçin ya da sürükleyin</p>
            <p className="text-xs text-gray-400">Tek fatura için PDF, çoklu fatura için ZIP</p>
          </div>
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}
      </div>
    )
  }

  // ── Parse ediliyor ────────────────────────────────────────────
  if (step === 'parsing') {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <div className="text-center space-y-4">
          <div className="w-14 h-14 border-4 border-[#C8102E] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-700 font-medium">PDF'ler analiz ediliyor...</p>
          <p className="text-sm text-gray-400">Fatura okunuyor, lütfen bekleyin.</p>
        </div>
      </div>
    )
  }

  // ── Adım 2: Önizleme ──────────────────────────────────────────
  if (step === 'preview') {
    const eklenecek   = previewRows.filter(r => r.rowStatus === 'eklenecek').length
    const yeniMusteri = previewRows.filter(r => r.rowStatus === 'yeni_musteri').length
    const duplicate   = previewRows.filter(r => r.rowStatus === 'duplicate').length
    const hatali      = previewRows.filter(r => r.rowStatus === 'hata').length
    const toplamTutar = previewRows
      .filter(r => r.rowStatus === 'eklenecek' || r.rowStatus === 'yeni_musteri')
      .reduce((s, r) => s + (r.odenecek_tutar ?? 0), 0)

    return (
      <div className="p-6 space-y-4 max-w-6xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={resetAll} className="text-sm text-gray-500 hover:text-gray-700">← Geri</button>
            <span className="text-gray-300">/</span>
            <h2 className="text-base font-semibold text-gray-900">Önizleme ve Onay</h2>
            <span className="text-xs text-gray-400">{previewRows.length} PDF</span>
          </div>
          <button
            onClick={handleImport}
            disabled={eklenecek + yeniMusteri === 0}
            className="bg-[#C8102E] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-[#a50d26] disabled:opacity-40"
          >
            Tümünü İçe Aktar
          </button>
        </div>

        {/* Özet */}
        <div className="grid grid-cols-5 gap-3">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="text-xs text-green-600 font-medium">Müşteri Mevcut</div>
            <div className="text-2xl font-bold text-green-700">{eklenecek}</div>
            <div className="text-xs text-green-600">eklenecek</div>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <div className="text-xs text-yellow-700 font-medium">Yeni Müşteri</div>
            <div className="text-2xl font-bold text-yellow-700">{yeniMusteri}</div>
            <div className="text-xs text-yellow-600">oluşturulacak</div>
          </div>
          <div className="bg-gray-100 border border-gray-200 rounded-lg p-3">
            <div className="text-xs text-gray-500 font-medium">Duplicate</div>
            <div className="text-2xl font-bold text-gray-500">{duplicate}</div>
            <div className="text-xs text-gray-400">atlanacak</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="text-xs text-red-600 font-medium">Parse Hatası</div>
            <div className="text-2xl font-bold text-red-600">{hatali}</div>
            <div className="text-xs text-red-500">manuel kontrol</div>
          </div>
          <div className="bg-white border rounded-lg p-3">
            <div className="text-xs text-gray-500 font-medium">Eklenecek Tutar</div>
            <div className="text-lg font-bold text-gray-900">{fmtAmt(toplamTutar)}</div>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}

        {/* Satır listesi */}
        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase w-28">Durum</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Müşteri Adı</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Fatura No</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Tarih</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Kalem</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Tutar</th>
                <th className="px-4 py-3 w-8" />
                <th className="px-4 py-3 w-8" />
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, idx) => {
                const isDup  = row.rowStatus === 'duplicate'
                const isYeni = row.rowStatus === 'yeni_musteri'
                const isHata = row.rowStatus === 'hata'

                const rowBg = isDup  ? 'bg-gray-50 opacity-60'
                  : isYeni ? 'bg-yellow-50'
                  : isHata ? 'bg-red-50'
                  : 'bg-white'

                const badge = isDup
                  ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600">Atlanacak</span>
                  : isYeni
                  ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">Yeni Müşteri</span>
                  : isHata
                  ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">Parse Hatası</span>
                  : <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">Eklenecek</span>

                return (
                  <React.Fragment key={idx}>
                    <tr className={`${rowBg} border-t`}>
                      <td className="px-4 py-2.5">{badge}</td>
                      <td className="px-4 py-2.5">
                        {isYeni ? (
                          <input
                            value={row.editedName}
                            onChange={e => setPreviewRows(prev => prev.map((r, i) => i === idx ? { ...r, editedName: e.target.value } : r))}
                            className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                          />
                        ) : (
                          <span className="text-gray-900 font-medium">{row.musteri_adi || <span className="text-gray-400 italic">Bilinmiyor</span>}</span>
                        )}
                        {row.musteri_vkn && (
                          <div className="text-xs text-gray-400 font-mono">{row.musteri_vkn}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-700">
                        {row.fatura_no ?? <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap text-xs">
                        <div>{row.fatura_tarihi ?? '—'}</div>
                        {row.vade_tarihi && (
                          <div className="text-gray-400">vade: {row.vade_tarihi}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-600">
                        {isHata ? <span className="text-red-500 text-xs">{row.hata?.slice(0, 40)}</span> : (row.kalemler?.length ?? 0)}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-semibold ${isDup ? 'text-gray-400' : 'text-gray-900'}`}>
                        {fmtAmt(row.odenecek_tutar)}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {!isHata && (row.kalemler?.length ?? 0) > 0 && (
                          <button
                            onClick={() => toggleExpand(idx)}
                            className="text-gray-400 hover:text-gray-600 text-xs"
                            title="Kalemleri göster"
                          >
                            {row.expanded ? '▲' : '▼'}
                          </button>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        <button
                          onClick={() => removeRow(idx)}
                          className="text-gray-300 hover:text-red-500 transition-colors text-base leading-none"
                          title="Listeden kaldır"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                    {row.expanded && (row.kalemler?.length ?? 0) > 0 && (
                      <tr className={`${rowBg} border-t border-dashed`}>
                        <td colSpan={8} className="px-6 pb-3 pt-1">
                          <div className="bg-white border rounded-lg overflow-hidden">
                            <table className="w-full text-xs">
                              <thead className="bg-gray-50 border-b">
                                <tr>
                                  <th className="text-left px-3 py-2 text-gray-500">#</th>
                                  <th className="text-left px-3 py-2 text-gray-500">Ürün / Hizmet</th>
                                  <th className="text-right px-3 py-2 text-gray-500">Miktar</th>
                                  <th className="text-left px-3 py-2 text-gray-500">Birim</th>
                                  <th className="text-right px-3 py-2 text-gray-500">Birim Fiyat</th>
                                  <th className="text-right px-3 py-2 text-gray-500">İskonto</th>
                                  <th className="text-right px-3 py-2 text-gray-500">KDV %</th>
                                  <th className="text-right px-3 py-2 text-gray-500">KDV Tutarı</th>
                                  <th className="text-right px-3 py-2 text-gray-500">Satır Toplam</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {(row.kalemler ?? []).map((k, ki) => (
                                  <tr key={ki} className="hover:bg-gray-50">
                                    <td className="px-3 py-1.5 text-gray-400">{ki + 1}</td>
                                    <td className="px-3 py-1.5 text-gray-800">{k.urun_adi}</td>
                                    <td className="px-3 py-1.5 text-right text-gray-700">{k.miktar}</td>
                                    <td className="px-3 py-1.5 text-gray-500">{k.birim}</td>
                                    <td className="px-3 py-1.5 text-right text-gray-700">{fmtAmt(k.birim_fiyat)}</td>
                                    <td className="px-3 py-1.5 text-right text-orange-600">
                                      {k.iskonto_tutari > 0
                                        ? `${k.iskonto_orani > 0 ? `%${k.iskonto_orani} ` : ''}${fmtAmt(k.iskonto_tutari)}`
                                        : <span className="text-gray-300">—</span>}
                                    </td>
                                    <td className="px-3 py-1.5 text-right text-gray-600">%{k.kdv_orani}</td>
                                    <td className="px-3 py-1.5 text-right text-gray-600">{fmtAmt(k.kdv_tutari)}</td>
                                    <td className="px-3 py-1.5 text-right font-medium text-gray-900">{fmtAmt(k.satir_toplam)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex gap-3 pb-4">
          <button
            onClick={handleImport}
            disabled={eklenecek + yeniMusteri === 0}
            className="flex-1 bg-[#C8102E] text-white py-3 rounded-lg font-semibold hover:bg-[#a50d26] disabled:opacity-40"
          >
            İçe Aktar ({eklenecek + yeniMusteri} fatura)
          </button>
          <button onClick={resetAll} className="px-8 py-3 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            İptal
          </button>
        </div>
      </div>
    )
  }

  // ── Kaydediliyor ──────────────────────────────────────────────
  if (step === 'importing') {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <div className="text-center space-y-4">
          <div className="w-14 h-14 border-4 border-[#C8102E] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-700 font-medium">Faturalar kaydediliyor...</p>
          <p className="text-sm text-gray-400">Lütfen bekleyin, sayfayı kapatmayın.</p>
        </div>
      </div>
    )
  }

  // ── Adım 3: Sonuç ────────────────────────────────────────────
  if (step === 'done' && importResult) {
    const { eklendi, atilandi, yeniMusteri, toplamCihaz, results } = importResult
    const eklenenler = results.filter(r => r.status === 'eklendi')
    const hatalılar  = results.filter(r => r.status === 'hata')
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-5">
        <h2 className="text-base font-semibold text-gray-900">İçe Aktarma Sonucu</h2>
        <div className="grid grid-cols-5 gap-3">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-green-700">{eklendi}</div>
            <div className="text-xs text-green-600 mt-1 font-medium">Fatura Eklendi</div>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-orange-700">{toplamCihaz ?? 0}</div>
            <div className="text-xs text-orange-600 mt-1 font-medium">Cihaz Eklendi</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-blue-700">{yeniMusteri}</div>
            <div className="text-xs text-blue-600 mt-1 font-medium">Yeni Müşteri</div>
          </div>
          <div className="bg-gray-100 border border-gray-200 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-gray-500">{atilandi}</div>
            <div className="text-xs text-gray-500 mt-1 font-medium">Atlandı</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{hatalılar.length}</div>
            <div className="text-xs text-red-500 mt-1 font-medium">Hatalı</div>
          </div>
        </div>

        {eklenenler.length > 0 && (
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b">
              <h3 className="text-sm font-semibold text-gray-900">Eklenen Faturalar</h3>
            </div>
            <div className="divide-y max-h-64 overflow-y-auto">
              {eklenenler.map((r, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <span className="text-sm font-medium text-gray-900">{r.musteri_adi}</span>
                    {r.musteri_yeni && (
                      <span className="ml-2 text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">Yeni Müşteri</span>
                    )}
                    <div className="text-xs text-gray-400 font-mono">{r.fatura_no}</div>
                  </div>
                  <div className="flex gap-2">
                    {r.invoice_id && (
                      <Link href={`/cari-hesap/faturalar/${r.invoice_id}`} className="text-xs text-[#C8102E] hover:underline font-medium">
                        Fatura →
                      </Link>
                    )}
                    {r.customer_id && (
                      <Link href={`/customers/${r.customer_id}`} className="text-xs text-gray-400 hover:text-gray-700">
                        Müşteri →
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {hatalılar.length > 0 && (
          <div className="bg-white border border-red-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-red-50 border-b border-red-200">
              <h3 className="text-sm font-semibold text-red-800">Hatalı Kayıtlar</h3>
            </div>
            <div className="divide-y max-h-40 overflow-y-auto">
              {hatalılar.map((r, i) => (
                <div key={i} className="px-4 py-2.5">
                  <div className="text-sm text-red-700 font-mono">{r.fatura_no || r.filename}</div>
                  <div className="text-xs text-red-500">{r.error}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <Link href="/cari-hesap/faturalar"
            className="flex-1 bg-[#C8102E] text-white py-3 rounded-lg font-semibold hover:bg-[#a50d26] text-center">
            Faturalara Git
          </Link>
          <button onClick={resetAll} className="px-8 py-3 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Yeni Import
          </button>
        </div>
      </div>
    )
  }

  return null
}

// ════════════════════════════════════════════════════════
//  GELEN FATURA PDF IMPORT
// ════════════════════════════════════════════════════════

const GIDER_KATEGORILERI = [
  'Yiyecek & İçecek',
  'Gaz & Dolum Malzemesi',
  'Yangın Tüpü Parça & Malzeme',
  'Hammadde & Sanayi Malzemesi',
  'Genel Gider',
]

type GelenPdfItem = {
  urun_adi: string
  miktar: number
  birim: string
  birim_fiyat: number
  iskonto_orani: number
  iskonto_tutari: number
  kdv_orani: number
  kdv_tutari: number
  satir_toplam: number
}

type GelenParsedInvoice = {
  filename: string
  fatura_no: string | null
  fatura_tarihi: string | null
  vade_tarihi: string | null
  senaryo: string | null
  satici_adi: string | null
  satici_vkn: string | null
  kdv_matrahi: number | null
  kdv_tutari: number | null
  odenecek_tutar: number | null
  kalemler: GelenPdfItem[]
  banka_bilgileri: Array<{ iban: string; banka_adi?: string | null }>
  gider_kategorisi: string
  bakiye_notu: string | null
  hata?: string | null
}

type GelenPdfRowStatus = 'eklenecek' | 'yeni_tedarikci' | 'duplicate' | 'manuel_kategori' | 'hata'

type GelenPdfPreviewRow = GelenParsedInvoice & {
  rowStatus: GelenPdfRowStatus
  editedName: string
  editedKategori: string
  expanded: boolean
}

type GelenPdfStep = 'upload' | 'parsing' | 'preview' | 'importing' | 'done'

type GelenPdfImportResult = {
  eklendi: number
  atilandi: number
  yeniTedarikci: number
  kategoriOzet: Record<string, number>
  results: Array<{
    filename: string
    fatura_no: string
    satici_adi: string
    status: 'eklendi' | 'atilandi' | 'hata'
    invoice_id?: string
    tedarikci_yeni: boolean
    gider_kategorisi: string
    error?: string
  }>
}

function GelenPdfFaturaImport() {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<GelenPdfStep>('upload')
  const [error, setError] = useState('')
  const [previewRows, setPreviewRows] = useState<GelenPdfPreviewRow[]>([])
  const [importResult, setImportResult] = useState<GelenPdfImportResult | null>(null)

  async function handleFile(file: File) {
    const lowerName = file.name.toLowerCase()
    if (!lowerName.endsWith('.zip') && !lowerName.endsWith('.pdf')) {
      setError('Yalnızca PDF veya ZIP dosyası yükleyebilirsiniz.')
      return
    }
    setStep('parsing')
    setError('')

    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/gelen-pdf-parse', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Parse hatası')

      const invoices: GelenParsedInvoice[] = data.invoices ?? []
      if (invoices.length === 0) throw new Error('Geçerli fatura bulunamadı.')

      // Mevcut alis fatura no ve tedarikçi bilgileri
      const [{ data: invData }, { data: supData }] = await Promise.all([
        supabase.from('invoices').select('invoice_number').eq('invoice_type', 'alis'),
        supabase.from('invoices').select('supplier_name, supplier_tax_no').eq('invoice_type', 'alis').not('supplier_name', 'is', null),
      ])
      const existingNos   = new Set((invData ?? []).map((i: any) => i.invoice_number))
      const existingNames = new Set((supData ?? []).map((s: any) => normalizeName(s.supplier_name ?? '')))
      const existingTaxNos = new Set(
        (supData ?? []).filter((s: any) => s.supplier_tax_no).map((s: any) => (s.supplier_tax_no as string).trim())
      )

      const preview: GelenPdfPreviewRow[] = invoices.map(inv => {
        let rowStatus: GelenPdfRowStatus
        if (inv.hata) {
          rowStatus = 'hata'
        } else if (inv.fatura_no && existingNos.has(inv.fatura_no)) {
          rowStatus = 'duplicate'
        } else {
          const name    = inv.satici_adi ?? ''
          const taxNo   = inv.satici_vkn ?? ''
          const taxMatch  = !!taxNo  && existingTaxNos.has(taxNo.trim())
          const nameMatch = !!name   && existingNames.has(normalizeName(name))
          const isYeni    = !taxMatch && !nameMatch
          // Yeni tedarikçi ise sarı; mevcut tedarikçi ve kategori bilinmiyorsa turuncu; diğerleri yeşil
          if (isYeni) {
            rowStatus = 'yeni_tedarikci'
          } else if (inv.gider_kategorisi === 'Genel Gider') {
            rowStatus = 'manuel_kategori'
          } else {
            rowStatus = 'eklenecek'
          }
        }
        return {
          ...inv,
          rowStatus,
          editedName: inv.satici_adi ?? '',
          editedKategori: inv.gider_kategorisi ?? 'Genel Gider',
          expanded: false,
        }
      })

      setPreviewRows(preview)
      setStep('preview')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setStep('upload')
    }
  }

  async function handleImport() {
    setStep('importing')
    setError('')
    try {
      const rowsToSend = previewRows
        .filter(r => r.rowStatus !== 'duplicate' && r.rowStatus !== 'hata')
        .map(r => ({
          filename:        r.filename,
          fatura_no:       r.fatura_no ?? '',
          fatura_tarihi:   r.fatura_tarihi ?? new Date().toISOString().split('T')[0],
          vade_tarihi:     r.vade_tarihi ?? null,
          senaryo:         r.senaryo ?? null,
          satici_adi:      r.editedName.trim() || (r.satici_adi ?? 'Bilinmiyor'),
          satici_vkn:      r.satici_vkn ?? null,
          kdv_matrahi:     r.kdv_matrahi ?? null,
          kdv_tutari:      r.kdv_tutari ?? null,
          odenecek_tutar:  r.odenecek_tutar ?? null,
          kalemler:        r.kalemler ?? [],
          banka_bilgileri: r.banka_bilgileri ?? [],
          gider_kategorisi: r.editedKategori,
          bakiye_notu:     r.bakiye_notu ?? null,
        }))

      const res = await fetch('/api/gelen-pdf-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: rowsToSend }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Kayıt hatası')

      const dupCount = previewRows.filter(r => r.rowStatus === 'duplicate' || r.rowStatus === 'hata').length
      setImportResult({ ...data, atilandi: (data.atilandi ?? 0) + dupCount })
      setStep('done')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      setStep('preview')
    }
  }

  function toggleExpand(idx: number) {
    setPreviewRows(prev => prev.map((r, i) => i === idx ? { ...r, expanded: !r.expanded } : r))
  }

  function removeRow(idx: number) {
    setPreviewRows(prev => prev.filter((_, i) => i !== idx))
  }

  function resetAll() {
    setStep('upload')
    setPreviewRows([])
    setImportResult(null)
    setError('')
  }

  // ── Upload ────────────────────────────────────────────
  if (step === 'upload') {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-5">
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800 space-y-1">
          <div className="font-semibold">Tedarikçi PDF faturaları yükleyin.</div>
          <div className="text-blue-600 text-xs">
            Çekilecek bilgiler: Satıcı · VKN · Fatura No · Tarih · Vade · Tutarlar · Kalemler · IBAN · Bakiye Notu
          </div>
          <div className="text-blue-600 text-xs">
            Desteklenen formatlar: Migros, Erkarpaş, Hidropres, Semihler ve diğer e-fatura yazılımları
          </div>
        </div>
        <div
          onClick={() => fileRef.current?.click()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
          onDragOver={e => e.preventDefault()}
          className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center cursor-pointer hover:border-[#C8102E] hover:bg-red-50 transition-colors"
        >
          <input ref={fileRef} type="file" accept=".zip,.pdf" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
          <div className="space-y-2">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700">ZIP veya PDF dosyası seçin ya da sürükleyin</p>
            <p className="text-xs text-gray-400">Tek fatura için PDF, çoklu fatura için ZIP</p>
          </div>
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}
      </div>
    )
  }

  // ── Parse ediliyor ────────────────────────────────────
  if (step === 'parsing') {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <div className="text-center space-y-4">
          <div className="w-14 h-14 border-4 border-[#C8102E] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-700 font-medium">Gelen fatura PDF'leri analiz ediliyor...</p>
          <p className="text-sm text-gray-400">Satıcı bilgileri ve ürün kalemleri çıkarılıyor.</p>
        </div>
      </div>
    )
  }

  // ── Önizleme ──────────────────────────────────────────
  if (step === 'preview') {
    const eklenecek    = previewRows.filter(r => r.rowStatus === 'eklenecek').length
    const yeniTed      = previewRows.filter(r => r.rowStatus === 'yeni_tedarikci').length
    const duplicate    = previewRows.filter(r => r.rowStatus === 'duplicate').length
    const manuelKat    = previewRows.filter(r => r.rowStatus === 'manuel_kategori').length
    const hatali       = previewRows.filter(r => r.rowStatus === 'hata').length
    const toplamTutar  = previewRows
      .filter(r => r.rowStatus !== 'duplicate' && r.rowStatus !== 'hata')
      .reduce((s, r) => s + (r.odenecek_tutar ?? 0), 0)

    return (
      <div className="p-6 space-y-4 max-w-6xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={resetAll} className="text-sm text-gray-500 hover:text-gray-700">← Geri</button>
            <span className="text-gray-300">/</span>
            <h2 className="text-base font-semibold text-gray-900">Önizleme</h2>
            <span className="text-xs text-gray-400">{previewRows.length} PDF</span>
          </div>
          <button
            onClick={handleImport}
            disabled={eklenecek + yeniTed + manuelKat === 0}
            className="bg-[#C8102E] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-[#a50d26] disabled:opacity-40"
          >
            Tümünü İçe Aktar
          </button>
        </div>

        <div className="grid grid-cols-6 gap-2">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="text-xs text-green-600 font-medium">Tedarikçi Mevcut</div>
            <div className="text-2xl font-bold text-green-700">{eklenecek}</div>
            <div className="text-xs text-green-600">eklenecek</div>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <div className="text-xs text-yellow-700 font-medium">Yeni Tedarikçi</div>
            <div className="text-2xl font-bold text-yellow-700">{yeniTed}</div>
            <div className="text-xs text-yellow-600">oluşturulacak</div>
          </div>
          <div className="bg-gray-100 border border-gray-200 rounded-lg p-3">
            <div className="text-xs text-gray-500 font-medium">Duplicate</div>
            <div className="text-2xl font-bold text-gray-500">{duplicate}</div>
            <div className="text-xs text-gray-400">atlanacak</div>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
            <div className="text-xs text-orange-600 font-medium">Manuel Kategori</div>
            <div className="text-2xl font-bold text-orange-600">{manuelKat}</div>
            <div className="text-xs text-orange-500">seçim gerekli</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="text-xs text-red-600 font-medium">Parse Hatası</div>
            <div className="text-2xl font-bold text-red-600">{hatali}</div>
            <div className="text-xs text-red-500">manuel kontrol</div>
          </div>
          <div className="bg-white border rounded-lg p-3">
            <div className="text-xs text-gray-500 font-medium">Toplam Tutar</div>
            <div className="text-lg font-bold text-gray-900">{fmtAmt(toplamTutar)}</div>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}

        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase w-32">Durum</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Tedarikçi</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Fatura No</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Tarih / Vade</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Kategori</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Kalem</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Tutar</th>
                <th className="px-4 py-3 w-8" />
                <th className="px-4 py-3 w-8" />
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, idx) => {
                const isDup     = row.rowStatus === 'duplicate'
                const isYeni    = row.rowStatus === 'yeni_tedarikci'
                const isHata    = row.rowStatus === 'hata'
                const isManuel  = row.rowStatus === 'manuel_kategori'

                const rowBg = isDup    ? 'bg-gray-50 opacity-60'
                  : isYeni   ? 'bg-yellow-50'
                  : isHata   ? 'bg-red-50'
                  : isManuel ? 'bg-orange-50'
                  : 'bg-white'

                const badge = isDup
                  ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600">Atlanacak</span>
                  : isYeni
                  ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">Yeni Tedarikçi</span>
                  : isHata
                  ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">Parse Hatası</span>
                  : isManuel
                  ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200">Manuel Kategori</span>
                  : <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">Eklenecek</span>

                return (
                  <React.Fragment key={idx}>
                    <tr className={`${rowBg} border-t`}>
                      <td className="px-4 py-2.5">{badge}</td>
                      <td className="px-4 py-2.5">
                        {(isYeni || isManuel) && !isDup && !isHata ? (
                          <input
                            value={row.editedName}
                            onChange={e => setPreviewRows(prev => prev.map((r, i) => i === idx ? { ...r, editedName: e.target.value } : r))}
                            className="w-full border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                          />
                        ) : (
                          <span className="text-gray-900 font-medium">{row.satici_adi || <span className="text-gray-400 italic">Bilinmiyor</span>}</span>
                        )}
                        {row.satici_vkn && (
                          <div className="text-xs text-gray-400 font-mono">{row.satici_vkn}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-700">
                        {row.fatura_no ?? <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap text-xs">
                        <div>{row.fatura_tarihi ?? '—'}</div>
                        {row.vade_tarihi && (
                          <div className="text-orange-500">vade: {row.vade_tarihi}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {!isHata && !isDup ? (
                          <select
                            value={row.editedKategori}
                            onChange={e => setPreviewRows(prev => prev.map((r, i) => {
                              if (i !== idx) return r
                              const newKat = e.target.value
                              let newStatus = r.rowStatus
                              // Eğer 'manuel_kategori' iken Genel Gider dışı bir şey seçilirse → 'eklenecek'
                              if (r.rowStatus === 'manuel_kategori' && newKat !== 'Genel Gider') {
                                newStatus = 'eklenecek'
                              }
                              // Eğer 'eklenecek' iken Genel Gider seçilirse → 'manuel_kategori'
                              if (r.rowStatus === 'eklenecek' && newKat === 'Genel Gider') {
                                newStatus = 'manuel_kategori'
                              }
                              return { ...r, editedKategori: newKat, rowStatus: newStatus }
                            }))}
                            className="text-xs border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#C8102E] bg-white"
                          >
                            {GIDER_KATEGORILERI.map(k => (
                              <option key={k} value={k}>{k}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-600">
                        {isHata ? (
                          <span className="text-red-500 text-xs">{row.hata?.slice(0, 30)}</span>
                        ) : (
                          row.kalemler?.length ?? 0
                        )}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-semibold ${isDup ? 'text-gray-400' : 'text-gray-900'}`}>
                        {fmtAmt(row.odenecek_tutar)}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {!isHata && (row.kalemler?.length ?? 0) > 0 && (
                          <button
                            onClick={() => toggleExpand(idx)}
                            className="text-gray-400 hover:text-gray-600 text-xs"
                            title="Kalemleri göster"
                          >
                            {row.expanded ? '▲' : '▼'}
                          </button>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        <button
                          onClick={() => removeRow(idx)}
                          className="text-gray-300 hover:text-red-500 transition-colors text-base leading-none"
                          title="Listeden kaldır"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                    {row.expanded && (row.kalemler?.length ?? 0) > 0 && (
                      <tr key={`${idx}-items`} className={`${rowBg} border-t border-dashed`}>
                        <td colSpan={9} className="px-6 pb-3 pt-1">
                          {row.bakiye_notu && (
                            <div className="mb-2 text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded px-3 py-1.5">
                              {row.bakiye_notu}
                            </div>
                          )}
                          {(row.banka_bilgileri ?? []).length > 0 && (
                            <div className="mb-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-3 py-1.5">
                              IBAN: {row.banka_bilgileri.map(b => b.banka_adi ? `${b.banka_adi}: ${b.iban}` : b.iban).join(' | ')}
                            </div>
                          )}
                          <div className="bg-white border rounded-lg overflow-hidden">
                            <table className="w-full text-xs">
                              <thead className="bg-gray-50 border-b">
                                <tr>
                                  <th className="text-left px-3 py-2 text-gray-500">#</th>
                                  <th className="text-left px-3 py-2 text-gray-500">Ürün / Hizmet</th>
                                  <th className="text-right px-3 py-2 text-gray-500">Miktar</th>
                                  <th className="text-left px-3 py-2 text-gray-500">Birim</th>
                                  <th className="text-right px-3 py-2 text-gray-500">Birim Fiyat</th>
                                  <th className="text-right px-3 py-2 text-gray-500">KDV %</th>
                                  <th className="text-right px-3 py-2 text-gray-500">Satır Toplam</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {(row.kalemler ?? []).map((k, ki) => (
                                  <tr key={ki} className="hover:bg-gray-50">
                                    <td className="px-3 py-1.5 text-gray-400">{ki + 1}</td>
                                    <td className="px-3 py-1.5 text-gray-800">{k.urun_adi}</td>
                                    <td className="px-3 py-1.5 text-right text-gray-700">{k.miktar}</td>
                                    <td className="px-3 py-1.5 text-gray-500">{k.birim}</td>
                                    <td className="px-3 py-1.5 text-right text-gray-700">{fmtAmt(k.birim_fiyat)}</td>
                                    <td className="px-3 py-1.5 text-right text-gray-600">%{k.kdv_orani}</td>
                                    <td className="px-3 py-1.5 text-right font-medium text-gray-900">{fmtAmt(k.satir_toplam)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex gap-3 pb-4">
          <button
            onClick={handleImport}
            disabled={eklenecek + yeniTed + manuelKat === 0}
            className="flex-1 bg-[#C8102E] text-white py-3 rounded-lg font-semibold hover:bg-[#a50d26] disabled:opacity-40"
          >
            İçe Aktar ({eklenecek + yeniTed + manuelKat} fatura)
          </button>
          <button onClick={resetAll} className="px-8 py-3 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            İptal
          </button>
        </div>
      </div>
    )
  }

  // ── Kaydediliyor ──────────────────────────────────────
  if (step === 'importing') {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <div className="text-center space-y-4">
          <div className="w-14 h-14 border-4 border-[#C8102E] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-700 font-medium">Gelen faturalar kaydediliyor...</p>
          <p className="text-sm text-gray-400">Lütfen bekleyin, sayfayı kapatmayın.</p>
        </div>
      </div>
    )
  }

  // ── Sonuç ─────────────────────────────────────────────
  if (step === 'done' && importResult) {
    const { eklendi, atilandi, yeniTedarikci, kategoriOzet, results } = importResult
    const eklenenler = results.filter(r => r.status === 'eklendi')
    const hatalılar  = results.filter(r => r.status === 'hata')
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-5">
        <h2 className="text-base font-semibold text-gray-900">İçe Aktarma Sonucu</h2>
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-green-700">{eklendi}</div>
            <div className="text-xs text-green-600 mt-1 font-medium">Fatura Eklendi</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-blue-700">{yeniTedarikci}</div>
            <div className="text-xs text-blue-600 mt-1 font-medium">Yeni Tedarikçi</div>
          </div>
          <div className="bg-gray-100 border border-gray-200 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-gray-500">{atilandi}</div>
            <div className="text-xs text-gray-500 mt-1 font-medium">Atlandı</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{hatalılar.length}</div>
            <div className="text-xs text-red-500 mt-1 font-medium">Hatalı</div>
          </div>
        </div>

        {Object.keys(kategoriOzet ?? {}).length > 0 && (
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b">
              <h3 className="text-sm font-semibold text-gray-900">Kategoriye Göre Gider</h3>
            </div>
            <div className="divide-y">
              {Object.entries(kategoriOzet).map(([kat, sayi]) => (
                <div key={kat} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm text-gray-700">{kat}</span>
                  <span className="text-sm font-semibold text-gray-900">{sayi} fatura</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {eklenenler.length > 0 && (
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b">
              <h3 className="text-sm font-semibold text-gray-900">Eklenen Faturalar</h3>
            </div>
            <div className="divide-y max-h-52 overflow-y-auto">
              {eklenenler.map((r, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <span className="text-sm font-medium text-gray-900">{r.satici_adi}</span>
                    {r.tedarikci_yeni && (
                      <span className="ml-2 text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">Yeni Tedarikçi</span>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-400 font-mono">{r.fatura_no}</span>
                      <span className="text-xs text-gray-400">·</span>
                      <span className="text-xs text-gray-500">{r.gider_kategorisi}</span>
                    </div>
                  </div>
                  {r.invoice_id && (
                    <Link href={`/cari-hesap/faturalar/${r.invoice_id}`}
                      className="text-xs text-[#C8102E] hover:underline font-medium">
                      Fatura →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {hatalılar.length > 0 && (
          <div className="bg-white border border-red-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-red-50 border-b border-red-200">
              <h3 className="text-sm font-semibold text-red-800">Hatalı Kayıtlar</h3>
            </div>
            <div className="divide-y max-h-32 overflow-y-auto">
              {hatalılar.map((r, i) => (
                <div key={i} className="px-4 py-2.5">
                  <div className="text-sm text-red-700 font-mono">{r.fatura_no || r.filename}</div>
                  <div className="text-xs text-red-500">{r.error}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <Link href="/cari-hesap/gelen-faturalar"
            className="flex-1 bg-[#C8102E] text-white py-3 rounded-lg font-semibold hover:bg-[#a50d26] text-center">
            Gelen Faturalara Git
          </Link>
          <Link href="/cari-hesap/gider-raporu"
            className="px-6 py-3 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 text-center">
            Gider Raporu
          </Link>
          <button onClick={resetAll} className="px-6 py-3 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Yeni Import
          </button>
        </div>
      </div>
    )
  }

  return null
}

// ════════════════════════════════════════════════════════
//  ANA SAYFA
// ════════════════════════════════════════════════════════

function TabContent() {
  const searchParams = useSearchParams()
  const rawTab = searchParams.get('tab')
  const initialTab: 'pdf' | 'gelen-pdf' = rawTab === 'gelen-pdf' ? 'gelen-pdf' : 'pdf'
  const [activeTab, setActiveTab] = useState<'pdf' | 'gelen-pdf'>(initialTab)

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b px-6 flex-shrink-0">
        <nav className="flex gap-1 -mb-px">
          {[
            { id: 'pdf',       label: 'Giden Fatura Yükle' },
            { id: 'gelen-pdf', label: 'Gelen Fatura Yükle' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as 'pdf' | 'gelen-pdf')}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-[#C8102E] text-[#C8102E]'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      {activeTab === 'pdf' ? <PdfFaturaImport /> : <GelenPdfFaturaImport />}
    </div>
  )
}

export default function EFaturaImportPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-sm text-gray-400">Yükleniyor...</div>}>
      <TabContent />
    </Suspense>
  )
}
