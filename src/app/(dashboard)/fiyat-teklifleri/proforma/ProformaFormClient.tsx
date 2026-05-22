'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import SubeSelect from '@/components/SubeSelect'
import TedarikciTeklifModal, { type ParsedKalem, type ParsedTeklif } from '@/components/TedarikciTeklifModal'

// ─── Türkçe sayı yazıya çevirme ───────────────────────────────────
const BIRLER = ['', 'Bir', 'İki', 'Üç', 'Dört', 'Beş', 'Altı', 'Yedi', 'Sekiz', 'Dokuz']
const ONLAR  = ['', 'On', 'Yirmi', 'Otuz', 'Kırk', 'Elli', 'Altmış', 'Yetmiş', 'Seksen', 'Doksan']
const BINLER = ['', 'Bin', 'Milyon', 'Milyar']

function ucHaneYaz(n: number): string {
  if (n === 0) return ''
  const yuz = Math.floor(n / 100), on = Math.floor((n % 100) / 10), bir = n % 10
  let s = ''
  if (yuz === 1) s += 'Yüz'; else if (yuz > 1) s += BIRLER[yuz] + 'Yüz'
  return s + ONLAR[on] + BIRLER[bir]
}

function tutarYaziya(tutar: number): string {
  if (tutar === 0) return 'Sıfır TL'
  const tam   = Math.floor(tutar)
  const kurus = Math.round((tutar - tam) * 100)
  let sonuc   = ''
  const gruplar: number[] = []
  let kalan = tam
  while (kalan > 0) { gruplar.push(kalan % 1000); kalan = Math.floor(kalan / 1000) }
  if (!gruplar.length) gruplar.push(0)
  for (let i = gruplar.length - 1; i >= 0; i--) {
    const g = gruplar[i]; if (!g) continue
    sonuc += (i === 1 && g === 1) ? 'Bin' : ucHaneYaz(g) + BINLER[i]
  }
  let result = 'Yalnız ' + sonuc + ' TL'
  if (kurus > 0) result += ` ${ucHaneYaz(kurus)} Kuruş`
  return result + "'dir"
}

// ─── Tipler ───────────────────────────────────────────────────────
type ParaBirimi = 'TRY' | 'USD' | 'EUR'
type Durum      = 'taslak' | 'gonderildi' | 'onaylandi' | 'iptal' | 'faturalandi'

export type ProformaKalem = {
  id: string
  sira_no: number
  urun_id: string | null
  mal_hizmet: string
  aciklama: string
  miktar: number
  birim: string
  birim_fiyat: number
  iskonto_orani: number
  iskonto_tutari: number
  kdv_orani: number
  kdv_tutari: number
  toplam_tutar: number
}

export type ProformaInitialData = {
  id: string
  proforma_no: string
  tarih: string
  vade_tarihi: string
  teklif_id: string | null
  customer_id: string | null
  musteri_unvan: string
  musteri_adres: string
  musteri_vkn: string
  musteri_vergi_dairesi: string
  musteri_telefon: string
  musteri_email: string
  para_birimi: ParaBirimi
  durum: Durum
  iban: string
  banka_adi: string
  notlar: string
  ozel_sartlar: string
  kalemleri: ProformaKalem[]
  sube_id?: string | null
}

export type ProformaPrefillData = {
  teklif_id: string
  customer_id: string | null
  musteri_unvan: string
  musteri_adres: string
  musteri_vkn: string
  musteri_telefon: string
  musteri_email: string
  kalemleri: Omit<ProformaKalem, 'id' | 'sira_no' | 'iskonto_tutari' | 'kdv_tutari' | 'toplam_tutar'>[]
}

type Musteri = {
  id: string
  full_name: string
  phone?: string | null
  email?: string | null
  address?: string | null
  tax_number?: string | null
  il?: string | null
}

type Urun = {
  id: string
  ad: string
  kategori: string
  kdv_haric_fiyat: number
}

// ─── Sabitler ─────────────────────────────────────────────────────
const BIRIMLER    = ['Adet', 'Kg', 'Lt', 'Metre', 'Kutu', 'Takım', 'Set', 'Hizmet']
const KDV_ORANLARI = [0, 1, 10, 20]
const INPUT       = 'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]'
const IBAN_VARSAYILAN  = 'TR930001000116120045825001'
const BANKA_VARSAYILAN = 'TC ZİRAAT BANKASI / ERZİNCAN ŞUBESİ'

function newKalem(sira: number): ProformaKalem {
  return {
    id: Math.random().toString(36).slice(2),
    sira_no: sira, urun_id: null, mal_hizmet: '', aciklama: '',
    miktar: 1, birim: 'Adet', birim_fiyat: 0,
    iskonto_orani: 0, iskonto_tutari: 0,
    kdv_orani: 20, kdv_tutari: 0, toplam_tutar: 0,
  }
}

function hesaplaKalem(k: ProformaKalem): ProformaKalem {
  const brut          = Math.round(k.miktar * k.birim_fiyat * 100) / 100
  const iskonto_tutari = Math.round(brut * (k.iskonto_orani / 100) * 100) / 100
  const toplam_tutar  = Math.round((brut - iskonto_tutari) * 100) / 100
  const kdv_tutari    = Math.round(toplam_tutar * (k.kdv_orani / 100) * 100) / 100
  return { ...k, iskonto_tutari, toplam_tutar, kdv_tutari }
}

function fmtN(n: number): string {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(n)
}

function paraSembol(para: string) {
  if (para === 'USD') return '$'
  if (para === 'EUR') return '€'
  return '₺'
}

// ─── Bileşen ──────────────────────────────────────────────────────
export default function ProformaFormClient({
  mode,
  initialData,
  prefillData,
}: {
  mode: 'yeni' | 'duzenle'
  initialData?: ProformaInitialData
  prefillData?: ProformaPrefillData
}) {
  const router  = useRouter()
  const supabase = createClient()
  const today   = new Date().toISOString().split('T')[0]

  // ─── Temel bilgiler
  const [proformaNo, setProformaNo] = useState(initialData?.proforma_no ?? '')
  const [tarih, setTarih]           = useState(initialData?.tarih ?? today)
  const [vadeTarihi, setVadeTarihi] = useState(initialData?.vade_tarihi ?? '')
  const [paraBirimi, setParaBirimi] = useState<ParaBirimi>(initialData?.para_birimi ?? 'TRY')
  const [durum, setDurum]           = useState<Durum>(initialData?.durum ?? 'taslak')
  const [teklifId]                  = useState<string | null>(initialData?.teklif_id ?? prefillData?.teklif_id ?? null)
  const [subeId, setSubeId]         = useState<string | null>(initialData?.sube_id ?? null)

  // ─── Müşteri alanları
  const [customerId, setCustomerId]               = useState<string | null>(initialData?.customer_id ?? prefillData?.customer_id ?? null)
  const [musteriUnvan, setMusteriUnvan]           = useState(initialData?.musteri_unvan ?? prefillData?.musteri_unvan ?? '')
  const [musteriAdres, setMusteriAdres]           = useState(initialData?.musteri_adres ?? prefillData?.musteri_adres ?? '')
  const [musteriVkn, setMusteriVkn]               = useState(initialData?.musteri_vkn ?? prefillData?.musteri_vkn ?? '')
  const [musteriVergiDairesi, setMusteriVergiDairesi] = useState(initialData?.musteri_vergi_dairesi ?? '')
  const [musteriTelefon, setMusteriTelefon]       = useState(initialData?.musteri_telefon ?? prefillData?.musteri_telefon ?? '')
  const [musteriEmail, setMusteriEmail]           = useState(initialData?.musteri_email ?? prefillData?.musteri_email ?? '')

  // ─── Müşteri autocomplete
  const [musteriler, setMusteriler]         = useState<Musteri[]>([])
  const [musteriArama, setMusteriArama]     = useState('')
  const [showMusteriDrop, setShowMusteriDrop] = useState(false)
  const musteriRef = useRef<HTMLDivElement>(null)

  // ─── Kalemler
  const [kalemler, setKalemler] = useState<ProformaKalem[]>(() => {
    if (initialData?.kalemleri?.length) return initialData.kalemleri
    if (prefillData?.kalemleri?.length) {
      return prefillData.kalemleri.map((k, i) =>
        hesaplaKalem({ ...newKalem(i + 1), ...k })
      )
    }
    return [newKalem(1)]
  })

  // ─── Ürün autocomplete
  const [urunler, setUrunler]     = useState<Urun[]>([])
  const [acDropId, setAcDropId]   = useState<string | null>(null)
  const [acFiltered, setAcFiltered] = useState<Urun[]>([])
  const acRef = useRef<HTMLDivElement>(null)

  // ─── Ödeme & Notlar
  const [iban, setIban]           = useState(initialData?.iban ?? IBAN_VARSAYILAN)
  const [bankaAdi, setBankaAdi]   = useState(initialData?.banka_adi ?? BANKA_VARSAYILAN)
  const [notlar, setNotlar]       = useState(initialData?.notlar ?? '')
  const [ozelSartlar, setOzelSartlar] = useState(initialData?.ozel_sartlar ?? '')

  // ─── Import
  const [importYukleniyor, setImportYukleniyor]   = useState(false)
  const [importHata, setImportHata]               = useState('')
  const [parsedTeklif, setParsedTeklif]           = useState<ParsedTeklif | null>(null)
  const [showImportModal, setShowImportModal]     = useState(false)
  const importInputRef = useRef<HTMLInputElement>(null)

  // ─── UI
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  // ─── Proforma no yükle (yeni mod)
  useEffect(() => {
    if (mode === 'yeni') {
      supabase.rpc('generate_proforma_no').then(({ data }: { data: string | null; error: any }) => {
        if (data) setProformaNo(data)
      })
    }
  }, [mode])

  // ─── Verileri yükle
  useEffect(() => {
    supabase
      .from('customers')
      .select('id, full_name, phone, email, address, tax_number, il')
      .eq('is_active', true)
      .order('full_name')
      .then(({ data }: { data: any; error: any }) => setMusteriler((data as Musteri[]) ?? []))

    supabase
      .from('urunler')
      .select('id, ad, kategori, kdv_haric_fiyat')
      .then(({ data }: { data: any; error: any }) => setUrunler((data as Urun[]) ?? []))
  }, [])

  // ─── Dışarı tıklamayı dinle
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (musteriRef.current && !musteriRef.current.contains(e.target as Node)) setShowMusteriDrop(false)
      if (acRef.current && !acRef.current.contains(e.target as Node)) setAcDropId(null)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  // ─── Filtered musteriler
  const filteredMusteriler = musteriArama.length >= 1
    ? musteriler.filter(m => m.full_name.toLowerCase().includes(musteriArama.toLowerCase())).slice(0, 10)
    : musteriler.slice(0, 10)

  // ─── Müşteri seç
  function selectMusteri(m: Musteri) {
    setCustomerId(m.id)
    setMusteriUnvan(m.full_name)
    setMusteriAdres(m.address ?? '')
    setMusteriVkn(m.tax_number ?? '')
    setMusteriTelefon(m.phone ?? '')
    setMusteriEmail(m.email ?? '')
    setMusteriArama('')
    setShowMusteriDrop(false)
  }

  // ─── Ürün autocomplete
  function onMalHizmetChange(kalemId: string, val: string) {
    setKalemler(prev => prev.map(k => k.id !== kalemId ? k : { ...k, mal_hizmet: val }))
    const q = val.toLowerCase().trim()
    if (q.length < 1) { setAcDropId(null); return }
    const filtered = urunler.filter(u =>
      u.ad.toLowerCase().includes(q) || u.kategori.toLowerCase().includes(q)
    ).slice(0, 8)
    setAcFiltered(filtered)
    setAcDropId(filtered.length > 0 ? kalemId : null)
  }

  function selectUrun(kalemId: string, urun: Urun) {
    setKalemler(prev => prev.map(k => {
      if (k.id !== kalemId) return k
      return hesaplaKalem({ ...k, urun_id: urun.id, mal_hizmet: urun.ad, birim_fiyat: urun.kdv_haric_fiyat })
    }))
    setAcDropId(null)
  }

  // ─── Kalem güncelle
  const updateKalem = useCallback((kalemId: string, field: keyof ProformaKalem, value: any) => {
    setKalemler(prev => prev.map(k => {
      if (k.id !== kalemId) return k
      return hesaplaKalem({ ...k, [field]: value })
    }))
  }, [])

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setImportHata(''); setImportYukleniyor(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/parse-teklif', { method: 'POST', body: fd })
      if (!res.ok) {
        let errorMessage = 'Dosya analiz edilemedi'
        try {
          const errorText = await res.text()
          try { errorMessage = JSON.parse(errorText).error || errorMessage } catch { errorMessage = errorText.substring(0, 200) || `Sunucu hatası: ${res.status}` }
        } catch { errorMessage = `Sunucu hatası: ${res.status}` }
        throw new Error(errorMessage)
      }
      const json = await res.json()
      if (!json.kalemler || !json.kalemler.length) setImportHata('Dosyadan kalem bulunamadı. Önizleme açılıyor.')
      setParsedTeklif(json as ParsedTeklif)
      setShowImportModal(true)
    } catch (err: unknown) {
      setImportHata(err instanceof Error ? err.message : 'Hata oluştu')
    } finally {
      setImportYukleniyor(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  function handleImportAktar(importedKalemler: ParsedKalem[], paraBirimi: string) {
    const yeni: ProformaKalem[] = importedKalemler.map((k, i) =>
      hesaplaKalem({
        id: Math.random().toString(36).slice(2),
        sira_no: i + 1,
        urun_id: null,
        mal_hizmet: k.aciklama,
        aciklama: '',
        miktar: k.miktar,
        birim: k.birim,
        birim_fiyat: k.birim_fiyat,
        iskonto_orani: 0,
        iskonto_tutari: 0,
        kdv_orani: 20,
        kdv_tutari: 0,
        toplam_tutar: 0,
      })
    )
    setKalemler(prev => [...prev.filter(k => k.mal_hizmet.trim()), ...yeni])
    setParaBirimi((['TRY', 'USD', 'EUR'].includes(paraBirimi) ? paraBirimi : 'TRY') as ParaBirimi)
    setShowImportModal(false)
  }

  function addKalem() {
    setKalemler(prev => [...prev, newKalem(prev.length + 1)])
  }

  function removeKalem(kalemId: string) {
    setKalemler(prev =>
      prev.filter(k => k.id !== kalemId).map((k, i) => ({ ...k, sira_no: i + 1 }))
    )
  }

  // ─── Toplamlar
  const araToplam     = Math.round(kalemler.reduce((s, k) => s + k.toplam_tutar, 0) * 100) / 100
  const toplamIskonto = Math.round(kalemler.reduce((s, k) => s + k.iskonto_tutari, 0) * 100) / 100
  const kdvMatrahi    = araToplam
  const toplamKdv     = Math.round(kalemler.reduce((s, k) => s + k.kdv_tutari, 0) * 100) / 100
  const genelToplam   = Math.round((araToplam + toplamKdv) * 100) / 100
  const sembol        = paraSembol(paraBirimi)

  // ─── Kaydet
  async function handleSave(redirectToPdf = false) {
    if (!musteriUnvan.trim()) { setError('Müşteri unvanı gerekli.'); return }
    if (kalemler.some(k => !k.mal_hizmet.trim())) { setError('Tüm kalemlerde mal/hizmet adı gerekli.'); return }
    setSaving(true)
    setError('')

    const proformaPayload = {
      proforma_no:          proformaNo,
      tarih,
      vade_tarihi:          vadeTarihi || null,
      teklif_id:            teklifId,
      customer_id:          customerId,
      musteri_unvan:        musteriUnvan,
      musteri_adres:        musteriAdres || null,
      musteri_vkn:          musteriVkn || null,
      musteri_vergi_dairesi: musteriVergiDairesi || null,
      musteri_telefon:      musteriTelefon || null,
      musteri_email:        musteriEmail || null,
      para_birimi:          paraBirimi,
      durum,
      iban,
      banka_adi:            bankaAdi,
      notlar:               notlar || null,
      ozel_sartlar:         ozelSartlar || null,
      ara_toplam:           araToplam,
      toplam_iskonto:       toplamIskonto,
      kdv_matrahi:          kdvMatrahi,
      kdv_tutari:           toplamKdv,
      toplam_tutar:         genelToplam,
      sube_id:              subeId || null,
    }

    let proformaId: string

    if (mode === 'yeni') {
      const { data, error: err } = await supabase
        .from('proforma_faturalar')
        .insert(proformaPayload)
        .select('id')
        .single()
      if (err || !data) { setError(err?.message ?? 'Kayıt hatası'); setSaving(false); return }
      proformaId = data.id
    } else {
      proformaId = initialData!.id
      const { error: err } = await supabase
        .from('proforma_faturalar')
        .update(proformaPayload)
        .eq('id', proformaId)
      if (err) { setError(err.message); setSaving(false); return }
      await supabase.from('proforma_fatura_kalemleri').delete().eq('proforma_id', proformaId)
    }

    const kalemPayload = kalemler.map((k, i) => ({
      proforma_id:    proformaId,
      sira_no:        i + 1,
      urun_id:        k.urun_id,
      mal_hizmet:     k.mal_hizmet,
      aciklama:       k.aciklama || null,
      miktar:         k.miktar,
      birim:          k.birim,
      birim_fiyat:    k.birim_fiyat,
      iskonto_orani:  k.iskonto_orani,
      iskonto_tutari: k.iskonto_tutari,
      kdv_orani:      k.kdv_orani,
      kdv_tutari:     k.kdv_tutari,
      toplam_tutar:   k.toplam_tutar,
    }))

    const { error: kalemErr } = await supabase.from('proforma_fatura_kalemleri').insert(kalemPayload)
    if (kalemErr) { setError(kalemErr.message); setSaving(false); return }

    if (redirectToPdf) {
      router.push(`/fiyat-teklifleri/proforma/${proformaId}/pdf`)
    } else {
      router.push('/fiyat-teklifleri/proforma')
      router.refresh()
    }
  }

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-700">

      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#C8102E] rounded-lg flex items-center justify-center text-white font-bold text-sm">P</div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {mode === 'yeni' ? 'Yeni Proforma Fatura' : `Proforma Düzenle — ${initialData?.proforma_no}`}
            </h1>
            <Link href="/fiyat-teklifleri/proforma" className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600">
              ← Proforma Listesi
            </Link>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/fiyat-teklifleri/proforma"
            className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
            İptal
          </Link>
          <button onClick={() => handleSave(false)} disabled={saving}
            className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors disabled:opacity-50">
            {saving ? 'Kaydediliyor...' : 'Kaydet (Taslak)'}
          </button>
          <button onClick={() => handleSave(true)} disabled={saving}
            className="bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26] transition-colors disabled:opacity-50">
            Kaydet ve PDF
          </button>
        </div>
      </div>

      <div className="p-6 max-w-5xl mx-auto space-y-6">

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        {/* ─── Genel Bilgiler */}
        <div className="bg-white dark:bg-gray-800 border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Genel Bilgiler</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Proforma No</label>
              <input type="text" value={proformaNo} readOnly
                className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 font-mono text-gray-600 dark:text-gray-300" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Tarih</label>
              <input type="date" value={tarih} onChange={e => setTarih(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Vade Tarihi</label>
              <input type="date" value={vadeTarihi} onChange={e => setVadeTarihi(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Para Birimi</label>
              <select value={paraBirimi} onChange={e => setParaBirimi(e.target.value as ParaBirimi)} className={INPUT}>
                <option value="TRY">TRY</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Durum</label>
              <select value={durum} onChange={e => setDurum(e.target.value as Durum)} className={INPUT}>
                <option value="taslak">Taslak</option>
                <option value="gonderildi">Gönderildi</option>
                <option value="onaylandi">Onaylandı</option>
                <option value="faturalandi">Faturalandı</option>
                <option value="iptal">İptal</option>
              </select>
            </div>
            <div>
              <SubeSelect value={subeId} onChange={setSubeId} label="Şube" />
            </div>
          </div>
        </div>

        {/* ─── Müşteri Bilgileri */}
        <div className="bg-white dark:bg-gray-800 border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Müşteri Bilgileri</h2>

          <div className="relative mb-4" ref={musteriRef}>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Kayıtlı Müşteriden Ara</label>
            <input
              type="text"
              value={musteriArama}
              onChange={e => { setMusteriArama(e.target.value); setShowMusteriDrop(true) }}
              onFocus={() => setShowMusteriDrop(true)}
              placeholder="Müşteri adı ile ara ve otomatik doldur..."
              className={INPUT}
            />
            {showMusteriDrop && filteredMusteriler.length > 0 && (
              <div className="absolute z-20 w-full bg-white dark:bg-gray-800 border rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                {filteredMusteriler.map(m => (
                  <button key={m.id} type="button"
                    onMouseDown={() => selectMusteri(m)}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 border-b last:border-0">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{m.full_name}</div>
                    {m.il && <div className="text-xs text-gray-400 dark:text-gray-500">{m.il}</div>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Müşteri Unvanı *</label>
              <input type="text" value={musteriUnvan} onChange={e => setMusteriUnvan(e.target.value)}
                className={INPUT} placeholder="Firma veya kişi adı" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Adres</label>
              <textarea value={musteriAdres} onChange={e => setMusteriAdres(e.target.value)}
                className={INPUT} rows={2} placeholder="Müşteri adresi" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">VKN / TC</label>
              <input type="text" value={musteriVkn} onChange={e => setMusteriVkn(e.target.value)}
                className={INPUT} placeholder="Vergi kimlik no" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Vergi Dairesi</label>
              <input type="text" value={musteriVergiDairesi} onChange={e => setMusteriVergiDairesi(e.target.value)}
                className={INPUT} placeholder="Vergi dairesi adı" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Telefon</label>
              <input type="text" value={musteriTelefon} onChange={e => setMusteriTelefon(e.target.value)}
                className={INPUT} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">E-posta</label>
              <input type="email" value={musteriEmail} onChange={e => setMusteriEmail(e.target.value)}
                className={INPUT} />
            </div>
          </div>
        </div>

        {/* ─── Kalem Tablosu */}
        <div className="bg-white dark:bg-gray-800 border rounded-lg p-5" ref={acRef}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Kalemler</h2>
            <div className="flex items-center gap-2">
              {importHata && <span className="text-xs text-red-600">{importHata}</span>}
              <button
                type="button"
                onClick={() => importInputRef.current?.click()}
                disabled={importYukleniyor}
                className="text-xs border border-blue-300 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-50 disabled:opacity-50"
              >
                {importYukleniyor ? '⏳ Ayrıştırılıyor...' : "📄 PDF/Excel'den Aktar"}
              </button>
              <input ref={importInputRef} type="file" accept=".pdf,.xlsx,.xls,.csv" onChange={handleImport} className="hidden" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="border-b bg-gray-50 dark:bg-gray-700 text-xs text-gray-500 dark:text-gray-400">
                  <th className="px-2 py-2 text-center w-8">#</th>
                  <th className="px-2 py-2 text-left">Mal / Hizmet</th>
                  <th className="px-2 py-2 text-center w-20">Miktar</th>
                  <th className="px-2 py-2 text-center w-24">Birim</th>
                  <th className="px-2 py-2 text-right w-28">Birim Fiyat</th>
                  <th className="px-2 py-2 text-center w-20">İsk.%</th>
                  <th className="px-2 py-2 text-right w-24">İsk.Tutar</th>
                  <th className="px-2 py-2 text-center w-20">KDV%</th>
                  <th className="px-2 py-2 text-right w-24">KDV Tutar</th>
                  <th className="px-2 py-2 text-right w-28">Toplam</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody>
                {kalemler.map((k, idx) => (
                  <tr key={k.id} className="border-b last:border-0 align-top">
                    <td className="px-2 py-2 text-center text-gray-400 dark:text-gray-500 text-xs pt-3">{idx + 1}</td>
                    <td className="px-2 py-2 relative">
                      <input
                        type="text"
                        value={k.mal_hizmet}
                        onChange={e => onMalHizmetChange(k.id, e.target.value)}
                        onFocus={() => {
                          if (k.mal_hizmet.length >= 1) {
                            const filtered = urunler.filter(u =>
                              u.ad.toLowerCase().includes(k.mal_hizmet.toLowerCase())
                            ).slice(0, 8)
                            setAcFiltered(filtered)
                            if (filtered.length) setAcDropId(k.id)
                          }
                        }}
                        placeholder="Mal/hizmet adı..."
                        className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E] min-w-[200px]"
                      />
                      {acDropId === k.id && acFiltered.length > 0 && (
                        <div className="absolute z-30 left-2 w-80 bg-white dark:bg-gray-800 border rounded-lg shadow-lg mt-0.5 max-h-40 overflow-y-auto">
                          {acFiltered.map(u => (
                            <button key={u.id} type="button"
                              onMouseDown={() => selectUrun(k.id, u)}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 border-b last:border-0">
                              <div className="font-medium text-gray-900 dark:text-gray-100">{u.ad}</div>
                              <div className="text-gray-400 dark:text-gray-500">{u.kategori} · {fmtN(u.kdv_haric_fiyat)} {sembol}</div>
                            </button>
                          ))}
                        </div>
                      )}
                      <input
                        type="text"
                        value={k.aciklama}
                        onChange={e => updateKalem(k.id, 'aciklama', e.target.value)}
                        placeholder="Açıklama (opsiyonel)"
                        className="w-full border rounded px-2 py-1 text-xs text-gray-500 dark:text-gray-400 mt-1 focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" value={k.miktar} min="0" step="0.01"
                        onChange={e => updateKalem(k.id, 'miktar', parseFloat(e.target.value) || 0)}
                        className="w-full border rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />
                    </td>
                    <td className="px-2 py-2">
                      <select value={k.birim} onChange={e => updateKalem(k.id, 'birim', e.target.value)}
                        className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E]">
                        {BIRIMLER.map(b => <option key={b} value={b}>{b}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" value={k.birim_fiyat} min="0" step="0.01"
                        onChange={e => updateKalem(k.id, 'birim_fiyat', parseFloat(e.target.value) || 0)}
                        className="w-full border rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />
                    </td>
                    <td className="px-2 py-2">
                      <input type="number" value={k.iskonto_orani} min="0" max="100" step="0.01"
                        onChange={e => updateKalem(k.id, 'iskonto_orani', parseFloat(e.target.value) || 0)}
                        className="w-full border rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />
                    </td>
                    <td className="px-2 py-2 text-right text-xs text-gray-500 dark:text-gray-400 pt-3 pr-3">
                      {fmtN(k.iskonto_tutari)}
                    </td>
                    <td className="px-2 py-2">
                      <select value={k.kdv_orani} onChange={e => updateKalem(k.id, 'kdv_orani', parseFloat(e.target.value))}
                        className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E]">
                        {KDV_ORANLARI.map(r => <option key={r} value={r}>%{r}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-2 text-right text-xs text-gray-500 dark:text-gray-400 pt-3 pr-3">
                      {fmtN(k.kdv_tutari)}
                    </td>
                    <td className="px-2 py-2 text-right font-medium pt-3">
                      {fmtN(k.toplam_tutar)} {sembol}
                    </td>
                    <td className="px-2 py-2 pt-2.5">
                      {kalemler.length > 1 && (
                        <button type="button" onClick={() => removeKalem(k.id)}
                          className="text-red-400 hover:text-red-600 text-xl leading-none font-bold">
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={addKalem}
            className="mt-3 text-sm text-[#C8102E] hover:underline font-medium">
            + Satır Ekle
          </button>
        </div>

        {/* ─── Toplamlar */}
        <div className="bg-white dark:bg-gray-800 border rounded-lg p-5">
          <div className="flex justify-end">
            <table className="text-sm" style={{ width: 320 }}>
              <tbody>
                <tr>
                  <td className="py-1.5 text-gray-500 dark:text-gray-400 pr-8">Mal/Hizmet Toplam Tutarı</td>
                  <td className="py-1.5 text-right font-medium">{fmtN(araToplam)} {sembol}</td>
                </tr>
                <tr>
                  <td className="py-1.5 text-gray-500 dark:text-gray-400">Toplam İskonto</td>
                  <td className="py-1.5 text-right text-red-600">-{fmtN(toplamIskonto)} {sembol}</td>
                </tr>
                <tr>
                  <td className="py-1.5 text-gray-500 dark:text-gray-400">KDV Matrahı</td>
                  <td className="py-1.5 text-right font-medium">{fmtN(kdvMatrahi)} {sembol}</td>
                </tr>
                <tr>
                  <td className="py-1.5 text-gray-500 dark:text-gray-400">Hesaplanan KDV</td>
                  <td className="py-1.5 text-right font-medium">{fmtN(toplamKdv)} {sembol}</td>
                </tr>
                <tr className="border-t">
                  <td className="pt-2 pb-1 font-bold text-gray-900 dark:text-gray-100">Vergiler Dahil Toplam</td>
                  <td className="pt-2 pb-1 text-right font-bold text-[#C8102E] text-base">{fmtN(genelToplam)} {sembol}</td>
                </tr>
                <tr>
                  <td className="pb-2 font-bold text-gray-900 dark:text-gray-100">Ödenecek Tutar</td>
                  <td className="pb-2 text-right font-bold text-[#C8102E] text-base">{fmtN(genelToplam)} {sembol}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {paraBirimi === 'TRY' && (
            <div className="mt-3 text-right text-xs text-gray-500 dark:text-gray-400 italic">
              {tutarYaziya(genelToplam)}
            </div>
          )}
        </div>

        {/* ─── Ödeme Bilgileri */}
        <div className="bg-white dark:bg-gray-800 border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Ödeme Bilgileri</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">IBAN</label>
              <input type="text" value={iban} onChange={e => setIban(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Banka</label>
              <input type="text" value={bankaAdi} onChange={e => setBankaAdi(e.target.value)} className={INPUT} />
            </div>
          </div>
        </div>

        {/* ─── Notlar */}
        <div className="bg-white dark:bg-gray-800 border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Notlar</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Notlar</label>
              <textarea value={notlar} onChange={e => setNotlar(e.target.value)}
                className={INPUT} rows={3} placeholder="Ek notlar..." />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Özel Şartlar</label>
              <textarea value={ozelSartlar} onChange={e => setOzelSartlar(e.target.value)}
                className={INPUT} rows={3} placeholder="Özel şartlar ve koşullar..." />
            </div>
          </div>
        </div>

        {/* ─── Alt Butonlar */}
        <div className="flex gap-3 justify-end pb-8">
          <Link href="/fiyat-teklifleri/proforma"
            className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-6 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors">
            İptal
          </Link>
          <button onClick={() => handleSave(false)} disabled={saving}
            className="border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 px-6 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors disabled:opacity-50">
            {saving ? 'Kaydediliyor...' : 'Kaydet (Taslak)'}
          </button>
          <button onClick={() => handleSave(true)} disabled={saving}
            className="bg-[#C8102E] text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-[#a50d26] transition-colors disabled:opacity-50">
            Kaydet ve PDF İndir
          </button>
        </div>

      </div>

      <TedarikciTeklifModal
        open={showImportModal}
        data={parsedTeklif}
        onClose={() => setShowImportModal(false)}
        onAktar={handleImportAktar}
      />
    </div>
  )
}
