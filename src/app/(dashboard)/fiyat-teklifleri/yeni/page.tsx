'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { TURKEY_PROVINCES } from '@/lib/turkey-provinces'
import SubeSelect from '@/components/SubeSelect'
import TedarikciTeklifModal, { type ParsedKalem, type ParsedTeklif } from '@/components/TedarikciTeklifModal'

// ─── Türkçe para yazıya çevirme ────────────────────────────────
const BIRLER = ['', 'Bir', 'İki', 'Üç', 'Dört', 'Beş', 'Altı', 'Yedi', 'Sekiz', 'Dokuz']
const ONLAR  = ['', 'On', 'Yirmi', 'Otuz', 'Kırk', 'Elli', 'Altmış', 'Yetmiş', 'Seksen', 'Doksan']
const BINLER = ['', 'Bin', 'Milyon', 'Milyar']
function ucHaneYaz(n: number): string {
  if (n === 0) return ''
  let s = ''
  const yuz = Math.floor(n / 100), on = Math.floor((n % 100) / 10), bir = n % 10
  if (yuz === 1) s += 'Yüz'; else if (yuz > 1) s += BIRLER[yuz] + 'Yüz'
  return s + ONLAR[on] + BIRLER[bir]
}
function sayiyiYaziyaCevir(sayi: number): string {
  if (sayi === 0) return 'Sıfır'
  const tam = Math.floor(sayi), kurus = Math.round((sayi - tam) * 100)
  let sonuc = ''
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

// ─── Tipler ────────────────────────────────────────────────────
type Kalem = { id: string; aciklama: string; miktar: number; birim_fiyat: number; iskonto: number; toplam: number }
type Musteri = { id: string; full_name: string; phone?: string }
type KdvDurumu = 'dahil' | 'haric' | 'yok'
type ParaBirimi = 'TL' | 'USD' | 'EUR'
type Durum = 'taslak' | 'gonderildi' | 'bekliyor' | 'kazanildi' | 'kaybedildi'
type Urun = {
  id: string; kategori: string; ad: string
  kdv_dahil_fiyat: number; kdv_haric_fiyat: number
  periyodik_bakim_fiyati: number | null; dolum_fiyati: number | null
}

function newKalem(): Kalem {
  return { id: Math.random().toString(36).slice(2), aciklama: '', miktar: 1, birim_fiyat: 0, iskonto: 0, toplam: 0 }
}
function buildSartname(kdvDurumu: KdvDurumu, gecerlilik: number) {
  const kdvText = kdvDurumu === 'dahil' ? 'Fiyatlarımıza KDV dahildir.' : kdvDurumu === 'haric' ? 'Fiyatlarımıza KDV dahil değildir.' : 'KDV uygulanmamaktadır.'
  return `Ticari Şartlar:\n1. KDV: ${kdvText}\n2. Opsiyon: Fiyatlarımız ${gecerlilik} gün geçerlidir.\n3. Teslimat: Sipariş takiben işe başlama 3 hafta, iş teslimi 6-12 haftada tamamlanır.\n4. Nakliye: Kargo ve nakliye masrafları müşteriye aittir.\n5. Garanti: Cihazlar imalat hatalarına karşı 2 yıl garantilidir.\n6. Ödeme: Siparişte %50 peşin, teslimatta kalan tutar. Vadesinde ödenmeyen faturalar için aylık %5 vade farkı uygulanır.\n7. Onay: Teklifimizi uygun bulduğunuzda kaşe ve imza ile tarafımıza iletiniz. İmzalı teklif sözleşme olarak geçerlidir.`
}

const INPUT = 'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]'

export default function YeniTeklifPage() {
  const router = useRouter()
  const supabase = createClient()

  const today = new Date().toISOString().split('T')[0]
  const [teklif_no]                 = useState(() => `TK-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`)
  const [tarih, setTarih]           = useState(today)
  const [gecerlilik, setGecerlilik] = useState(7)
  const [sehir, setSehir]           = useState('')
  const [durum, setDurum]           = useState<Durum>('taslak')

  const gecerlilikBitis = (() => {
    const d = new Date(tarih); d.setDate(d.getDate() + gecerlilik); return d.toISOString().split('T')[0]
  })()

  const [musteriMod, setMusteriMod]       = useState<'kayitli' | 'manuel'>('kayitli')
  const [musteriler, setMusteriler]       = useState<Musteri[]>([])
  const [musteriArama, setMusteriArama]   = useState('')
  const [seciliMusteri, setSeciliMusteri] = useState<Musteri | null>(null)
  const [showDropdown, setShowDropdown]   = useState(false)
  const [manuelAdi, setManuelAdi]         = useState('')
  const [manuelSehir, setManuelSehir]     = useState('')
  const [manuelTel, setManuelTel]         = useState('')
  const [manuelEmail, setManuelEmail]     = useState('')
  const searchRef = useRef<HTMLDivElement>(null)

  const [paraBirimi, setParaBirimi] = useState<ParaBirimi>('TL')
  const [dovizKuru, setDovizKuru]   = useState<{ USD: number; EUR: number } | null>(null)
  const [kdvDurumu, setKdvDurumu]   = useState<KdvDurumu>('haric')
  const [kdvOrani, setKdvOrani]     = useState(20)

  const [kalemler, setKalemler] = useState<Kalem[]>([newKalem()])
  const [karOrani, setKarOrani]     = useState('')
  const [yuvarlaBase, setYuvarlaBase] = useState<1 | 10 | 100 | 1000>(1)
  const [kdvManuelVal, setKdvManuelVal] = useState('')
  const [genelIskonto, setGenelIskonto]       = useState('')
  const [genelIskontoTip, setGenelIskontoTip] = useState<'yuzde' | 'tl'>('yuzde')
  const [pdfYukleniyor, setPdfYukleniyor]   = useState(false)
  const [pdfHata, setPdfHata]               = useState('')
  const [parsedTeklif, setParsedTeklif]     = useState<ParsedTeklif | null>(null)
  const [showImportModal, setShowImportModal] = useState(false)
  const pdfInputRef = useRef<HTMLInputElement>(null)

  const [notlar, setNotlar]               = useState('')
  const [sartname, setSartname]           = useState(false)
  const [sartnameMetin, setSartnameMetin] = useState(() => buildSartname('haric', 7))

  const [subeId, setSubeId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  // ─── Ürün kataloğu ───────────────────────────────────────────
  const [urunler, setUrunler]           = useState<Urun[]>([])
  const [acDropId, setAcDropId]         = useState<string | null>(null)  // hangi satırın dropu açık
  const [acFiltered, setAcFiltered]     = useState<Urun[]>([])
  // Dolum tipi seçimi popup
  const [dolumPopup, setDolumPopup]     = useState<{ kalemId: string; urun: Urun } | null>(null)
  const acRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.from('customers').select('id, full_name, phone').eq('is_active', true).order('full_name')
      .then(({ data }: { data: any }) => setMusteriler((data as Musteri[]) ?? []))
    supabase.from('urunler').select('id, kategori, ad, kdv_dahil_fiyat, kdv_haric_fiyat, periyodik_bakim_fiyati, dolum_fiyati')
      .eq('aktif', true).order('kategori').order('kdv_dahil_fiyat')
      .then(({ data }: { data: any }) => setUrunler((data as Urun[]) ?? []))
  }, [])

  useEffect(() => {
    if (paraBirimi === 'TL') return
    fetch('https://open.er-api.com/v6/latest/TRY').then(r => r.json()).then(data => {
      if (data?.rates) setDovizKuru({ USD: Math.round(1 / data.rates['USD'] * 100) / 100, EUR: Math.round(1 / data.rates['EUR'] * 100) / 100 })
    }).catch(() => {})
  }, [paraBirimi])

  useEffect(() => { setSartnameMetin(buildSartname(kdvDurumu, gecerlilik)) }, [kdvDurumu, gecerlilik])

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowDropdown(false)
      if (acRef.current && !acRef.current.contains(e.target as Node)) setAcDropId(null)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  // ─── Kalem işlemleri ─────────────────────────────────────────
  const updateKalem = useCallback((id: string, field: keyof Kalem, value: any) => {
    setKalemler(prev => prev.map(k => {
      if (k.id !== id) return k
      const u = { ...k, [field]: value }
      u.toplam = Math.round(u.miktar * u.birim_fiyat * (1 - (u.iskonto || 0) / 100) * 100) / 100
      return u
    }))
  }, [])

  function onAciklamaChange(id: string, val: string) {
    updateKalem(id, 'aciklama', val)
    const q = val.toLowerCase().trim()
    if (q.length < 1) { setAcDropId(null); return }
    const filtered = urunler.filter(u => u.ad.toLowerCase().includes(q)).slice(0, 8)
    setAcFiltered(filtered)
    setAcDropId(filtered.length > 0 ? id : null)
  }

  function selectUrun(kalemId: string, urun: Urun) {
    if (urun.kategori === 'dolum' && urun.periyodik_bakim_fiyati != null && urun.dolum_fiyati != null) {
      // Önce fiyat tipi sor
      setDolumPopup({ kalemId, urun })
      setAcDropId(null)
      return
    }
    const fiyat = kdvDurumu === 'dahil' ? urun.kdv_dahil_fiyat : urun.kdv_haric_fiyat
    setKalemler(prev => prev.map(k => {
      if (k.id !== kalemId) return k
      const u = { ...k, aciklama: urun.ad, birim_fiyat: fiyat }
      u.toplam = Math.round(u.miktar * fiyat * (1 - (u.iskonto || 0) / 100) * 100) / 100
      return u
    }))
    setAcDropId(null)
  }

  function selectDolumTip(tip: 'bakim' | 'dolum') {
    if (!dolumPopup) return
    const { kalemId, urun } = dolumPopup
    const fiyat = tip === 'bakim' ? (urun.periyodik_bakim_fiyati ?? 0) : (urun.dolum_fiyati ?? 0)
    const aciklama = tip === 'bakim' ? `${urun.ad} (Periyodik Bakım)` : `${urun.ad} (Dolum)`
    setKalemler(prev => prev.map(k => {
      if (k.id !== kalemId) return k
      const u = { ...k, aciklama, birim_fiyat: fiyat }
      u.toplam = Math.round(u.miktar * fiyat * (1 - (u.iskonto || 0) / 100) * 100) / 100
      return u
    }))
    setDolumPopup(null)
  }

  const removeKalem = (id: string) => setKalemler(prev => prev.filter(k => k.id !== id))

  const araToplam = kalemler.reduce((s, k) => s + k.toplam, 0)
  const genelIskontoTutari = (() => {
    const v = parseFloat(genelIskonto) || 0
    if (v <= 0) return 0
    return genelIskontoTip === 'tl'
      ? Math.min(v, araToplam)
      : Math.round(araToplam * v / 100 * 100) / 100
  })()
  const iskontoSonrasi = araToplam - genelIskontoTutari
  const kdvTutari = kdvDurumu === 'yok' ? 0
    : kdvDurumu === 'haric'
      ? Math.round(iskontoSonrasi * kdvOrani / 100 * 100) / 100
      : Math.round((iskontoSonrasi - iskontoSonrasi / (1 + kdvOrani / 100)) * 100) / 100
  const genelToplam = kdvDurumu === 'haric' ? iskontoSonrasi + kdvTutari : iskontoSonrasi
  const tutarYaziyla = paraBirimi === 'TL' ? sayiyiYaziyaCevir(genelToplam) : `${new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(genelToplam)} ${paraBirimi}`

  function applyYuvarla() {
    setKalemler(prev => prev.map(k => {
      const yeni = Math.round(k.birim_fiyat / yuvarlaBase) * yuvarlaBase
      return { ...k, birim_fiyat: yeni, toplam: Math.round(k.miktar * yeni * (1 - (k.iskonto || 0) / 100) * 100) / 100 }
    }))
  }

  function applyKarOrani() {
    const oran = parseFloat(karOrani)
    if (isNaN(oran)) return
    setKalemler(prev => prev.map(k => {
      const yeni = Math.round(k.birim_fiyat * (1 + oran / 100) * 100) / 100
      return { ...k, birim_fiyat: yeni, toplam: Math.round(k.miktar * yeni * (1 - (k.iskonto || 0) / 100) * 100) / 100 }
    }))
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    setPdfHata(''); setPdfYukleniyor(true)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/parse-teklif', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Bilinmeyen hata')
      if (!json.kalemler || !json.kalemler.length) { setPdfHata('Dosyadan kalem bulunamadı. Önizleme açılıyor.') }
      setParsedTeklif(json as ParsedTeklif)
      setShowImportModal(true)
    } catch (err: any) {
      setPdfHata(err.message ?? 'Hata oluştu')
    } finally {
      setPdfYukleniyor(false)
      if (pdfInputRef.current) pdfInputRef.current.value = ''
    }
  }

  function handleImportAktar(importedKalemler: ParsedKalem[], paraBirimi: string) {
    const yeni: Kalem[] = importedKalemler.map(k => ({
      id: Math.random().toString(36).slice(2),
      aciklama: k.aciklama,
      miktar: k.miktar,
      birim_fiyat: k.birim_fiyat,
      iskonto: 0,
      toplam: k.toplam || Math.round(k.miktar * k.birim_fiyat * 100) / 100,
    }))
    setKalemler(prev => [...prev.filter(k => k.aciklama.trim() || k.birim_fiyat > 0), ...yeni])
    if (paraBirimi === 'EUR') setParaBirimi('EUR')
    else if (paraBirimi === 'USD') setParaBirimi('USD')
    else setParaBirimi('TL')
    setShowImportModal(false)
  }

  async function handleKaydet(e: React.FormEvent) {
    e.preventDefault(); setError('')
    const musteriAdi = musteriMod === 'kayitli' ? (seciliMusteri?.full_name ?? '') : manuelAdi
    if (!musteriAdi.trim()) { setError('Müşteri adı gereklidir.'); return }
    if (!kalemler.length) { setError('En az bir kalem ekleyiniz.'); return }
    setSaving(true)
    try {
      const { data: teklif, error: tErr } = await supabase.from('teklifler').insert([{
        teklif_no, tarih, gecerlilik_suresi: gecerlilik, gecerlilik_bitis: gecerlilikBitis,
        sehir: sehir || null, durum, sube_id: subeId || null,
        musteri_id: musteriMod === 'kayitli' ? seciliMusteri?.id : null,
        musteri_adi: musteriAdi,
        musteri_sehir: musteriMod === 'kayitli' ? sehir || null : manuelSehir || null,
        musteri_telefon: musteriMod === 'kayitli' ? seciliMusteri?.phone ?? null : manuelTel || null,
        musteri_email: musteriMod === 'kayitli' ? null : manuelEmail || null,
        para_birimi: paraBirimi,
        doviz_kuru: paraBirimi === 'TL' ? 1 : (paraBirimi === 'USD' ? dovizKuru?.USD : dovizKuru?.EUR) ?? 1,
        kdv_durumu: kdvDurumu, kdv_orani: kdvOrani,
        ara_toplam: araToplam, kdv_tutari: kdvTutari, genel_toplam: genelToplam,
        genel_iskonto: genelIskontoTutari, genel_iskonto_tip: genelIskontoTip,
        kar_orani: karOrani ? parseFloat(karOrani) : null,
        notlar: notlar || null,
        ticari_sartname_ekli: sartname, ticari_sartname_metni: sartname ? sartnameMetin : null,
      }]).select().single()
      if (tErr || !teklif) throw new Error(tErr?.message ?? 'Teklif kaydedilemedi')
      const { error: kErr } = await supabase.from('teklif_kalemleri').insert(
        kalemler.map((k, i) => ({ teklif_id: teklif.id, sira_no: i + 1, aciklama: k.aciklama, miktar: k.miktar, birim_fiyat: k.birim_fiyat, iskonto: k.iskonto || 0, toplam: k.toplam }))
      )
      if (kErr) throw new Error(kErr.message)
      router.push(`/fiyat-teklifleri/${teklif.id}`)
    } catch (err: any) {
      setError(err.message ?? 'Bilinmeyen hata'); setSaving(false)
    }
  }

  const filteredMusteriler = musteriler.filter(m => m.full_name.toLowerCase().includes(musteriArama.toLowerCase())).slice(0, 10)
  const kur = paraBirimi === 'USD' ? dovizKuru?.USD : paraBirimi === 'EUR' ? dovizKuru?.EUR : null

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-700">
      <div className="bg-white dark:bg-gray-800 border-b px-6 py-4 flex items-center gap-3 sticky top-0 z-10">
        <div className="w-8 h-8 bg-[#C8102E] rounded-lg flex items-center justify-center text-white font-bold text-sm">K</div>
        <Link href="/fiyat-teklifleri" className="text-gray-500 dark:text-gray-400 text-sm hover:text-gray-700">← Fiyat Teklifleri</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Yeni Teklif</h1>
      </div>

      <form onSubmit={handleKaydet} className="p-4 max-w-5xl mx-auto space-y-4">

        {/* ── Bölüm 1: Teklif Bilgileri ── */}
        <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 pb-2 border-b">Teklif Bilgileri</h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Teklif No</label>
                <input value={teklif_no} readOnly className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 font-mono text-gray-700 dark:text-gray-300 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Teklif Tarihi</label>
                <input type="date" value={tarih} onChange={e => setTarih(e.target.value)} className={`mt-1 ${INPUT}`} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Geçerlilik Süresi (gün)</label>
                <input type="number" min={1} value={gecerlilik} onChange={e => setGecerlilik(parseInt(e.target.value) || 7)} className={`mt-1 ${INPUT}`} />
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Geçerlilik Bitiş</label>
                <input value={gecerlilikBitis} readOnly className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Şehir</label>
                <select value={sehir} onChange={e => setSehir(e.target.value)} className={`mt-1 ${INPUT}`}>
                  <option value="">Seçiniz</option>
                  <option disabled>─────────</option>
                  <option value="Erzincan">Erzincan</option>
                  <option value="İstanbul">İstanbul</option>
                  <option disabled>─────────</option>
                  {TURKEY_PROVINCES.map(il => (
                    <option key={il} value={il}>{il}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Durum</label>
                <select value={durum} onChange={e => setDurum(e.target.value as Durum)} className={`mt-1 ${INPUT}`}>
                  <option value="taslak">Taslak</option>
                  <option value="gonderildi">Gönderildi</option>
                  <option value="bekliyor">Bekliyor</option>
                  <option value="kazanildi">Kazanıldı</option>
                  <option value="kaybedildi">Kaybedildi</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Şube</label>
                <SubeSelect value={subeId} onChange={setSubeId} label="" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Bölüm 2: Müşteri ── */}
        <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3 pb-2 border-b">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Müşteri</h2>
            <div className="flex gap-1">
              {(['kayitli', 'manuel'] as const).map(mod => (
                <button key={mod} type="button" onClick={() => setMusteriMod(mod)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${musteriMod === mod ? 'bg-[#C8102E] text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200'}`}>
                  {mod === 'kayitli' ? 'Kayıtlı Müşteri' : 'Manuel Gir'}
                </button>
              ))}
            </div>
          </div>
          {musteriMod === 'kayitli' ? (
            <div ref={searchRef} className="relative max-w-md">
              <input type="text" value={musteriArama}
                onChange={e => { setMusteriArama(e.target.value); setShowDropdown(true); setSeciliMusteri(null) }}
                onFocus={() => setShowDropdown(true)} placeholder="Müşteri ara..." className={INPUT} />
              {showDropdown && musteriArama.length > 0 && (
                <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border rounded-lg shadow-xl max-h-48 overflow-y-auto">
                  {filteredMusteriler.length === 0 ? <div className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">Bulunamadı</div>
                    : filteredMusteriler.map(m => (
                      <div key={m.id} onClick={() => { setSeciliMusteri(m); setMusteriArama(m.full_name); setShowDropdown(false) }}
                        className="px-3 py-2 hover:bg-red-50 cursor-pointer border-b last:border-0">
                        <div className="text-sm font-medium">{m.full_name}</div>
                        {m.phone && <div className="text-xs text-gray-400 dark:text-gray-500">{m.phone}</div>}
                      </div>
                    ))}
                </div>
              )}
              {seciliMusteri && <div className="mt-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">✅ {seciliMusteri.full_name}</div>}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Ad / Ünvan <span className="text-red-500">*</span></label>
                <input value={manuelAdi} onChange={e => setManuelAdi(e.target.value)} placeholder="Firma veya kişi adı" className={`mt-1 ${INPUT}`} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Şehir</label>
                <select value={manuelSehir} onChange={e => setManuelSehir(e.target.value)} className={`mt-1 ${INPUT}`}>
                  <option value="">Seçiniz</option>
                  <option disabled>─────────</option>
                  <option value="Erzincan">Erzincan</option>
                  <option value="İstanbul">İstanbul</option>
                  <option disabled>─────────</option>
                  {TURKEY_PROVINCES.map(il => (
                    <option key={il} value={il}>{il}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Telefon</label>
                <input value={manuelTel} onChange={e => setManuelTel(e.target.value)} placeholder="0530 000 00 00" className={`mt-1 ${INPUT}`} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300">E-posta</label>
                <input type="email" value={manuelEmail} onChange={e => setManuelEmail(e.target.value)} placeholder="ornek@firma.com" className={`mt-1 ${INPUT}`} />
              </div>
            </div>
          )}
        </div>

        {/* ── Bölüm 3: Para Birimi ve KDV ── */}
        <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 pb-2 border-b">Para Birimi ve KDV</h2>
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <div className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5">Para Birimi</div>
              <div className="flex gap-1">
                {(['TL', 'USD', 'EUR'] as const).map(pb => (
                  <button key={pb} type="button" onClick={() => setParaBirimi(pb)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${paraBirimi === pb ? 'bg-[#C8102E] text-white border-[#C8102E]' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-gray-500'}`}>
                    {pb}
                  </button>
                ))}
              </div>
              {kur && <div className="mt-1.5 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1">1 {paraBirimi} ≈ {kur.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</div>}
            </div>
            <div className="h-8 border-l border-gray-200 dark:border-gray-600 self-center hidden sm:block" />
            <div>
              <div className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5">KDV Durumu</div>
              <div className="flex gap-1">
                {([{ value: 'haric', label: 'KDV Hariç' }, { value: 'dahil', label: 'KDV Dahil' }, { value: 'yok', label: 'KDV Yok' }] as const).map(opt => (
                  <button key={opt.value} type="button" onClick={() => setKdvDurumu(opt.value)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${kdvDurumu === opt.value ? 'bg-[#C8102E] text-white border-[#C8102E]' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-gray-500'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {kdvDurumu !== 'yok' && (
              <>
                <div className="h-8 border-l border-gray-200 dark:border-gray-600 self-center hidden sm:block" />
                <div>
                  <div className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-1.5">KDV Oranı</div>
                  <div className="flex gap-1 items-center">
                    {[1, 10, 20].map(oran => (
                      <button key={oran} type="button" onClick={() => { setKdvOrani(oran); setKdvManuelVal('') }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${kdvOrani === oran && !kdvManuelVal ? 'bg-gray-800 text-white border-gray-800' : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-gray-500'}`}>
                        %{oran}
                      </button>
                    ))}
                    <div className="flex items-center border rounded-lg overflow-hidden">
                      <span className="px-2 text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700 border-r select-none">%</span>
                      <input
                        type="number" min={0} max={100} step={1}
                        value={kdvManuelVal}
                        onChange={e => {
                          const v = e.target.value
                          setKdvManuelVal(v)
                          const n = parseFloat(v)
                          if (!isNaN(n) && n >= 0) setKdvOrani(n)
                        }}
                        placeholder="diğer"
                        className="w-16 px-2 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                      />
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Bölüm 4: Teklif Kalemleri ── */}
        <div className="bg-white dark:bg-gray-800 border rounded-lg overflow-hidden" ref={acRef}>
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Teklif Kalemleri</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <button type="button" onClick={() => pdfInputRef.current?.click()} disabled={pdfYukleniyor}
                className="text-xs border border-blue-300 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-50 disabled:opacity-50">
                {pdfYukleniyor ? '⏳ Ayrıştırılıyor...' : '📄 PDF/Excel\'den Aktar'}
              </button>
              <input ref={pdfInputRef} type="file" accept=".pdf,.xlsx,.xls,.csv" onChange={handleImport} className="hidden" />
              <div className="flex items-center gap-1">
                <input type="number" value={karOrani} onChange={e => setKarOrani(e.target.value)} placeholder="örn: 20 veya -10"
                  className="w-28 border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />
                <button type="button" onClick={applyKarOrani}
                  className="text-xs border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 px-2 py-1.5 rounded-lg hover:bg-gray-50 whitespace-nowrap">
                  Kar Uygula
                </button>
              </div>
              <div className="flex items-center gap-1">
                <select
                  value={yuvarlaBase}
                  onChange={e => setYuvarlaBase(parseInt(e.target.value) as 1 | 10 | 100 | 1000)}
                  className="border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                >
                  <option value={1}>Tam sayı</option>
                  <option value={10}>10'a</option>
                  <option value={100}>100'e</option>
                  <option value={1000}>1000'e</option>
                </select>
                <button type="button" onClick={applyYuvarla}
                  className="text-xs border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 px-2 py-1.5 rounded-lg hover:bg-gray-50 whitespace-nowrap">
                  Yuvarla
                </button>
              </div>
              <button type="button" onClick={() => setKalemler(prev => [...prev, newKalem()])}
                className="text-xs bg-gray-800 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700">
                + Kalem Ekle
              </button>
            </div>
          </div>

          {pdfHata && <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700">{pdfHata}</div>}

          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-700 border-b text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
            <div className="col-span-1 text-center">S.NO</div>
            <div className="col-span-1 text-center">ADET</div>
            <div className="col-span-5">MALIN CİNSİ</div>
            <div className="col-span-2 text-right">B. FİYATI ({paraBirimi})</div>
            <div className="col-span-1 text-right">İSKONTO %</div>
            <div className="col-span-1 text-right">TOPLAM</div>
            <div className="col-span-1" />
          </div>

          <div className="divide-y">
            {kalemler.map((k, idx) => (
              <div key={k.id} className="grid grid-cols-12 gap-2 px-4 py-1.5 items-center relative">
                <div className="col-span-1 text-center text-xs text-gray-400 dark:text-gray-500">{idx + 1}</div>
                <div className="col-span-1">
                  <input type="number" min={0.001} step="any" value={k.miktar}
                    onChange={e => updateKalem(k.id, 'miktar', parseFloat(e.target.value) || 0)}
                    className="w-full border rounded px-2 py-1.5 text-sm text-center focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />
                </div>
                <div className="col-span-5 relative">
                  <input value={k.aciklama}
                    onChange={e => onAciklamaChange(k.id, e.target.value)}
                    onFocus={() => {
                      if (k.aciklama.length > 0) {
                        const filtered = urunler.filter(u => u.ad.toLowerCase().includes(k.aciklama.toLowerCase())).slice(0, 8)
                        setAcFiltered(filtered); setAcDropId(filtered.length > 0 ? k.id : null)
                      }
                    }}
                    placeholder="Ürün / hizmet adı yazın veya seçin..."
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />
                  {/* Autocomplete dropdown */}
                  {acDropId === k.id && acFiltered.length > 0 && (
                    <div className="absolute z-30 left-0 right-0 top-full mt-0.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl max-h-52 overflow-y-auto">
                      {acFiltered.map(u => (
                        <div key={u.id} onMouseDown={e => { e.preventDefault(); selectUrun(k.id, u) }}
                          className="px-3 py-2 hover:bg-red-50 cursor-pointer border-b last:border-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{u.ad}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {u.kategori === 'dolum' ? (
                              <>Bakım: {u.periyodik_bakim_fiyati?.toLocaleString('tr-TR') ?? '-'} ₺ · Dolum: {u.dolum_fiyati?.toLocaleString('tr-TR') ?? '-'} ₺</>
                            ) : (
                              <>KDV Dahil: {u.kdv_dahil_fiyat.toLocaleString('tr-TR')} ₺ · KDV Hariç: {u.kdv_haric_fiyat.toLocaleString('tr-TR')} ₺</>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="col-span-2">
                  <input type="number" min={0} step="any" value={k.birim_fiyat}
                    onChange={e => updateKalem(k.id, 'birim_fiyat', parseFloat(e.target.value) || 0)}
                    className="w-full border rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />
                </div>
                <div className="col-span-1">
                  <input type="number" min={0} max={100} step="any" value={k.iskonto || ''}
                    onChange={e => updateKalem(k.id, 'iskonto', parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    className="w-full border rounded px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />
                </div>
                <div className="col-span-1 text-right text-sm font-medium text-gray-800 dark:text-gray-200 pr-1">
                  {k.toplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </div>
                <div className="col-span-1 text-center">
                  <button type="button" onClick={() => removeKalem(k.id)} className="text-red-400 hover:text-red-600 text-xl font-bold leading-none">×</button>
                </div>
              </div>
            ))}
          </div>

          {/* Alt toplamlar */}
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 border-t">
            <div className="ml-auto w-72 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">KDV Hariç Toplam</span>
                <span className="font-medium">{araToplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {paraBirimi}</span>
              </div>
              {/* Genel İskonto */}
              <div className="flex items-center gap-2">
                <span className="text-gray-600 dark:text-gray-300 shrink-0">Genel İskonto</span>
                <div className="flex items-center gap-1 ml-auto">
                  <button type="button" onClick={() => setGenelIskontoTip('yuzde')}
                    className={`px-2 py-0.5 text-xs rounded border transition-colors ${genelIskontoTip === 'yuzde' ? 'bg-gray-700 text-white border-gray-700' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100'}`}>%</button>
                  <button type="button" onClick={() => setGenelIskontoTip('tl')}
                    className={`px-2 py-0.5 text-xs rounded border transition-colors ${genelIskontoTip === 'tl' ? 'bg-gray-700 text-white border-gray-700' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100'}`}>TL</button>
                  <input type="number" min={0} step="any" value={genelIskonto}
                    onChange={e => setGenelIskonto(e.target.value)}
                    placeholder="0"
                    className="w-20 border rounded px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />
                </div>
              </div>
              {genelIskontoTutari > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>— İskonto ({genelIskontoTip === 'yuzde' ? `%${genelIskonto}` : 'TL'})</span>
                  <span className="font-medium">-{genelIskontoTutari.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {paraBirimi}</span>
                </div>
              )}
              {genelIskontoTutari > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-300">İskonto Sonrası</span>
                  <span className="font-medium">{iskontoSonrasi.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {paraBirimi}</span>
                </div>
              )}
              {kdvDurumu !== 'yok' && (
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-300">KDV (%{kdvOrani})</span>
                  <span className="font-medium">{kdvTutari.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {paraBirimi}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-gray-300 dark:border-gray-600">
                <span className="font-bold text-gray-900 dark:text-gray-100">Genel Toplam</span>
                <span className="font-bold text-[#C8102E] text-base">{genelToplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {paraBirimi}</span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 italic">{tutarYaziyla}</div>
            </div>
          </div>
        </div>

        {/* ── Bölüm 5: Notlar ── */}
        <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 pb-2 border-b">Notlar</h2>
          <textarea value={notlar} onChange={e => setNotlar(e.target.value)} rows={3} placeholder="Teklif ile ilgili notlar..." className={INPUT} />
        </div>

        {/* ── Bölüm 6: Ticari Şartname ── */}
        <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2 pb-2 border-b">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Ticari Şartname</h2>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs text-gray-600 dark:text-gray-300">PDF'e Ekle</span>
              <div onClick={() => setSartname(p => !p)} className={`relative w-10 h-5 rounded-full cursor-pointer transition-colors ${sartname ? 'bg-[#C8102E]' : 'bg-gray-300'}`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white dark:bg-gray-800 rounded-full shadow transition-all ${sartname ? 'left-5' : 'left-0.5'}`} />
              </div>
            </label>
          </div>
          {sartname ? <textarea value={sartnameMetin} onChange={e => setSartnameMetin(e.target.value)} rows={10} className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            : <p className="text-xs text-gray-400 dark:text-gray-500 italic">Kapalı — PDF'e eklenmeyecek.</p>}
        </div>

        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</div>}

        <div className="flex gap-3 pb-6">
          <button type="submit" disabled={saving}
            className="flex-1 bg-[#C8102E] text-white py-3 rounded-lg font-semibold hover:bg-[#a50d26] disabled:opacity-50 transition-colors text-sm">
            {saving ? 'Kaydediliyor...' : '💾 Kaydet ve Devam Et'}
          </button>
          <Link href="/fiyat-teklifleri" className="px-8 py-3 border rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 transition-colors text-center">İptal</Link>
        </div>
      </form>

      {/* ── Tedarikçi teklif import modal ── */}
      <TedarikciTeklifModal
        open={showImportModal}
        data={parsedTeklif}
        onClose={() => setShowImportModal(false)}
        onAktar={handleImportAktar}
      />

      {/* ── Dolum fiyat tipi seçim popup ── */}
      {dolumPopup && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-sm">
            <div className="px-5 py-4 border-b">
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Fiyat Tipi Seçin</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{dolumPopup.urun.ad}</p>
            </div>
            <div className="p-5 space-y-3">
              <button onClick={() => selectDolumTip('bakim')}
                className="w-full flex items-center justify-between p-3 border-2 border-gray-200 dark:border-gray-600 rounded-lg hover:border-[#C8102E] hover:bg-red-50 transition-colors text-left">
                <div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">🔧 Periyodik Bakım</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Kontrol, basınç testi, rapor</div>
                </div>
                <div className="text-base font-bold text-[#C8102E]">{dolumPopup.urun.periyodik_bakim_fiyati?.toLocaleString('tr-TR')} ₺</div>
              </button>
              <button onClick={() => selectDolumTip('dolum')}
                className="w-full flex items-center justify-between p-3 border-2 border-gray-200 dark:border-gray-600 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left">
                <div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">💧 Dolum</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Tam dolum ve bakım</div>
                </div>
                <div className="text-base font-bold text-blue-700">{dolumPopup.urun.dolum_fiyati?.toLocaleString('tr-TR')} ₺</div>
              </button>
            </div>
            <div className="px-5 py-3 border-t">
              <button onClick={() => setDolumPopup(null)} className="w-full py-2 border rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50">İptal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
