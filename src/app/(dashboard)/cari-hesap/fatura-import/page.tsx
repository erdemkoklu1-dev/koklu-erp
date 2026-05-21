'use client'
import React, { useState, useRef, useEffect, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { formatCurrency } from '@/lib/finance/formatters'
import { useSearchParams } from 'next/navigation'
import { detectBranch } from '@/lib/invoice-ai-parser'
import { matchExistingSupplier, normalizeSupplierName, normalizeSupplierTaxNo, type SupplierMatchMethod } from '@/lib/gelen-fatura-supplier-matching'
import { isOwnCompanySupplierName } from '@/lib/gelen-fatura-parser-v2/supplierClassifier'

// ---- Yardımcı fonksiyonlar ----

function normalizeName(name: string): string {
  return name
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ıİ]/g, 'i')
    .replace(/[şŞ]/g, 's')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u')
    .replace(/[öÖ]/g, 'o')
    .replace(/[çÇ]/g, 'c')
    .replace(/\b(limited|ltd|sti|stı|sirketi|anonim|as|a s|sanayi|san|ticaret|tic|pazarlama|paz|ithalat|ihracat|insaat|ins|ve|co|corp)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeLooseName(name: string): string {
  return normalizeName(name).replace(/\b\w\b/g, '').replace(/\s+/g, ' ').trim()
}

function normNo(s: string | null | undefined): string {
  return (s ?? '').replace(/\s/g, '').toUpperCase()
}

function normalizeInvoiceNo(value: string | null | undefined): string {
  return (value ?? '').toLocaleUpperCase('tr-TR').replace(/[^A-Z0-9]/g, '')
}

function normVkn(v: string | null | undefined): string {
  return (v ?? '').replace(/\D/g, '')
}

function amountsClose(a: number | null | undefined, b: number | null | undefined): boolean {
  if (a == null || b == null) return false
  return Math.abs(Number(a) - Number(b)) < 0.01
}

function namesStronglySimilar(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeSupplierName(a)
  const nb = normalizeSupplierName(b)
  if (!na || !nb) return false
  if (na === nb) return true
  return na.length >= 8 && nb.length >= 8 && (na.includes(nb) || nb.includes(na))
}

function namesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeName(a ?? '')
  const nb = normalizeName(b ?? '')
  if (!na || !nb) return false
  if (na === nb) return true
  const la = normalizeLooseName(na)
  const lb = normalizeLooseName(nb)
  if (!la || !lb) return false
  if (la === lb) return true
  return la.length >= 8 && lb.length >= 8 && (la.includes(lb) || lb.includes(la))
}

function findByName<T extends { full_name?: string | null; supplier_name?: string | null }>(
  rows: T[],
  name: string | null | undefined
): T | undefined {
  return rows.find(r => namesMatch(r.full_name ?? r.supplier_name, name))
}

type Sube = { id: string; ad: string }

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
  musteri_il?: string | null
  mal_hizmet_toplami: number | null
  kdv_matrahi: number | null
  kdv_tutari: number | null
  vergiler_dahil_toplam: number | null
  odenecek_tutar: number | null
  kalemler: PdfInvoiceItem[]
  banka_bilgileri: Array<{ iban: string; banka_adi?: string | null }>
  hata?: string | null
  parse_durumu?: 'temiz_parse' | 'manuel_kontrol_gerekli' | 'parse_hatasi'
  parse_uyarilari?: string[]
}

type PdfRowStatus = 'eklenecek' | 'yeni_musteri' | 'duplicate' | 'hata'

type PdfPreviewRow = ParsedInvoice & {
  rowStatus: PdfRowStatus
  editedName: string
  editedVkn: string
  editedFaturaNo: string
  editedTarih: string
  editedVade: string
  editedTutar: string
  sube_id: string | null
  expanded: boolean
}

function calcItemsSubtotal(items: PdfInvoiceItem[]): number {
  return Math.round(items.reduce((sum, item) => {
    const line = Number(item.satir_toplam)
    if (Number.isFinite(line) && line > 0) return sum + line
    return sum + (Number(item.miktar) || 0) * (Number(item.birim_fiyat) || 0)
  }, 0) * 100) / 100
}

function makeEmptyItem(idx: number): PdfInvoiceItem {
  return {
    urun_adi: `Kalem ${idx}`,
    miktar: 1,
    birim: 'adet',
    birim_fiyat: 0,
    iskonto_orani: 0,
    iskonto_tutari: 0,
    kdv_orani: 20,
    kdv_tutari: 0,
    satir_toplam: 0,
  }
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

// ── Ürün Autocomplete ───────────────────────────────────────────
type UrunSuggestion = {
  id: string
  ad: string
  kdv_haric_fiyat: number | null
  birim: string | null
}

function UrunAutocomplete({
  value,
  onChange,
  onSelect,
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  onSelect: (u: UrunSuggestion) => void
  className?: string
}) {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<UrunSuggestion[]>([])
  const [dropStyle, setDropStyle] = useState<React.CSSProperties>({})
  const inputRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        inputRef.current && !inputRef.current.contains(e.target as Node) &&
        dropRef.current && !dropRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function calcPos() {
    if (!inputRef.current) return
    const r = inputRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom
    const up = spaceBelow < 220 && r.top > 220
    setDropStyle(up
      ? { position: 'fixed', bottom: window.innerHeight - r.top + 2, left: r.left, width: r.width, zIndex: 9999 }
      : { position: 'fixed', top: r.bottom + 2, left: r.left, width: r.width, zIndex: 9999 }
    )
  }

  function handleChange(v: string) {
    onChange(v)
    clearTimeout(timer.current)
    if (!v.trim()) { setSuggestions([]); setOpen(false); return }
    timer.current = setTimeout(async () => {
      const { data } = await supabase
        .from('urunler')
        .select('id, ad, kdv_haric_fiyat, birim')
        .eq('aktif', true)
        .ilike('ad', `%${v}%`)
        .limit(8)
      setSuggestions(data ?? [])
      calcPos()
      setOpen(true)
    }, 220)
  }

  return (
    <>
      <input
        ref={inputRef}
        value={value}
        onChange={e => handleChange(e.target.value)}
        onFocus={() => { if (suggestions.length > 0) { calcPos(); setOpen(true) } }}
        className={className}
        autoComplete="off"
      />
      {open && (
        <div
          ref={dropRef}
          style={dropStyle}
          className="bg-white dark:bg-gray-800 border rounded-lg shadow-xl max-h-52 overflow-y-auto"
        >
          {suggestions.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">Sonuç bulunamadı, manuel giriş yapabilirsiniz</div>
          ) : (
            suggestions.map(u => (
              <button
                key={u.id}
                type="button"
                onMouseDown={e => { e.preventDefault(); onSelect(u); setOpen(false) }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 flex justify-between gap-2"
              >
                <span className="truncate">{u.ad}</span>
                {u.kdv_haric_fiyat != null && (
                  <span className="text-gray-400 whitespace-nowrap shrink-0">
                    {u.kdv_haric_fiyat.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </>
  )
}

// ── Edit Modal ─────────────────────────────────────────────────
function PdfEditModal({
  row,
  rowIdx,
  subeler,
  customers,
  onSave,
  onClose,
}: {
  row: PdfPreviewRow
  rowIdx: number
  subeler: Sube[]
  customers: { id: string; full_name: string; tax_number: string | null; address?: string | null }[]
  onSave: (idx: number, updated: Partial<PdfPreviewRow>) => void
  onClose: () => void
}) {
  const [name, setName]       = useState(row.editedName)
  const [vkn, setVkn]         = useState(row.editedVkn)
  const [faturaNo, setFaturaNo] = useState(row.editedFaturaNo)
  const [tarih, setTarih]     = useState(row.editedTarih)
  const [vade, setVade]       = useState(row.editedVade)
  const [tutar, setTutar]     = useState(row.editedTutar)
  const [subeId, setSubeId]   = useState<string | null>(row.sube_id)
  const [adres, setAdres]     = useState(row.musteri_adresi ?? '')
  const [items, setItems]     = useState<PdfInvoiceItem[]>(row.kalemler?.length ? row.kalemler : [makeEmptyItem(1)])
  const [custDrop, setCustDrop] = useState(false)
  const custRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (custRef.current && !custRef.current.contains(e.target as Node)) setCustDrop(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  // Kalem toplamı değişince Ödenecek Tutar'ı otomatik güncelle
  useEffect(() => {
    const total = Math.round(items.reduce((s, k) => s + Number(k.miktar) * Number(k.birim_fiyat), 0) * 100) / 100
    if (!tutar && total > 0) setTutar(String(total))
  }, [items, tutar])

  const filteredCust = name.length >= 1
    ? customers.filter(c => c.full_name.toLowerCase().includes(name.toLowerCase())).slice(0, 8)
    : []

  function pickCustomer(c: { id: string; full_name: string; tax_number: string | null; address?: string | null }) {
    setName(c.full_name)
    setVkn(c.tax_number ?? '')
    setAdres(c.address ?? adres)
    setCustDrop(false)
  }

  function handleSave() {
    const cleanItems = items
      .filter(k => k.urun_adi.trim())
      .map(k => ({
        ...k,
        miktar: Number(k.miktar) || 1,
        birim_fiyat: Number(k.birim_fiyat) || 0,
        satir_toplam: Number(k.satir_toplam) || Math.round((Number(k.miktar) || 1) * (Number(k.birim_fiyat) || 0) * 100) / 100,
      }))
    const finalTutar = tutar || String(calcItemsSubtotal(cleanItems))
    onSave(rowIdx, {
      editedName: name,
      editedVkn: vkn,
      editedFaturaNo: faturaNo,
      editedTarih: tarih,
      editedVade: vade,
      editedTutar: finalTutar,
      odenecek_tutar: finalTutar ? Number(finalTutar) : row.odenecek_tutar,
      kalemler: cleanItems,
      sube_id: subeId,
      musteri_adresi: adres || null,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50 dark:bg-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Fatura Düzenle</h3>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">

          {/* Müşteri unvanı + autocomplete */}
          <div ref={custRef} className="relative">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Müşteri Unvanı</label>
            <input
              value={name}
              onChange={e => { setName(e.target.value); setCustDrop(true) }}
              onFocus={() => setCustDrop(true)}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
            />
            {custDrop && filteredCust.length > 0 && (
              <div className="absolute z-10 w-full bg-white dark:bg-gray-800 border rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
                {filteredCust.map(c => (
                  <button key={c.id} type="button" onMouseDown={() => pickCustomer(c)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-0">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{c.full_name}</div>
                    {c.tax_number && <div className="text-xs text-gray-400 dark:text-gray-500 font-mono">{c.tax_number}</div>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* VKN + Fatura No */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Müşteri VKN</label>
              <input value={vkn} onChange={e => setVkn(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Fatura No</label>
              <input value={faturaNo} onChange={e => setFaturaNo(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Müşteri Adresi</label>
            <textarea
              value={adres}
              onChange={e => setAdres(e.target.value)}
              rows={2}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
            />
          </div>

          {/* Tarihler */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Fatura Tarihi</label>
              <input type="date" value={tarih} onChange={e => setTarih(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Vade Tarihi</label>
              <input type="date" value={vade} onChange={e => setVade(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
          </div>

          {/* Tutar + Şube */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Ödenecek Tutar (₺)</label>
              <input type="number" value={tutar} onChange={e => setTutar(e.target.value)} step="0.01" min="0"
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Şube</label>
              <select value={subeId ?? ''} onChange={e => setSubeId(e.target.value || null)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white dark:bg-gray-800">
                <option value="">— Seçin</option>
                {subeler.map(s => <option key={s.id} value={s.id}>{s.ad}</option>)}
              </select>
            </div>
          </div>

          <div className="border rounded-lg">
            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-700 border-b rounded-t-lg">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">Kalemler</span>
              <button type="button" onClick={() => setItems(prev => [...prev, makeEmptyItem(prev.length + 1)])}
                className="text-xs px-2 py-1 rounded bg-white dark:bg-gray-800 border hover:bg-gray-100">
                Kalem Ekle
              </button>
            </div>
            <div className="divide-y">
              {items.map((item, itemIdx) => (
                <div key={itemIdx} className="grid grid-cols-12 gap-2 p-3 items-end">
                  <div className="col-span-7">
                    <label className="text-[11px] text-gray-500">Açıklama</label>
                    <UrunAutocomplete
                      value={item.urun_adi}
                      onChange={v => setItems(prev => prev.map((k, i) => i === itemIdx ? { ...k, urun_adi: v } : k))}
                      onSelect={u => setItems(prev => prev.map((k, i) => i === itemIdx ? {
                        ...k,
                        urun_adi: u.ad,
                        birim: u.birim ?? 'Adet',
                        birim_fiyat: u.kdv_haric_fiyat ?? k.birim_fiyat,
                        kdv_orani: 20,
                        satir_toplam: Math.round((Number(k.miktar) || 1) * (u.kdv_haric_fiyat ?? 0) * 1.2 * 100) / 100,
                      } : k))}
                      className="mt-1 w-full border rounded px-2 py-1 text-xs"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="text-[11px] text-gray-500">Miktar</label>
                    <input type="number" step="0.01" value={item.miktar}
                      onChange={e => {
                        const miktar = Number(e.target.value)
                        setItems(prev => prev.map((k, i) => i === itemIdx ? {
                          ...k, miktar,
                          satir_toplam: Math.round(miktar * Number(k.birim_fiyat) * 100) / 100,
                        } : k))
                      }}
                      className="mt-1 w-full border rounded px-2 py-1 text-xs" />
                  </div>
                  <div className="col-span-1">
                    <label className="text-[11px] text-gray-500">Birim</label>
                    <input value={item.birim} onChange={e => setItems(prev => prev.map((k, i) => i === itemIdx ? { ...k, birim: e.target.value } : k))}
                      className="mt-1 w-full border rounded px-2 py-1 text-xs" />
                  </div>
                  <div className="col-span-1">
                    <label className="text-[11px] text-gray-500">Birim Fiyat</label>
                    <input type="number" step="0.01" value={item.birim_fiyat}
                      onChange={e => {
                        const birim_fiyat = Number(e.target.value)
                        setItems(prev => prev.map((k, i) => i === itemIdx ? {
                          ...k, birim_fiyat,
                          satir_toplam: Math.round(Number(k.miktar) * birim_fiyat * 100) / 100,
                        } : k))
                      }}
                      className="mt-1 w-full border rounded px-2 py-1 text-xs" />
                  </div>
                  <div className="col-span-1">
                    <label className="text-[11px] text-gray-500">Tutar</label>
                    <input readOnly value={(Math.round(Number(item.miktar) * Number(item.birim_fiyat) * 100) / 100).toFixed(2)}
                      className="mt-1 w-full border rounded px-2 py-1 text-xs bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 cursor-not-allowed" />
                  </div>
                  <button type="button" onClick={() => setItems(prev => prev.filter((_, i) => i !== itemIdx))}
                    className="col-span-1 text-red-500 text-xs border rounded px-2 py-1 hover:bg-red-50">
                    Sil
                  </button>
                </div>
              ))}
            </div>
          </div>

          {items.length > 0 && (
            <div className="text-xs text-gray-400 dark:text-gray-500 text-right">
              Toplam: <span className="font-medium text-gray-700 dark:text-gray-200">
                {(Math.round(items.reduce((s, k) => s + Number(k.miktar) * Number(k.birim_fiyat), 0) * 100) / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺
              </span> ({items.length} kalem)
            </div>
          )}
        </div>
        <div className="flex gap-3 px-5 py-4 border-t bg-gray-50 dark:bg-gray-700">
          <button onClick={handleSave}
            className="flex-1 bg-[#C8102E] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26]">
            Kaydet
          </button>
          <button onClick={onClose}
            className="px-5 py-2 border rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100">
            İptal
          </button>
        </div>
      </div>
    </div>
  )
}

function PdfFaturaImport() {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<PdfStep>('upload')
  const [error, setError] = useState('')
  const [previewRows, setPreviewRows] = useState<PdfPreviewRow[]>([])
  const [importResult, setImportResult] = useState<PdfImportResult | null>(null)
  const [subeler, setSubeler] = useState<Sube[]>([])
  const [globalSubeId, setGlobalSubeId] = useState<string | null>(null)
  const [editRowIdx, setEditRowIdx] = useState<number | null>(null)
  const [customers, setCustomers] = useState<{ id: string; full_name: string; tax_number: string | null; tc_kimlik?: string | null }[]>([])

  // Şubeleri yükle ve Erzincan Merkez'i varsayılan yap
  useEffect(() => {
    supabase.from('subeler').select('id, ad').order('ad').then(({ data }: { data: any; error: any }) => {
      if (data) {
        setSubeler(data as Sube[])
        const erzincan = (data as Sube[]).find(s => s.ad === 'Erzincan Merkez')
        if (erzincan) setGlobalSubeId(erzincan.id)
      }
    })
    supabase.from('customers').select('id, full_name, tax_number, tc_kimlik, address').eq('is_active', true).order('full_name')
      .then(({ data }: { data: any; error: any }) => { if (data) setCustomers(data as any[]) })
  }, [])

  async function handleFile(file: File) {
    const lowerName = file.name.toLowerCase()
    if (!lowerName.endsWith('.zip') && !lowerName.endsWith('.pdf')) {
      setError('Yalnızca PDF veya ZIP dosyası yükleyebilirsiniz.')
      return
    }
    setStep('parsing')
    setError('')

    try {
      // ── Dosyayı API'ye gönder, parse et ────────────────────────
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
        supabase.from('invoices').select('invoice_number, invoice_date, total_amount').eq('invoice_type', 'satis'),
        supabase.from('customers').select('full_name, tax_number, tc_kimlik'),
      ])
      const KOKLU_VKN = '5830028164'

      const existingNos   = new Set((invData ?? []).map((i: any) => normNo(i.invoice_number)))
      const customersForMatch = (custData ?? []) as { full_name: string; tax_number: string | null; tc_kimlik?: string | null }[]

      const preview: PdfPreviewRow[] = invoices.map(inv => {
        let rowStatus: PdfRowStatus
        let message = ''
        const invoiceNo = normNo(inv.fatura_no)
        const itemCount = inv.kalemler?.length ?? 0
        const isManualWarning = !!inv.hata && /manuel kontrol gerekli/i.test(inv.hata)
        if (inv.hata && !isManualWarning) {
          rowStatus = 'hata'
          message = inv.hata
        } else if (!inv.fatura_no) {
          rowStatus = 'hata'
          message = 'Fatura numarası parse edilemedi, manuel kontrol gerekli'
        } else if (itemCount === 0) {
          rowStatus = 'hata'
          message = 'Kalemler tam parse edilemedi, manuel kontrol gerekli'
        } else if (existingNos.has(invoiceNo)) {
          rowStatus = 'duplicate'
          message = 'Bu fatura sistemde zaten mevcut'
        } else {
          const name    = inv.musteri_adi ?? ''
          const vkn     = normVkn(inv.musteri_vkn)
          // VKN veya TCKN ile eşleştir — tc_kimlik kolonunu da kontrol et
          const vknMatch  = vkn.length >= 10 && vkn !== KOKLU_VKN
            ? customersForMatch.find(c => normVkn(c.tax_number) === vkn || normVkn(c.tc_kimlik) === vkn)
            : undefined
          const nameMatch = !vknMatch ? findByName(customersForMatch, name) : undefined
          const matchMethod = vknMatch ? 'vkn' : nameMatch ? 'unvan' : 'bulunamadı'
          console.log('[giden eşleştirme] VKN:', vkn, 'vknMatch:', vknMatch, 'name:', name, 'nameMatch:', nameMatch)
          rowStatus = (vknMatch || nameMatch) ? 'eklenecek' : 'yeni_musteri'
          message = isManualWarning ? inv.hata! : vknMatch
            ? 'Müşteri VKN ile eşleştirildi'
            : nameMatch
              ? 'Müşteri unvan ile eşleştirildi'
              : name ? 'Yeni Müşteri' : 'Müşteri adı parse edilemedi, manuel kontrol gerekli'
          console.log('[giden import]', {
            musteri: name || null,
            vkn: vkn || null,
            fatura_no: inv.fatura_no,
            kalem_sayisi: itemCount,
            duplicate: false,
            eslesme: matchMethod,
          })
        }
        if (rowStatus === 'duplicate' || rowStatus === 'hata') {
          console.log('[giden import]', {
            musteri: inv.musteri_adi || null,
            vkn: normVkn(inv.musteri_vkn) || null,
            fatura_no: inv.fatura_no,
            kalem_sayisi: itemCount,
            duplicate: rowStatus === 'duplicate',
            eslesme: 'bulunamadı',
            mesaj: message,
          })
        }
        // İl bilgisine göre şube otomatik ata — globalSubeId yoksa veya il biliniyorsa
        const autoSubeId = inv.musteri_il
          ? detectBranch(inv.musteri_il, subeler) ?? globalSubeId
          : globalSubeId

        // Tarih boşsa hata mesajı ekle ama import'u engelleme
        let finalHata = rowStatus === 'hata' ? message : (inv.hata ?? null)
        if (!finalHata && !inv.fatura_tarihi && rowStatus !== 'hata' && rowStatus !== 'duplicate') {
          finalHata = 'Manuel kontrol gerekli: tarih otomatik çıkarılamadı, lütfen düzenle'
        }

        return {
          ...inv,
          hata: finalHata,
          rowStatus,
          editedName: inv.musteri_adi ?? '',
          editedVkn: inv.musteri_vkn ?? '',
          editedFaturaNo: inv.fatura_no ?? '',
          editedTarih: inv.fatura_tarihi ?? '',
          editedVade: inv.vade_tarihi ?? '',
          editedTutar: inv.odenecek_tutar != null ? String(inv.odenecek_tutar) : '',
          sube_id: autoSubeId,
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
          fatura_no:      r.editedFaturaNo.trim() || (r.fatura_no ?? ''),
          fatura_tarihi:  r.editedTarih || (r.fatura_tarihi ?? new Date().toISOString().split('T')[0]),
          vade_tarihi:    r.editedVade || r.vade_tarihi || null,
          senaryo:        r.senaryo ?? null,
          musteri_adi:    r.editedName.trim() || (r.musteri_adi ?? 'Bilinmiyor'),
          musteri_vkn:    r.editedVkn.trim() || r.musteri_vkn || null,
          musteri_adresi: r.musteri_adresi ?? null,
          kdv_matrahi:    r.kdv_matrahi ?? null,
          kdv_tutari:     r.kdv_tutari ?? null,
          odenecek_tutar: r.editedTutar ? parseFloat(r.editedTutar) : (r.odenecek_tutar ?? null),
          kalemler:       r.kalemler ?? [],
          banka_bilgileri: r.banka_bilgileri ?? [],
          sube_id:        r.sube_id ?? null,
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

  function applyGlobalSube(subeId: string | null) {
    setGlobalSubeId(subeId)
    setPreviewRows(prev => prev.map(r => ({ ...r, sube_id: subeId })))
  }

  function saveEdit(idx: number, updated: Partial<PdfPreviewRow>) {
    setPreviewRows(prev => prev.map((r, i) => {
      if (i !== idx) return r
      const merged = { ...r, ...updated }
      // Müşteri eşleştirme güncelle
      if (merged.rowStatus !== 'duplicate') {
        const vkn  = normVkn(merged.editedVkn)
        const name = merged.editedName.trim()
        const hasRequired = !!name && !!merged.editedFaturaNo.trim() && !!merged.editedTutar && (merged.kalemler?.length ?? 0) > 0
        const vknMatch  = vkn.length >= 10 && customers.some(c => normVkn(c.tax_number) === vkn || normVkn(c.tc_kimlik) === vkn)
        const nameMatch = !!name && customers.some(c => namesMatch(c.full_name, name))
        merged.rowStatus = hasRequired ? (vknMatch || nameMatch ? 'eklenecek' : 'yeni_musteri') : 'hata'
        merged.hata = hasRequired ? null : 'Eksik veri var, manuel kontrol gerekli'
      }
      return merged
    }))
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
          className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-12 text-center cursor-pointer hover:border-[#C8102E] hover:bg-red-50 transition-colors"
        >
          <input ref={fileRef} type="file" accept=".zip,.pdf" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
          <div className="space-y-2">
            <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">ZIP veya PDF dosyası seçin ya da sürükleyin</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">Tek fatura için PDF, çoklu fatura için ZIP</p>
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
          <p className="text-gray-700 dark:text-gray-300 font-medium">PDF'ler analiz ediliyor...</p>
          <p className="text-sm text-gray-400 dark:text-gray-500">Fatura okunuyor, lütfen bekleyin.</p>
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
      .reduce((s, r) => s + (r.editedTutar ? parseFloat(r.editedTutar) : (r.odenecek_tutar ?? 0)), 0)

    const erzincanSube = subeler.find(s => s.ad === 'Erzincan Merkez')
    const istanbulSube = subeler.find(s => s.ad === 'İstanbul Şube')

    return (
      <div className="p-6 space-y-4 max-w-6xl mx-auto overflow-x-hidden">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={resetAll} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700">← Geri</button>
            <span className="text-gray-300">/</span>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Önizleme ve Onay</h2>
            <span className="text-xs text-gray-400 dark:text-gray-500">{previewRows.length} PDF</span>
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
          <div className="bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">Duplicate</div>
            <div className="text-2xl font-bold text-gray-500 dark:text-gray-400">{duplicate}</div>
            <div className="text-xs text-gray-400 dark:text-gray-500">atlanacak</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <div className="text-xs text-red-600 font-medium">Parse Hatası</div>
            <div className="text-2xl font-bold text-red-600">{hatali}</div>
            <div className="text-xs text-red-500">manuel kontrol</div>
          </div>
          <div className="bg-white dark:bg-gray-800 border rounded-lg p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">Eklenecek Tutar</div>
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{fmtAmt(toplamTutar)}</div>
          </div>
        </div>

        {/* Global Şube Seçici */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-blue-800">Tüm Faturalara Şube:</span>
          <select
            value={globalSubeId ?? ''}
            onChange={e => applyGlobalSube(e.target.value || null)}
            className="border border-blue-300 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
          >
            <option value="">— Şube seçin</option>
            {subeler.map(s => <option key={s.id} value={s.id}>{s.ad}</option>)}
          </select>
          <span className="text-blue-400 text-xs">veya hızlı:</span>
          {erzincanSube && (
            <button onClick={() => applyGlobalSube(erzincanSube.id)}
              className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-800 px-3 py-1.5 rounded-lg font-medium transition-colors">
              Tümünü Erzincan'a Ata
            </button>
          )}
          {istanbulSube && (
            <button onClick={() => applyGlobalSube(istanbulSube.id)}
              className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-800 px-3 py-1.5 rounded-lg font-medium transition-colors">
              Tümünü İstanbul'a Ata
            </button>
          )}
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}

        {/* Satır listesi */}
        <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-x-auto max-w-full">
          <table className="w-full min-w-[900px] table-fixed text-sm">
            <colgroup>
              <col className="w-24" />
              <col className="w-48" />
              <col className="w-28" />
              <col className="w-24" />
              <col className="w-36" />
              <col className="w-20" />
              <col className="w-16" />
              <col className="w-28" />
              <col className="w-14" />
              <col className="w-20" />
              <col className="w-10" />
            </colgroup>
            <thead className="bg-gray-50 dark:bg-gray-700 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-28">Durum</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Müşteri Adı</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Fatura No</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Tarih</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-28">Şube</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Kalem</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Tutar</th>
                <th className="px-4 py-3 w-8" />
                <th className="px-4 py-3 w-8" />
                <th className="px-4 py-3 w-8" />
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row, idx) => {
                const isDup  = row.rowStatus === 'duplicate'
                const isYeni = row.rowStatus === 'yeni_musteri'
                const isHata = row.rowStatus === 'hata'

                const rowBg = isDup  ? 'bg-gray-50 dark:bg-gray-700 opacity-60'
                  : isYeni ? 'bg-yellow-50'
                  : isHata ? 'bg-red-50'
                  : 'bg-white dark:bg-gray-800'

                const badge = isDup
                  ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600 dark:text-gray-300">Duplicate</span>
                  : isYeni
                  ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">Yeni Müşteri</span>
                  : isHata
                  ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">Parse Hatası</span>
                  : <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">Eklenecek</span>

                const subeAdi = row.sube_id ? (subeler.find(s => s.id === row.sube_id)?.ad ?? '?') : <span className="text-gray-300">—</span>

                return (
                  <React.Fragment key={idx}>
                    <tr className={`${rowBg} border-t`}>
                      <td className="px-3 py-2.5 overflow-hidden">{badge}</td>
                      <td className="px-3 py-2.5 overflow-hidden">
                        <span className="text-gray-900 dark:text-gray-100 font-medium">
                          {row.editedName || <span className="text-gray-400 dark:text-gray-500 italic">Bilinmiyor</span>}
                        </span>
                        {(row.editedVkn || row.musteri_vkn) && (
                          <div className="text-xs text-gray-400 dark:text-gray-500 font-mono">{row.editedVkn || row.musteri_vkn}</div>
                        )}
                        {isDup && <div className="text-xs text-gray-500 mt-0.5">Bu fatura sistemde zaten mevcut</div>}
                        {isHata && row.hata && <div className="text-xs text-red-600 mt-0.5">{row.hata}</div>}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-700 dark:text-gray-300">
                        {row.editedFaturaNo || row.fatura_no || <span className="text-gray-400 dark:text-gray-500">—</span>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300 whitespace-nowrap text-xs">
                        <div>{row.editedTarih || row.fatura_tarihi || '—'}</div>
                        {(row.editedVade || row.vade_tarihi) && (
                          <div className="text-gray-400 dark:text-gray-500">vade: {row.editedVade || row.vade_tarihi}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-600 dark:text-gray-300">{subeAdi}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600 dark:text-gray-300">
                        {isHata ? <span className="text-red-500 text-xs">{row.hata?.slice(0, 40)}</span> : (row.kalemler?.length ?? 0)}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-semibold ${isDup ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>
                        {row.editedTutar ? fmtAmt(parseFloat(row.editedTutar)) : fmtAmt(row.odenecek_tutar)}
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        {!isHata && (row.kalemler?.length ?? 0) > 0 && (
                          <button
                            onClick={() => toggleExpand(idx)}
                            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 text-xs"
                            title="Kalemleri göster"
                          >
                            {row.expanded ? '▲' : '▼'}
                          </button>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        <button
                          onClick={() => setEditRowIdx(idx)}
                          className="text-gray-400 dark:text-gray-500 hover:text-blue-500 transition-colors"
                          title="Düzenle"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
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
                      <td colSpan={11} className="px-6 pb-3 pt-1">
                          <div className="w-full overflow-x-auto bg-white dark:bg-gray-800 border rounded-lg">
                            <table className="min-w-full text-xs">
                              <thead className="bg-gray-50 dark:bg-gray-700 border-b">
                                <tr>
                                  <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400">#</th>
                                  <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400">Ürün / Hizmet</th>
                                  <th className="text-right px-3 py-2 text-gray-500 dark:text-gray-400">Miktar</th>
                                  <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400">Birim</th>
                                  <th className="text-right px-3 py-2 text-gray-500 dark:text-gray-400">Birim Fiyat</th>
                                  <th className="text-right px-3 py-2 text-gray-500 dark:text-gray-400">İskonto</th>
                                  <th className="text-right px-3 py-2 text-gray-500 dark:text-gray-400">KDV %</th>
                                  <th className="text-right px-3 py-2 text-gray-500 dark:text-gray-400">KDV Tutarı</th>
                                  <th className="text-right px-3 py-2 text-gray-500 dark:text-gray-400">Satır Toplam</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {(row.kalemler ?? []).map((k, ki) => (
                                  <tr key={ki} className="hover:bg-gray-50">
                                    <td className="px-3 py-1.5 text-gray-400 dark:text-gray-500">{ki + 1}</td>
                                    <td className="px-3 py-1.5 max-w-[200px] truncate text-gray-800 dark:text-gray-200" title={k.urun_adi}>{k.urun_adi}</td>
                                    <td className="px-3 py-1.5 text-right text-gray-700 dark:text-gray-300">{k.miktar}</td>
                                    <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400">{k.birim}</td>
                                    <td className="px-3 py-1.5 text-right text-gray-700 dark:text-gray-300">{fmtAmt(k.birim_fiyat)}</td>
                                    <td className="px-3 py-1.5 text-right text-orange-600">
                                      {k.iskonto_tutari > 0
                                        ? `${k.iskonto_orani > 0 ? `%${k.iskonto_orani} ` : ''}${fmtAmt(k.iskonto_tutari)}`
                                        : <span className="text-gray-300">—</span>}
                                    </td>
                                    <td className="px-3 py-1.5 text-right text-gray-600 dark:text-gray-300">%{k.kdv_orani}</td>
                                    <td className="px-3 py-1.5 text-right text-gray-600 dark:text-gray-300">{fmtAmt(k.kdv_tutari)}</td>
                                    <td className="px-3 py-1.5 text-right font-medium text-gray-900 dark:text-gray-100">{fmtAmt(k.satir_toplam)}</td>
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
          <button onClick={resetAll} className="px-8 py-3 border rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50">
            İptal
          </button>
        </div>

        {/* Edit Modal */}
        {editRowIdx !== null && (
          <PdfEditModal
            row={previewRows[editRowIdx]}
            rowIdx={editRowIdx}
            subeler={subeler}
            customers={customers}
            onSave={saveEdit}
            onClose={() => setEditRowIdx(null)}
          />
        )}
      </div>
    )
  }

  // ── Kaydediliyor ──────────────────────────────────────────────
  if (step === 'importing') {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <div className="text-center space-y-4">
          <div className="w-14 h-14 border-4 border-[#C8102E] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-700 dark:text-gray-300 font-medium">Faturalar kaydediliyor...</p>
          <p className="text-sm text-gray-400 dark:text-gray-500">Lütfen bekleyin, sayfayı kapatmayın.</p>
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
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">İçe Aktarma Sonucu</h2>
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
          <div className="bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-gray-500 dark:text-gray-400">{atilandi}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium">Atlandı</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{hatalılar.length}</div>
            <div className="text-xs text-red-500 mt-1 font-medium">Hatalı</div>
          </div>
        </div>

        {eklenenler.length > 0 && (
          <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Eklenen Faturalar</h3>
            </div>
            <div className="divide-y max-h-64 overflow-y-auto">
              {eklenenler.map((r, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{r.musteri_adi}</span>
                    {r.musteri_yeni && (
                      <span className="ml-2 text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">Yeni Müşteri</span>
                    )}
                    <div className="text-xs text-gray-400 dark:text-gray-500 font-mono">{r.fatura_no}</div>
                  </div>
                  <div className="flex gap-2">
                    {r.invoice_id && (
                      <Link href={`/cari-hesap/faturalar/${r.invoice_id}`} className="text-xs text-[#C8102E] hover:underline font-medium">
                        Fatura →
                      </Link>
                    )}
                    {r.customer_id && (
                      <Link href={`/customers/${r.customer_id}`} className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-700">
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
          <div className="bg-white dark:bg-gray-800 border border-red-200 rounded-xl overflow-hidden">
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
          <button onClick={resetAll} className="px-8 py-3 border rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50">
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
  'Yangın Tüpü Parça & Malzeme',
  'Gaz & Dolum Malzemesi',
  'Hammadde',
  'Market / Gıda',
  'İnternet / İletişim',
  'Elektrik',
  'Doğalgaz',
  'Su',
  'Enerji Gideri',
  'Kira',
  'Yakıt / Akaryakıt',
  'Kargo / Nakliye',
  'Araç Gideri',
  'Vergi / Resmi',
  'Ofis / Kırtasiye',
  'Belgelendirme',
  'Elektronik / Teknik',
  'Reklam / Tanıtım',
  'Muhasebe / Denetim',
  'Genel Gider',
]

const DEFAULT_GIDER_KATEGORI = 'Genel Gider'

function suggestIncomingExpenseCategory(supplierName: string | null | undefined): string | null {
  const name = normalizeName(supplierName ?? '')
  if (!name) return null

  if (name.includes('migros') || /\bbim\b/.test(name) || name.includes('a101') || /\bsok\b/.test(name) || name.includes('carrefour') || name.includes('market') || name.includes('gida')) return 'Market / Gıda'
  if (name.includes('turknet') || name.includes('ttnet') || name.includes('turk telekom') || name.includes('turkcell') || name.includes('vodafone') || name.includes('superonline') || name.includes('internet')) return 'İnternet / İletişim'
  if (name.includes('ck bogazici') || name.includes('bogazici elektrik') || name.includes('enerjisa') || /\bedas\b/.test(name) || /\bepas\b/.test(name) || name.includes('ayedas') || name.includes('baskent elektrik') || name.includes('ckbogazici')) return 'Elektrik'
  if (name.includes('igdas') || name.includes('gazdas') || name.includes('aksa gaz') || name.includes('erzingaz') || name.includes('bursagaz') || name.includes('dogalgaz')) return 'Doğalgaz'
  if (/\biski\b/.test(name) || /\baski\b/.test(name) || /\beski\b/.test(name) || /\bmeski\b/.test(name)) return 'Su'
  if (name.includes('opet') || name.includes('shell') || /\bbp\b/.test(name) || name.includes('total') || name.includes('petrol') || name.includes('akaryakit') || name.includes('lukoil')) return 'Yakıt / Akaryakıt'
  if (name.includes('kargo') || name.includes('nakliye') || name.includes('yurtici') || name.includes('aras') || /\bmng\b/.test(name) || /\bptt\b/.test(name) || name.includes('surat') || /\bups\b/.test(name) || name.includes('fedex') || name.includes('hepsijet') || name.includes('d fast') || name.includes('dfast')) return 'Kargo / Nakliye'
  if (name.includes('yangin') || name.includes('sondurme')) return 'Yangın Tüpü Parça & Malzeme'
  if (name.includes('gaz dolum') || name.includes('azot') || name.includes('semihler') || name.includes('demir celik')) return 'Gaz & Dolum Malzemesi'
  if (name.includes('basinc') || name.includes('delta') || name.includes('celik') || name.includes('metal') || /\bsac\b/.test(name) || name.includes('kaynak')) return 'Hammadde'
  if (name.includes('nemacert') || name.includes('turkak') || name.includes('kalibrasyon') || name.includes('belgelen') || name.includes('sertifika') || /\btse\b/.test(name) || /\biso\b/.test(name)) return 'Belgelendirme'
  if (name.includes('robot') || name.includes('elektronik') || name.includes('sensor') || name.includes('arduino') || name.includes('robotzade')) return 'Elektronik / Teknik'
  if (name.includes('reklam') || name.includes('matbaa') || name.includes('basim') || name.includes('tabela') || name.includes('kartvizit')) return 'Reklam / Tanıtım'
  if (name.includes('muhasebe') || name.includes('mali musavir') || /\bsmmm\b/.test(name) || /\bymm\b/.test(name) || name.includes('denetim')) return 'Muhasebe / Denetim'
  if (name.includes('enerji')) return 'Enerji Gideri'
  if (name.includes('noter') || name.includes('vergi')) return 'Vergi / Resmi'
  if (name.includes('kira') || name.includes('gayrimenkul')) return 'Kira'
  return null
}

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
  tedarikci_adres?: string | null
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
type GelenSupplierMatchStatus = 'existing' | 'new' | 'suspicious'
type GelenDuplicateStatus = 'duplicate' | 'not_duplicate'
type GelenParseStatus = 'clean' | 'manual_review' | 'critical_error'
type GelenImportStatus = 'importable' | 'blocked' | 'skipped_duplicate'
type GelenPrimaryPreviewStatus = 'duplicate' | 'parse_error' | 'manual_review' | 'existing_supplier' | 'new_supplier'
type GelenPreviewFilter = GelenPrimaryPreviewStatus | null

type GelenSupplierForMatch = {
  id: string | null
  name: string | null
  taxNo: string | number | null
  source: 'invoice' | 'manual'
  table: 'invoices' | 'tedarikciler'
  nameColumn: 'supplier_name' | 'firma_adi'
  taxColumn: 'supplier_tax_no' | 'vergi_no'
}

type GelenSupplierMatchSourceResponse = {
  sources: {
    invoices: {
      table: 'invoices'
      nameColumn: 'supplier_name'
      taxColumn: 'supplier_tax_no'
      query: string
      count: number
    }
    manualSuppliers: {
      table: 'tedarikciler'
      nameColumn: 'firma_adi'
      taxColumn: 'vergi_no'
      query: string
      count: number
      error?: string | null
    }
  }
  suppliers: GelenSupplierForMatch[]
  existingInvoices: ExistingIncomingInvoice[]
}

type GelenPdfPreviewRow = GelenParsedInvoice & {
  rowStatus: GelenPdfRowStatus
  supplierMatchMethod: SupplierMatchMethod
  supplierMatchMessage: string
  supplierMatchStatus: GelenSupplierMatchStatus
  duplicateStatus: GelenDuplicateStatus
  parseStatus: GelenParseStatus
  importStatus: GelenImportStatus
  duplicateMatchedBy: string
  categorySuggestion: string | null
  editedName: string
  editedVkn: string
  editedFaturaNo: string
  editedTarih: string
  editedVade: string
  editedTutar: string
  editedKategori: string
  sube_id: string | null
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

type ExistingIncomingInvoice = {
  id: string
  invoice_number: string | null
  supplier_name: string | null
  supplier_tax_no: string | number | null
  invoice_date: string | null
  total_amount: number | null
}

function getPrimaryPreviewStatus(row: GelenPdfPreviewRow): GelenPrimaryPreviewStatus {
  if (row.duplicateStatus === 'duplicate') return 'duplicate'
  if (row.parseStatus === 'critical_error') return 'parse_error'
  if (row.parseStatus === 'manual_review') return 'manual_review'
  if (row.supplierMatchStatus === 'existing') return 'existing_supplier'
  return 'new_supplier'
}

function applyIncomingCategory(row: GelenPdfPreviewRow, category: string): GelenPdfPreviewRow {
  if (row.duplicateStatus === 'duplicate' || row.parseStatus === 'critical_error') {
    return { ...row, editedKategori: category }
  }
  const categoryResolved = category !== DEFAULT_GIDER_KATEGORI || row.categorySuggestion === category
  const parseStatus: GelenParseStatus = categoryResolved ? 'clean' : 'manual_review'
  const rowStatus: GelenPdfRowStatus = parseStatus === 'manual_review'
    ? 'manuel_kategori'
    : row.supplierMatchStatus === 'new'
      ? 'yeni_tedarikci'
      : 'eklenecek'
  return {
    ...row,
    editedKategori: category,
    parseStatus,
    importStatus: 'importable',
    rowStatus,
    hata: parseStatus === 'clean' ? null : row.hata,
  }
}

function GelenPdfEditModal({
  row,
  rowIdx,
  subeler,
  onSave,
  onClose,
}: {
  row: GelenPdfPreviewRow
  rowIdx: number
  subeler: Sube[]
  onSave: (idx: number, updated: Partial<GelenPdfPreviewRow>) => void
  onClose: () => void
}) {
  const [name, setName] = useState(row.editedName)
  const [vkn, setVkn] = useState(row.editedVkn)
  const [faturaNo, setFaturaNo] = useState(row.editedFaturaNo)
  const [tarih, setTarih] = useState(row.editedTarih)
  const [vade, setVade] = useState(row.editedVade)
  const [tutar, setTutar] = useState(row.editedTutar)
  const [kategori, setKategori] = useState(row.editedKategori)
  const [subeId, setSubeId] = useState<string | null>(row.sube_id)
  const [adres, setAdres] = useState(row.tedarikci_adres ?? '')
  const [items, setItems] = useState<GelenPdfItem[]>(row.kalemler?.length ? row.kalemler : [makeEmptyItem(1)])

  function handleSave() {
    const cleanItems = items
      .filter(k => k.urun_adi.trim())
      .map(k => ({
        ...k,
        miktar: Number(k.miktar) || 1,
        birim_fiyat: Number(k.birim_fiyat) || 0,
        satir_toplam: Number(k.satir_toplam) || Math.round((Number(k.miktar) || 1) * (Number(k.birim_fiyat) || 0) * 100) / 100,
      }))
    const finalTutar = tutar || String(calcItemsSubtotal(cleanItems))
    onSave(rowIdx, {
      editedName: name,
      editedVkn: vkn,
      editedFaturaNo: faturaNo,
      editedTarih: tarih,
      editedVade: vade,
      editedTutar: finalTutar,
      editedKategori: kategori,
      satici_adi: name,
      satici_vkn: vkn,
      fatura_no: faturaNo,
      fatura_tarihi: tarih,
      vade_tarihi: vade || null,
      odenecek_tutar: finalTutar ? Number(finalTutar) : row.odenecek_tutar,
      kalemler: cleanItems,
      sube_id: subeId,
      tedarikci_adres: adres || null,
    })
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50 dark:bg-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Gelen Fatura Düzenle</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Tedarikçi adı" className="border rounded-lg px-3 py-2 text-sm" />
            <input value={vkn} onChange={e => setVkn(e.target.value)} placeholder="VKN/TCKN" className="border rounded-lg px-3 py-2 text-sm" />
            <input value={faturaNo} onChange={e => setFaturaNo(e.target.value)} placeholder="Fatura no" className="border rounded-lg px-3 py-2 text-sm" />
            <input type="number" step="0.01" value={tutar} onChange={e => setTutar(e.target.value)} placeholder="Toplam tutar" className="border rounded-lg px-3 py-2 text-sm" />
            <input type="date" value={tarih} onChange={e => setTarih(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
            <input type="date" value={vade} onChange={e => setVade(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
            <select value={kategori} onChange={e => setKategori(e.target.value)} className="border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800">
              {GIDER_KATEGORILERI.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            <select value={subeId ?? ''} onChange={e => setSubeId(e.target.value || null)} className="border rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800">
              <option value="">Şube seçin</option>
              {subeler.map(s => <option key={s.id} value={s.id}>{s.ad}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Tedarikçi Adresi</label>
            <textarea
              value={adres}
              onChange={e => setAdres(e.target.value)}
              rows={2}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
            />
          </div>
          <div className="border rounded-lg">
            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-700 border-b rounded-t-lg">
              <span className="text-xs font-semibold">Kalemler</span>
              <button type="button" onClick={() => setItems(prev => [...prev, makeEmptyItem(prev.length + 1)])} className="text-xs px-2 py-1 rounded bg-white dark:bg-gray-800 border">Kalem Ekle</button>
            </div>
            {items.map((item, itemIdx) => (
              <div key={itemIdx} className="grid grid-cols-12 gap-2 p-3 border-t items-end">
                <div className="col-span-7">
                  <UrunAutocomplete
                    value={item.urun_adi}
                    onChange={v => setItems(prev => prev.map((k, i) => i === itemIdx ? { ...k, urun_adi: v } : k))}
                    onSelect={u => setItems(prev => prev.map((k, i) => i === itemIdx ? {
                      ...k,
                      urun_adi: u.ad,
                      birim: u.birim ?? 'Adet',
                      birim_fiyat: u.kdv_haric_fiyat ?? k.birim_fiyat,
                      kdv_orani: 20,
                      satir_toplam: Math.round((Number(k.miktar) || 1) * (u.kdv_haric_fiyat ?? 0) * 1.2 * 100) / 100,
                    } : k))}
                    className="w-full border rounded px-2 py-1 text-xs"
                  />
                </div>
                <input type="number" step="0.01" value={item.miktar} onChange={e => setItems(prev => prev.map((k, i) => i === itemIdx ? { ...k, miktar: Number(e.target.value) } : k))} className="col-span-1 border rounded px-2 py-1 text-xs" />
                <input value={item.birim} onChange={e => setItems(prev => prev.map((k, i) => i === itemIdx ? { ...k, birim: e.target.value } : k))} className="col-span-1 border rounded px-2 py-1 text-xs" />
                <input type="number" step="0.01" value={item.birim_fiyat} onChange={e => setItems(prev => prev.map((k, i) => i === itemIdx ? { ...k, birim_fiyat: Number(e.target.value) } : k))} className="col-span-1 border rounded px-2 py-1 text-xs" />
                <input type="number" step="0.01" value={item.satir_toplam} onChange={e => setItems(prev => prev.map((k, i) => i === itemIdx ? { ...k, satir_toplam: Number(e.target.value) } : k))} className="col-span-1 border rounded px-2 py-1 text-xs" />
                <button type="button" onClick={() => setItems(prev => prev.filter((_, i) => i !== itemIdx))} className="col-span-1 text-red-500 text-xs border rounded px-2 py-1">Sil</button>
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-3 px-5 py-4 border-t bg-gray-50 dark:bg-gray-700">
          <button onClick={handleSave} className="flex-1 bg-[#C8102E] text-white py-2 rounded-lg text-sm font-medium">Kaydet</button>
          <button onClick={onClose} className="px-5 py-2 border rounded-lg text-sm text-gray-600">İptal</button>
        </div>
      </div>
    </div>
  )
}

function GelenPdfFaturaImport() {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<GelenPdfStep>('upload')
  const [error, setError] = useState('')
  const [previewRows, setPreviewRows] = useState<GelenPdfPreviewRow[]>([])
  const [importResult, setImportResult] = useState<GelenPdfImportResult | null>(null)
  const [subeler, setSubeler] = useState<Sube[]>([])
  const [globalSubeId, setGlobalSubeId] = useState<string | null>(null)
  const [editRowIdx, setEditRowIdx] = useState<number | null>(null)
  const [activePreviewFilter, setActivePreviewFilter] = useState<GelenPreviewFilter>(null)
  const [selectedPreviewRows, setSelectedPreviewRows] = useState<Set<number>>(new Set())
  const [bulkCategory, setBulkCategory] = useState(DEFAULT_GIDER_KATEGORI)

  useEffect(() => {
    supabase.from('subeler').select('id, ad').order('ad').then(({ data }: { data: any; error: any }) => {
      if (data) {
        setSubeler(data as Sube[])
        const erzincan = (data as Sube[]).find(s => s.ad === 'Erzincan Merkez')
        if (erzincan) setGlobalSubeId(erzincan.id)
      }
    })
  }, [])

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
      const supplierSourceRes = await fetch('/api/gelen-supplier-match-source')
      const supplierSource: GelenSupplierMatchSourceResponse = await supplierSourceRes.json()
      if (!supplierSourceRes.ok) throw new Error((supplierSource as { error?: string }).error ?? 'TedarikÃ§i eÅŸleÅŸtirme verisi okunamadÄ±')

      const existingInvoices = supplierSource.existingInvoices ?? []
      const suppliersForMatch = supplierSource.suppliers

      const preview: GelenPdfPreviewRow[] = invoices.map(inv => {
        let rowStatus: GelenPdfRowStatus
        let message = ''
        const invoiceNo = normalizeInvoiceNo(inv.fatura_no)
        const itemCount = inv.kalemler?.length ?? 0
        const isManualWarning = !!inv.hata && /manuel kontrol gerekli/i.test(inv.hata)
        const ownCompanySupplier = isOwnCompanySupplierName(inv.satici_adi)
        const name = ownCompanySupplier ? '' : inv.satici_adi ?? ''
        const taxNo = normalizeSupplierTaxNo(inv.satici_vkn)
        const normalizedName = normalizeSupplierName(name)
        const hasHeaderForManualReview = !!name.trim() && !!inv.fatura_no && !!inv.fatura_tarihi && (inv.odenecek_tutar ?? 0) > 0
        const supplierMatch = matchExistingSupplier(suppliersForMatch, { name, taxNo })
        const dbMatches = taxNo.length >= 10
          ? suppliersForMatch.filter(s => normalizeSupplierTaxNo(s.taxNo) === taxNo)
          : normalizedName
            ? suppliersForMatch.filter(s => normalizeSupplierName(s.name) === normalizedName)
            : []
        const matchedBy = supplierMatch.method === 'tax'
          ? 'tax_number'
          : supplierMatch.method === 'normalized_name' || supplierMatch.method === 'similar_name'
            ? 'normalized_name'
            : 'none'
        const finalStatus = supplierMatch.method === 'none' ? 'new' : 'existing'
        const matchedSupplier = supplierMatch.supplier
        const matchedSource = matchedSupplier
          ? (matchedSupplier.source === 'manual' ? supplierSource.sources.manualSuppliers : supplierSource.sources.invoices)
          : null
        const existingWithSameInvoiceNo = existingInvoices.filter(existing =>
          !!invoiceNo && normalizeInvoiceNo(existing.invoice_number) === invoiceNo
        )
        const supplierIdMatches = matchedSupplier?.id
          ? existingWithSameInvoiceNo.filter(existing => {
              const existingSupplierMatch = matchExistingSupplier(suppliersForMatch, {
                name: existing.supplier_name,
                taxNo: existing.supplier_tax_no,
              })
              return existingSupplierMatch.supplier?.id === matchedSupplier.id
            })
          : []
        const taxNumberMatches = supplierIdMatches.length === 0 && taxNo.length >= 10
          ? existingWithSameInvoiceNo.filter(existing => normalizeSupplierTaxNo(existing.supplier_tax_no) === taxNo)
          : []
        const normalizedNameMatches = supplierIdMatches.length === 0 && taxNumberMatches.length === 0 && normalizedName
          ? existingWithSameInvoiceNo.filter(existing => normalizeSupplierName(existing.supplier_name) === normalizedName)
          : []
        const duplicateMatches = supplierIdMatches.length > 0
          ? supplierIdMatches
          : taxNumberMatches.length > 0
            ? taxNumberMatches
            : normalizedNameMatches.length > 0
              ? normalizedNameMatches
              : existingWithSameInvoiceNo  // fatura no tek başına yeterli
        const duplicateMatch = duplicateMatches[0] ?? null
        const duplicateMatchedBy = supplierIdMatches.length > 0
          ? 'supplier_id+invoice_no'
          : taxNumberMatches.length > 0
            ? 'tax_number+invoice_no'
            : normalizedNameMatches.length > 0
              ? 'normalized_supplier_name+invoice_no'
              : existingWithSameInvoiceNo.length > 0
                ? 'invoice_no_only'
                : 'none'
        console.log('[incoming supplier match]', {
          row_invoice_no: inv.fatura_no ?? null,
          raw_supplier_name: inv.satici_adi ?? null,
          raw_tax_number: inv.satici_vkn ?? null,
          normalized_supplier_name: normalizedName || null,
          normalized_tax_number: taxNo || null,
          supplier_table: matchedSource?.table ?? 'invoices,tedarikciler',
          supplier_name_column: matchedSource?.nameColumn ?? 'supplier_name,firma_adi',
          supplier_tax_column: matchedSource?.taxColumn ?? 'supplier_tax_no,vergi_no',
          supplier_query: matchedSource?.query ?? `${supplierSource.sources.invoices.query} + ${supplierSource.sources.manualSuppliers.query}`,
          db_match_count: dbMatches.length,
          db_match_count_by_source: {
            invoices: dbMatches.filter(s => s.source === 'invoice').length,
            tedarikciler: dbMatches.filter(s => s.source === 'manual').length,
          },
          matched_suppliers: dbMatches.map(s => ({
            id: s.id,
            name: s.name,
            tax_number: s.taxNo,
            table: s.table,
          })),
          matched_supplier_id: matchedSupplier?.id ?? null,
          matched_supplier_name: matchedSupplier?.name ?? null,
          matched_supplier_tax_number: matchedSupplier?.taxNo ?? null,
          matched_by: matchedBy,
          final_status: finalStatus,
          final_supplier_id: matchedSupplier?.id ?? null,
          supplier_source: matchedSupplier?.source ?? null,
        })
        const supplierMatchMessage = supplierMatch.method === 'tax'
          ? 'Tedarikçi VKN/TCKN ile eşleşti'
          : supplierMatch.method === 'normalized_name'
            ? 'Tedarikçi normalize unvan ile eşleşti'
            : supplierMatch.method === 'similar_name'
              ? `Tedarikçi benzer unvan ile eşleşti (%${Math.round(supplierMatch.score * 100)})`
              : name ? 'Yeni Tedarikçi' : 'Manuel tedarikçi seçimi gerekli'
        const supplierMatchStatus: GelenSupplierMatchStatus = supplierMatch.method === 'none'
          ? 'new'
          : supplierMatch.method === 'similar_name'
            ? 'suspicious'
            : 'existing'
        const categorySuggestion = suggestIncomingExpenseCategory(matchedSupplier?.name ?? name)
        // AI kategorisi önce gelir, yoksa client-side öneri, yoksa varsayılan
        // "Genel Gider" da geçerli — kategori her zaman var
        const aiCategory = inv.gider_kategorisi ?? null
        const initialCategory = categorySuggestion ?? aiCategory ?? DEFAULT_GIDER_KATEGORI
        const hasCategory = !!(aiCategory || categorySuggestion)
        const duplicateStatus: GelenDuplicateStatus = duplicateMatch ? 'duplicate' : 'not_duplicate'
        let parseStatus: GelenParseStatus = 'clean'
        if (ownCompanySupplier || (inv.hata && !isManualWarning && !hasHeaderForManualReview) || (itemCount === 0 && !hasHeaderForManualReview)) {
          parseStatus = 'critical_error'
        } else if (!hasCategory) {
          // Gerçekten kategori yok (ne AI ne öneri var)
          parseStatus = 'manual_review'
        } else if ((isManualWarning || inv.hata || itemCount === 0) && !hasHeaderForManualReview) {
          // Parse kalitesi düşük VE kritik header alanları da eksik
          parseStatus = 'manual_review'
        }
        // Kategori var + header tam → parse uyarıları olsa bile clean
        const importStatus: GelenImportStatus = duplicateStatus === 'duplicate'
          ? 'skipped_duplicate'
          : parseStatus === 'critical_error'
            ? 'blocked'
            : 'importable'

        if (duplicateStatus === 'duplicate') {
          rowStatus = 'duplicate'
          message = 'Bu fatura sistemde zaten mevcut'
        } else if (parseStatus === 'critical_error') {
          rowStatus = 'hata'
          message = ownCompanySupplier
            ? 'Satıcı bizim firma olarak parse edildi; manuel tedarikçi seçimi gerekli'
            : !inv.fatura_no
              ? 'Fatura numarası parse edilemedi, manuel kontrol gerekli'
              : itemCount === 0 && !hasHeaderForManualReview
                ? 'Kalemler tam parse edilemedi, manuel kontrol gerekli'
                : inv.hata ?? 'Parse hatası'
        } else if (parseStatus === 'manual_review') {
          rowStatus = 'manuel_kategori'
          message = itemCount === 0
            ? `Kalemler manuel kontrol gerekli | ${supplierMatchMessage}`
            : isManualWarning || inv.hata
              ? `${inv.hata!} | ${supplierMatchMessage}`
              : supplierMatchMessage
        } else {
          rowStatus = supplierMatchStatus === 'new' ? 'yeni_tedarikci' : 'eklenecek'
          message = supplierMatchMessage
        }
        console.log('[row-state]', {
          invoice_no: inv.fatura_no ?? null,
          supplier_match_status: supplierMatchStatus,
          matched_by: matchedBy,
          duplicate_status: duplicateStatus,
          duplicate_matched_by: duplicateMatchedBy,
          parse_status: parseStatus,
          import_status: importStatus,
          category_suggestion: categorySuggestion,
        })
        console.log('[incoming duplicate check]', {
          preview_invoice_no_raw: inv.fatura_no ?? null,
          preview_invoice_no_normalized: invoiceNo || null,
          preview_supplier_id: matchedSupplier?.id ?? null,
          preview_tax_number: taxNo || null,
          preview_supplier_name_normalized: normalizedName || null,
          duplicate_query_table: 'invoices',
          duplicate_query_fields: ['id', 'invoice_number', 'supplier_name', 'supplier_tax_no'],
          duplicate_match_count: duplicateMatches.length,
          duplicate_matched_invoice_id: duplicateMatch?.id ?? null,
          duplicate_matched_by: duplicateMatchedBy,
          final_row_status: rowStatus,
        })
        if (duplicateStatus === 'duplicate' || parseStatus === 'critical_error') {
          console.log('[gelen import]', {
            satici: inv.satici_adi || null,
            vkn: normVkn(inv.satici_vkn) || null,
            fatura_no: inv.fatura_no,
            kalem_sayisi: itemCount,
            duplicate: rowStatus === 'duplicate',
            eslesme: 'bulunamadı',
            mesaj: message,
          })
        }
        return {
          ...inv,
          hata: rowStatus === 'hata' ? message : inv.hata,
          rowStatus,
          supplierMatchMethod: supplierMatch.method,
          supplierMatchMessage,
          supplierMatchStatus,
          duplicateStatus,
          parseStatus,
          importStatus,
          duplicateMatchedBy,
          categorySuggestion,
          editedName: supplierMatch.supplier?.name ?? name,
          editedVkn: inv.satici_vkn ?? '',
          editedFaturaNo: inv.fatura_no ?? '',
          editedTarih: inv.fatura_tarihi ?? '',
          editedVade: inv.vade_tarihi ?? '',
          editedTutar: inv.odenecek_tutar != null ? String(inv.odenecek_tutar) : '',
          editedKategori: initialCategory,
          sube_id: globalSubeId,
          expanded: false,
        }
      })

      setPreviewRows(preview)
      setActivePreviewFilter(null)
      setSelectedPreviewRows(new Set())
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
        .filter(r => r.importStatus === 'importable')
        .map(r => ({
          filename:        r.filename,
          fatura_no:       r.editedFaturaNo.trim() || (r.fatura_no ?? ''),
          fatura_tarihi:   r.editedTarih || r.fatura_tarihi || new Date().toISOString().split('T')[0],
          vade_tarihi:     r.editedVade || r.vade_tarihi || null,
          senaryo:         r.senaryo ?? null,
          satici_adi:      r.editedName.trim() || (r.satici_adi ?? 'Bilinmiyor'),
          satici_vkn:      r.editedVkn.trim() || r.satici_vkn || null,
          kdv_matrahi:     r.kdv_matrahi ?? null,
          kdv_tutari:      r.kdv_tutari ?? null,
          odenecek_tutar:  r.editedTutar ? Number(r.editedTutar) : (r.odenecek_tutar ?? null),
          kalemler:        r.kalemler ?? [],
          banka_bilgileri: r.banka_bilgileri ?? [],
          gider_kategorisi: r.editedKategori,
          bakiye_notu:     r.bakiye_notu ?? null,
          tedarikci_adres: r.tedarikci_adres ?? null,
          sube_id:         r.sube_id ?? null,
        }))

      const res = await fetch('/api/gelen-pdf-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: rowsToSend }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Kayıt hatası')

      const dupCount = previewRows.filter(r => r.importStatus !== 'importable').length
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
    setSelectedPreviewRows(new Set())
  }

  function resetAll() {
    setStep('upload')
    setPreviewRows([])
    setImportResult(null)
    setError('')
    setActivePreviewFilter(null)
    setSelectedPreviewRows(new Set())
  }

  function applyGlobalSube(subeId: string | null) {
    setGlobalSubeId(subeId)
    setPreviewRows(prev => prev.map(r => ({ ...r, sube_id: subeId })))
  }

  function toggleRowSelection(idx: number) {
    setSelectedPreviewRows(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  function setVisibleSelection(indexes: number[], checked: boolean) {
    setSelectedPreviewRows(prev => {
      const next = new Set(prev)
      for (const idx of indexes) {
        if (checked) next.add(idx)
        else next.delete(idx)
      }
      return next
    })
  }

  function applyBulkCategory() {
    if (selectedPreviewRows.size === 0) return
    setPreviewRows(prev => prev.map((row, idx) => selectedPreviewRows.has(idx) ? applyIncomingCategory(row, bulkCategory) : row))
    setSelectedPreviewRows(new Set())
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
          className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-12 text-center cursor-pointer hover:border-[#C8102E] hover:bg-red-50 transition-colors"
        >
          <input ref={fileRef} type="file" accept=".zip,.pdf" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
          <div className="space-y-2">
            <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">ZIP veya PDF dosyası seçin ya da sürükleyin</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">Tek fatura için PDF, çoklu fatura için ZIP</p>
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
          <p className="text-gray-700 dark:text-gray-300 font-medium">Gelen fatura PDF'leri analiz ediliyor...</p>
          <p className="text-sm text-gray-400 dark:text-gray-500">Satıcı bilgileri ve ürün kalemleri çıkarılıyor.</p>
        </div>
      </div>
    )
  }

  // ── Önizleme ──────────────────────────────────────────
  if (step === 'preview') {
    const eklenecek    = previewRows.filter(r => r.supplierMatchStatus === 'existing' && r.duplicateStatus !== 'duplicate').length
    const yeniTed      = previewRows.filter(r => r.supplierMatchStatus === 'new' && r.duplicateStatus !== 'duplicate').length
    const duplicate    = previewRows.filter(r => r.duplicateStatus === 'duplicate').length
    const manuelKat    = previewRows.filter(r => r.parseStatus === 'manual_review').length
    const hatali       = previewRows.filter(r => r.parseStatus === 'critical_error').length
    const importable   = previewRows.filter(r => r.importStatus === 'importable').length
    const toplamTutar  = previewRows
      .filter(r => r.importStatus === 'importable')
      .reduce((s, r) => s + (r.odenecek_tutar ?? 0), 0)
    const filterLabels: Record<GelenPrimaryPreviewStatus, string> = {
      existing_supplier: 'Tedarikçi Mevcut',
      new_supplier: 'Yeni Tedarikçi',
      duplicate: 'Duplicate',
      manual_review: 'Manuel Kategori',
      parse_error: 'Parse Hatası',
    }
    const visibleRows = previewRows
      .map((row, index) => ({ row, index, primaryStatus: getPrimaryPreviewStatus(row) }))
      .filter(({ row }) => {
        if (!activePreviewFilter) return true
        if (activePreviewFilter === 'existing_supplier') return row.supplierMatchStatus === 'existing' && row.duplicateStatus !== 'duplicate'
        if (activePreviewFilter === 'new_supplier') return row.supplierMatchStatus === 'new' && row.duplicateStatus !== 'duplicate'
        if (activePreviewFilter === 'duplicate') return row.duplicateStatus === 'duplicate'
        if (activePreviewFilter === 'manual_review') return row.parseStatus === 'manual_review'
        return row.parseStatus === 'critical_error'
      })
    const selectableVisibleIndexes = visibleRows
      .filter(({ row }) => row.duplicateStatus !== 'duplicate' && row.parseStatus !== 'critical_error')
      .map(({ index }) => index)
    const allVisibleSelected = selectableVisibleIndexes.length > 0 && selectableVisibleIndexes.every(idx => selectedPreviewRows.has(idx))
    const selectedCount = selectedPreviewRows.size
    const setCardFilter = (filter: GelenPrimaryPreviewStatus) => {
      setActivePreviewFilter(current => current === filter ? null : filter)
    }
    const cardClass = (filter: GelenPrimaryPreviewStatus, baseClass: string) =>
      `${baseClass} cursor-pointer text-left transition-colors ${activePreviewFilter === filter ? 'ring-2 ring-[#C8102E] ring-offset-1' : 'hover:border-[#C8102E]'}`

    const erzincanSube = subeler.find(s => s.ad === 'Erzincan Merkez')
    const istanbulSube = subeler.find(s => s.ad === 'İstanbul Şube')

    return (
      <div className="w-full overflow-x-hidden p-6 space-y-4 max-w-6xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={resetAll} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700">← Geri</button>
            <span className="text-gray-300">/</span>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Önizleme</h2>
            <span className="text-xs text-gray-400 dark:text-gray-500">{previewRows.length} PDF</span>
          </div>
          <button
            onClick={handleImport}
            disabled={importable === 0}
            className="bg-[#C8102E] text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-[#a50d26] disabled:opacity-40"
          >
            Tümünü İçe Aktar
          </button>
        </div>

        <div className="grid grid-cols-6 gap-2">
          <button type="button" onClick={() => setCardFilter('existing_supplier')} className={cardClass('existing_supplier', 'bg-green-50 border border-green-200 rounded-lg p-3')}>
            <div className="text-xs text-green-600 font-medium">Tedarikçi Mevcut</div>
            <div className="text-2xl font-bold text-green-700">{eklenecek}</div>
            <div className="text-xs text-green-600">eklenecek</div>
          </button>
          <button type="button" onClick={() => setCardFilter('new_supplier')} className={cardClass('new_supplier', 'bg-yellow-50 border border-yellow-200 rounded-lg p-3')}>
            <div className="text-xs text-yellow-700 font-medium">Yeni Tedarikçi</div>
            <div className="text-2xl font-bold text-yellow-700">{yeniTed}</div>
            <div className="text-xs text-yellow-600">oluşturulacak</div>
          </button>
          <button type="button" onClick={() => setCardFilter('duplicate')} className={cardClass('duplicate', 'bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-3')}>
            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">Duplicate</div>
            <div className="text-2xl font-bold text-gray-500 dark:text-gray-400">{duplicate}</div>
            <div className="text-xs text-gray-400 dark:text-gray-500">atlanacak</div>
          </button>
          <button type="button" onClick={() => setCardFilter('manual_review')} className={cardClass('manual_review', 'bg-orange-50 border border-orange-200 rounded-lg p-3')}>
            <div className="text-xs text-orange-600 font-medium">Manuel Kategori</div>
            <div className="text-2xl font-bold text-orange-600">{manuelKat}</div>
            <div className="text-xs text-orange-500">seçim gerekli</div>
          </button>
          <button type="button" onClick={() => setCardFilter('parse_error')} className={cardClass('parse_error', 'bg-red-50 border border-red-200 rounded-lg p-3')}>
            <div className="text-xs text-red-600 font-medium">Parse Hatası</div>
            <div className="text-2xl font-bold text-red-600">{hatali}</div>
            <div className="text-xs text-red-500">manuel kontrol</div>
          </button>
          <div className="bg-white dark:bg-gray-800 border rounded-lg p-3">
            <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">Toplam Tutar</div>
            <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{fmtAmt(toplamTutar)}</div>
          </div>
        </div>

        {activePreviewFilter && (
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
            <span>Aktif filtre: <span className="font-semibold">{filterLabels[activePreviewFilter]}</span></span>
            <span className="text-gray-400">({visibleRows.length} kayıt)</span>
            <button type="button" onClick={() => setActivePreviewFilter(null)} className="ml-auto text-[#C8102E] hover:underline">
              Tümünü Göster
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm">
          <span className="font-medium text-orange-800">{selectedCount} kayıt seçili</span>
          <button
            type="button"
            onClick={() => setVisibleSelection(selectableVisibleIndexes, !allVisibleSelected)}
            disabled={selectableVisibleIndexes.length === 0}
            className="rounded-lg border border-orange-300 bg-white px-3 py-1.5 text-xs font-medium text-orange-800 hover:bg-orange-100 disabled:opacity-40"
          >
            {allVisibleSelected ? 'Görünür Seçimi Kaldır' : 'Görünürleri Seç'}
          </button>
          <button
            type="button"
            onClick={() => setSelectedPreviewRows(new Set())}
            disabled={selectedCount === 0}
            className="rounded-lg border border-orange-300 bg-white px-3 py-1.5 text-xs font-medium text-orange-800 hover:bg-orange-100 disabled:opacity-40"
          >
            Seçimi Temizle
          </button>
          <select
            value={bulkCategory}
            onChange={e => setBulkCategory(e.target.value)}
            className="ml-auto min-w-[190px] rounded-lg border border-orange-300 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
          >
            {GIDER_KATEGORILERI.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <button
            type="button"
            onClick={applyBulkCategory}
            disabled={selectedCount === 0}
            className="rounded-lg bg-[#C8102E] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#a50d26] disabled:opacity-40"
          >
            Toplu Kategori Ata
          </button>
        </div>

        {/* Global Şube Seçici */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-blue-800">Tüm Faturalara Şube:</span>
          <select
            value={globalSubeId ?? ''}
            onChange={e => applyGlobalSube(e.target.value || null)}
            className="border border-blue-300 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
          >
            <option value="">— Şube seçin</option>
            {subeler.map(s => <option key={s.id} value={s.id}>{s.ad}</option>)}
          </select>
          <span className="text-blue-400 text-xs">veya hızlı:</span>
          {erzincanSube && (
            <button onClick={() => applyGlobalSube(erzincanSube.id)}
              className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-800 px-3 py-1.5 rounded-lg font-medium transition-colors">
              Tümünü Erzincan'a Ata
            </button>
          )}
          {istanbulSube && (
            <button onClick={() => applyGlobalSube(istanbulSube.id)}
              className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-800 px-3 py-1.5 rounded-lg font-medium transition-colors">
              Tümünü İstanbul'a Ata
            </button>
          )}
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>}

        {editRowIdx !== null && (
          <GelenPdfEditModal
            row={previewRows[editRowIdx]}
            rowIdx={editRowIdx}
            subeler={subeler}
            onClose={() => setEditRowIdx(null)}
            onSave={(idx, updated) => {
              setPreviewRows(prev => prev.map((r, i) => {
                if (i !== idx) return r
                const merged = { ...r, ...updated }
                if (merged.duplicateStatus !== 'duplicate') {
                  const hasRequired = !!merged.editedName.trim() && !!merged.editedFaturaNo.trim() && !!merged.editedTutar && (merged.kalemler?.length ?? 0) > 0
                  const forcedExistingByTax = merged.supplierMatchMethod === 'tax'
                  if (!hasRequired) {
                    merged.rowStatus = 'hata'
                    merged.parseStatus = 'critical_error'
                    merged.importStatus = 'blocked'
                    merged.hata = 'Eksik veri var, manuel kontrol gerekli'
                  } else {
                    Object.assign(merged, applyIncomingCategory(merged, merged.editedKategori))
                  }
                  if (forcedExistingByTax && merged.parseStatus !== 'critical_error') {
                    merged.supplierMatchMessage = 'Tedarikçi VKN/TCKN ile eşleşti'
                  }
                }
                console.log('[gelen edit final]', {
                  fatura_no: merged.editedFaturaNo,
                  satici: merged.editedName,
                  vkn: normVkn(merged.editedVkn) || null,
                  toplam_tutar: merged.editedTutar,
                  kalem_sayisi: merged.kalemler?.length ?? 0,
                  supplier_match_method: merged.supplierMatchMethod,
                  durum: merged.rowStatus,
                })
                return merged
              }))
            }}
          />
        )}

        <div className="w-full overflow-x-auto bg-white dark:bg-gray-800 border rounded-xl">
          <table className="w-full min-w-[1120px] table-fixed text-sm">
            <colgroup>
              <col className="w-[42px]" />
              <col className="w-[96px]" />
              <col className="w-[220px]" />
              <col className="w-[118px]" />
              <col className="w-[106px]" />
              <col className="w-[150px]" />
              <col className="w-[126px]" />
              <col className="w-[64px]" />
              <col className="w-[112px]" />
              <col className="w-[42px]" />
              <col className="w-[60px]" />
              <col className="w-[26px]" />
            </colgroup>
            <thead className="bg-gray-50 dark:bg-gray-700 border-b">
              <tr>
                <th className="px-2 py-3">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={e => setVisibleSelection(selectableVisibleIndexes, e.target.checked)}
                    disabled={selectableVisibleIndexes.length === 0}
                    className="h-4 w-4 rounded border-gray-300 text-[#C8102E] focus:ring-[#C8102E]"
                    aria-label="Görünür satırları seç"
                  />
                </th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Durum</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Tedarikçi</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Fatura No</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Tarih / Vade</th>
                <th className="text-left px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Kategori</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase w-28">Şube</th>
                <th className="text-right px-2 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Kalem</th>
                <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Tutar</th>
                <th className="px-1 py-3" />
                <th className="px-1 py-3" />
                <th className="px-1 py-3" />
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(({ row, index: idx, primaryStatus }) => {
                const isDup     = primaryStatus === 'duplicate'
                const isYeni    = primaryStatus === 'new_supplier'
                const isHata    = primaryStatus === 'parse_error'
                const isManuel  = primaryStatus === 'manual_review'
                const isExistingSupplier = primaryStatus === 'existing_supplier'

                const rowBg = isDup    ? 'bg-gray-50 dark:bg-gray-700 opacity-60'
                  : isYeni   ? 'bg-yellow-50'
                  : isHata   ? 'bg-red-50'
                  : isManuel ? 'bg-orange-50'
                  : 'bg-white dark:bg-gray-800'

                const badge = isDup
                  ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600 dark:text-gray-300">Duplicate</span>
                  : isHata
                  ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">Parse Hatası</span>
                  : isManuel
                  ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200">Manuel Kategori</span>
                  : isExistingSupplier
                  ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">Tedarikçi Mevcut</span>
                  : isYeni
                  ? <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-200">Yeni Tedarikçi</span>
                  : <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200">Eklenecek</span>

                const subeAdi = row.sube_id ? (subeler.find(s => s.id === row.sube_id)?.ad ?? '?') : <span className="text-gray-300">—</span>

                return (
                  <React.Fragment key={idx}>
                    <tr className={`${rowBg} border-t align-top`}>
                      <td className="px-2 py-2.5 text-center">
                        {!isDup && !isHata ? (
                          <input
                            type="checkbox"
                            checked={selectedPreviewRows.has(idx)}
                            onChange={() => toggleRowSelection(idx)}
                            className="h-4 w-4 rounded border-gray-300 text-[#C8102E] focus:ring-[#C8102E]"
                            aria-label="Satırı seç"
                          />
                        ) : null}
                      </td>
                      <td className="px-3 py-2.5 overflow-hidden">{badge}</td>
                      <td className="px-3 py-2.5 overflow-hidden">
                        {(isYeni || isManuel) && !isExistingSupplier && !isDup && !isHata ? (
                          <input
                            value={row.editedName}
                            onChange={e => setPreviewRows(prev => prev.map((r, i) => i === idx ? { ...r, editedName: e.target.value } : r))}
                            className="w-full min-w-0 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                          />
                        ) : (
                          <span className="block truncate text-gray-900 dark:text-gray-100 font-medium" title={row.satici_adi ?? undefined}>{row.satici_adi || <span className="text-gray-400 dark:text-gray-500 italic">Bilinmiyor</span>}</span>
                        )}
                        {row.satici_vkn && (
                          <div className="truncate text-xs text-gray-400 dark:text-gray-500 font-mono">{row.satici_vkn}</div>
                        )}
                        {row.supplierMatchMessage && (
                          <div className="truncate text-xs text-gray-500 dark:text-gray-400" title={row.supplierMatchMessage}>
                            {row.supplierMatchMessage}
                          </div>
                        )}
                        {isDup && <div className="max-h-10 overflow-hidden text-xs leading-snug text-gray-500 mt-0.5">Bu fatura sistemde zaten mevcut</div>}
                        {isHata && row.hata && <div className="max-h-10 overflow-hidden break-words text-xs leading-snug text-red-600 mt-0.5" title={row.hata}>{row.hata}</div>}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-700 dark:text-gray-300 overflow-hidden truncate" title={row.fatura_no ?? undefined}>
                        {row.fatura_no ?? <span className="text-gray-400 dark:text-gray-500">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-gray-600 dark:text-gray-300 whitespace-nowrap text-xs">
                        <div>{row.fatura_tarihi ?? '—'}</div>
                        {row.vade_tarihi && (
                          <div className="text-orange-500">vade: {row.vade_tarihi}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 overflow-hidden">
                        {!isHata && !isDup ? (
                          <>
                            <select
                              value={row.editedKategori}
                              onChange={e => setPreviewRows(prev => prev.map((r, i) => {
                                if (i !== idx) return r
                                return applyIncomingCategory(r, e.target.value)
                              }))}
                              className="w-full min-w-0 text-xs border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#C8102E] bg-white dark:bg-gray-800"
                            >
                              {GIDER_KATEGORILERI.map(k => (
                                <option key={k} value={k}>{k}</option>
                              ))}
                            </select>
                            {row.categorySuggestion && (
                              <div className="mt-1 truncate text-[11px] text-orange-700" title={`Öneri: ${row.categorySuggestion}`}>
                                Öneri: {row.categorySuggestion}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-gray-400 dark:text-gray-500">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-gray-600 dark:text-gray-300 overflow-hidden">
                        {!isDup && !isHata ? (
                          <select
                            value={row.sube_id ?? ''}
                            onChange={e => setPreviewRows(prev => prev.map((r, i) => i === idx ? { ...r, sube_id: e.target.value || null } : r))}
                            className="w-full min-w-0 text-xs border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-[#C8102E] bg-white dark:bg-gray-800"
                          >
                            <option value="">—</option>
                            {subeler.map(s => <option key={s.id} value={s.id}>{s.ad}</option>)}
                          </select>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-right text-gray-600 dark:text-gray-300 overflow-hidden">
                        {isHata ? (
                          <span className="inline-block max-w-full truncate align-bottom text-red-500 text-xs" title={row.hata ?? undefined}>{row.hata?.slice(0, 30)}</span>
                        ) : (
                          row.kalemler?.length ?? 0
                        )}
                      </td>
                      <td className={`px-3 py-2.5 text-right font-semibold whitespace-nowrap ${isDup ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-gray-100'}`}>
                        {row.editedTutar ? fmtAmt(Number(row.editedTutar)) : fmtAmt(row.odenecek_tutar)}
                      </td>
                      <td className="px-1 py-2.5 text-center">
                        {!isHata && (row.kalemler?.length ?? 0) > 0 && (
                          <button
                            onClick={() => toggleExpand(idx)}
                            className="inline-flex w-full justify-center text-gray-400 dark:text-gray-500 hover:text-gray-600 text-xs"
                            title="Kalemleri göster"
                          >
                            {row.expanded ? '▲' : '▼'}
                          </button>
                        )}
                      </td>
                      <td className="px-1 py-2.5 text-center">
                        <button
                          onClick={() => setEditRowIdx(idx)}
                          className="inline-flex w-full justify-center text-gray-400 dark:text-gray-500 hover:text-blue-500 transition-colors text-xs whitespace-nowrap"
                          title="Düzenle"
                        >
                          Düzenle
                        </button>
                      </td>
                      <td className="px-1 py-2.5 text-center">
                        <button
                          onClick={() => removeRow(idx)}
                          className="inline-flex w-full justify-center text-gray-300 hover:text-red-500 transition-colors text-base leading-none"
                          title="Listeden kaldır"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                    {row.expanded && (row.kalemler?.length ?? 0) > 0 && (
                      <tr key={`${idx}-items`} className={`${rowBg} border-t border-dashed`}>
                        <td colSpan={12} className="px-3 pb-3 pt-1">
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
                          <div className="w-full overflow-x-auto bg-white dark:bg-gray-800 border rounded-lg">
                            <table className="min-w-full text-xs">
                              <thead className="bg-gray-50 dark:bg-gray-700 border-b">
                                <tr>
                                  <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400">#</th>
                                  <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400">Ürün / Hizmet</th>
                                  <th className="text-right px-3 py-2 text-gray-500 dark:text-gray-400">Miktar</th>
                                  <th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400">Birim</th>
                                  <th className="text-right px-3 py-2 text-gray-500 dark:text-gray-400">Birim Fiyat</th>
                                  <th className="text-right px-3 py-2 text-gray-500 dark:text-gray-400">KDV %</th>
                                  <th className="text-right px-3 py-2 text-gray-500 dark:text-gray-400">Satır Toplam</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {(row.kalemler ?? []).map((k, ki) => (
                                  <tr key={ki} className="hover:bg-gray-50">
                                    <td className="px-3 py-1.5 text-gray-400 dark:text-gray-500">{ki + 1}</td>
                                    <td className="px-3 py-1.5 max-w-[200px] truncate text-gray-800 dark:text-gray-200" title={k.urun_adi}>{k.urun_adi}</td>
                                    <td className="px-3 py-1.5 text-right text-gray-700 dark:text-gray-300">{k.miktar}</td>
                                    <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400">{k.birim}</td>
                                    <td className="px-3 py-1.5 text-right text-gray-700 dark:text-gray-300">{fmtAmt(k.birim_fiyat)}</td>
                                    <td className="px-3 py-1.5 text-right text-gray-600 dark:text-gray-300">%{k.kdv_orani}</td>
                                    <td className="px-3 py-1.5 text-right font-medium text-gray-900 dark:text-gray-100">{fmtAmt(k.satir_toplam)}</td>
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
            disabled={importable === 0}
            className="flex-1 bg-[#C8102E] text-white py-3 rounded-lg font-semibold hover:bg-[#a50d26] disabled:opacity-40"
          >
            İçe Aktar ({importable} fatura)
          </button>
          <button onClick={resetAll} className="px-8 py-3 border rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50">
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
          <p className="text-gray-700 dark:text-gray-300 font-medium">Gelen faturalar kaydediliyor...</p>
          <p className="text-sm text-gray-400 dark:text-gray-500">Lütfen bekleyin, sayfayı kapatmayın.</p>
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
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">İçe Aktarma Sonucu</h2>
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-green-700">{eklendi}</div>
            <div className="text-xs text-green-600 mt-1 font-medium">Fatura Eklendi</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-blue-700">{yeniTedarikci}</div>
            <div className="text-xs text-blue-600 mt-1 font-medium">Yeni Tedarikçi</div>
          </div>
          <div className="bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-gray-500 dark:text-gray-400">{atilandi}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-medium">Atlandı</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{hatalılar.length}</div>
            <div className="text-xs text-red-500 mt-1 font-medium">Hatalı</div>
          </div>
        </div>

        {Object.keys(kategoriOzet ?? {}).length > 0 && (
          <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Kategoriye Göre Gider</h3>
            </div>
            <div className="divide-y">
              {Object.entries(kategoriOzet).map(([kat, sayi]) => (
                <div key={kat} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-sm text-gray-700 dark:text-gray-300">{kat}</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{sayi} fatura</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {eklenenler.length > 0 && (
          <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Eklenen Faturalar</h3>
            </div>
            <div className="divide-y max-h-52 overflow-y-auto">
              {eklenenler.map((r, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{r.satici_adi}</span>
                    {r.tedarikci_yeni && (
                      <span className="ml-2 text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full">Yeni Tedarikçi</span>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">{r.fatura_no}</span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">·</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{r.gider_kategorisi}</span>
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
          <div className="bg-white dark:bg-gray-800 border border-red-200 rounded-xl overflow-hidden">
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
            className="px-6 py-3 border rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 text-center">
            Gider Raporu
          </Link>
          <button onClick={resetAll} className="px-6 py-3 border rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50">
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
      <div className="bg-white dark:bg-gray-800 border-b px-6 flex-shrink-0">
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
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 hover:border-gray-300'
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
    <Suspense fallback={<div className="p-6 text-center text-sm text-gray-400 dark:text-gray-500">Yükleniyor...</div>}>
      <TabContent />
    </Suspense>
  )
}
