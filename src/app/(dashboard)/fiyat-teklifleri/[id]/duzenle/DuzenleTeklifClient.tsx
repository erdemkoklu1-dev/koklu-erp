'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { TURKEY_PROVINCES } from '@/lib/turkey-provinces'
import SubeSelect from '@/components/SubeSelect'

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
type Durum = 'taslak' | 'gonderildi' | 'bekliyor' | 'kazanildi' | 'kaybedildi' | 'iptal'
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

const SEHIR_SELECT = (
  <>
    <option value="">Seçiniz</option>
    <option disabled>─────────</option>
    <option value="Erzincan">Erzincan</option>
    <option value="İstanbul">İstanbul</option>
    <option disabled>─────────</option>
    {TURKEY_PROVINCES.map(il => (
      <option key={il} value={il}>{il}</option>
    ))}
  </>
)

export default function DuzenleTeklifClient({
  teklif,
  kalemlerData,
}: {
  teklif: any
  kalemlerData: any[]
}) {
  const router = useRouter()
  const supabase = createClient()

  const [tarih, setTarih]           = useState(teklif.tarih || new Date().toISOString().split('T')[0])
  const [gecerlilik, setGecerlilik] = useState<number>(teklif.gecerlilik_suresi || 7)
  const [sehir, setSehir]           = useState(teklif.sehir || '')
  const [durum, setDurum]           = useState<Durum>(teklif.durum || 'taslak')

  const gecerlilikBitis = (() => {
    const d = new Date(tarih); d.setDate(d.getDate() + gecerlilik); return d.toISOString().split('T')[0]
  })()

  const [musteriMod, setMusteriMod]       = useState<'kayitli' | 'manuel'>(teklif.musteri_id ? 'kayitli' : 'manuel')
  const [musteriler, setMusteriler]       = useState<Musteri[]>([])
  const [musteriArama, setMusteriArama]   = useState(teklif.musteri_id ? (teklif.musteri_adi || '') : '')
  const [seciliMusteri, setSeciliMusteri] = useState<Musteri | null>(
    teklif.musteri_id ? { id: teklif.musteri_id, full_name: teklif.musteri_adi || '' } : null
  )
  const [showDropdown, setShowDropdown]   = useState(false)
  const [manuelAdi, setManuelAdi]         = useState(!teklif.musteri_id ? (teklif.musteri_adi || '') : '')
  const [manuelSehir, setManuelSehir]     = useState(!teklif.musteri_id ? (teklif.musteri_sehir || '') : '')
  const [manuelTel, setManuelTel]         = useState(!teklif.musteri_id ? (teklif.musteri_telefon || '') : '')
  const [manuelEmail, setManuelEmail]     = useState(!teklif.musteri_id ? (teklif.musteri_email || '') : '')
  const searchRef = useRef<HTMLDivElement>(null)

  const [paraBirimi, setParaBirimi] = useState<ParaBirimi>((teklif.para_birimi as ParaBirimi) || 'TL')
  const [dovizKuru, setDovizKuru]   = useState<{ USD: number; EUR: number } | null>(null)
  const [kdvDurumu, setKdvDurumu]   = useState<KdvDurumu>((teklif.kdv_durumu as KdvDurumu) || 'haric')
  const [kdvOrani, setKdvOrani]     = useState<number>(teklif.kdv_orani ?? 20)
  const [kdvManuelVal, setKdvManuelVal] = useState('')

  const [kalemler, setKalemler] = useState<Kalem[]>(() =>
    kalemlerData.length > 0
      ? kalemlerData.map(k => ({
          id: Math.random().toString(36).slice(2),
          aciklama: k.aciklama || '',
          miktar: k.miktar || 1,
          birim_fiyat: k.birim_fiyat || 0,
          iskonto: k.iskonto || 0,
          toplam: k.toplam || 0,
        }))
      : [newKalem()]
  )
  const [karOrani, setKarOrani]               = useState(teklif.kar_orani != null ? String(teklif.kar_orani) : '')
  const [genelIskonto, setGenelIskonto]       = useState(teklif.genel_iskonto > 0 ? String(teklif.genel_iskonto) : '')
  const [genelIskontoTip, setGenelIskontoTip] = useState<'yuzde' | 'tl'>((teklif.genel_iskonto_tip as 'yuzde' | 'tl') || 'yuzde')

  const [notlar, setNotlar]               = useState(teklif.notlar || '')
  const [sartname, setSartname]           = useState(teklif.ticari_sartname_ekli || false)
  const [sartnameMetin, setSartnameMetin] = useState(
    teklif.ticari_sartname_metni || buildSartname((teklif.kdv_durumu as KdvDurumu) || 'haric', teklif.gecerlilik_suresi || 7)
  )

  const [subeId, setSubeId] = useState<string | null>(teklif.sube_id ?? null)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  // ─── Ürün kataloğu ───────────────────────────────────────────
  const [urunler, setUrunler]       = useState<Urun[]>([])
  const [acDropId, setAcDropId]     = useState<string | null>(null)
  const [acFiltered, setAcFiltered] = useState<Urun[]>([])
  const [dolumPopup, setDolumPopup] = useState<{ kalemId: string; urun: Urun } | null>(null)
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

  useEffect(() => {
    if (teklif.ticari_sartname_metni) return // mevcut metin varsa dokunma
    setSartnameMetin(buildSartname(kdvDurumu, gecerlilik))
  }, [kdvDurumu, gecerlilik])

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

  function applyKarOrani() {
    const oran = parseFloat(karOrani)
    if (isNaN(oran)) return
    setKalemler(prev => prev.map(k => {
      const yeni = Math.round(k.birim_fiyat * (1 + oran / 100) * 100) / 100
      return { ...k, birim_fiyat: yeni, toplam: Math.round(k.miktar * yeni * (1 - (k.iskonto || 0) / 100) * 100) / 100 }
    }))
  }

  async function handleKaydet(e: React.FormEvent) {
    e.preventDefault(); setError('')
    const musteriAdi = musteriMod === 'kayitli' ? (seciliMusteri?.full_name ?? '') : manuelAdi
    if (!musteriAdi.trim()) { setError('Müşteri adı gereklidir.'); return }
    if (!kalemler.length) { setError('En az bir kalem ekleyiniz.'); return }
    setSaving(true)
    try {
      const { error: tErr } = await supabase.from('teklifler').update({
        tarih, gecerlilik_suresi: gecerlilik, gecerlilik_bitis: gecerlilikBitis,
        sehir: sehir || null, durum, sube_id: subeId || null,
        musteri_id: musteriMod === 'kayitli' ? seciliMusteri?.id : null,
        musteri_adi: musteriAdi,
        musteri_sehir: musteriMod === 'kayitli' ? sehir || null : manuelSehir || null,
        musteri_telefon: musteriMod === 'kayitli' ? (seciliMusteri as any)?.phone ?? null : manuelTel || null,
        musteri_email: musteriMod === 'kayitli' ? null : manuelEmail || null,
        para_birimi: paraBirimi,
        doviz_kuru: paraBirimi === 'TL' ? 1 : (paraBirimi === 'USD' ? dovizKuru?.USD : dovizKuru?.EUR) ?? 1,
        kdv_durumu: kdvDurumu, kdv_orani: kdvOrani,
        ara_toplam: araToplam, kdv_tutari: kdvTutari, genel_toplam: genelToplam,
        genel_iskonto: genelIskontoTutari, genel_iskonto_tip: genelIskontoTip,
        kar_orani: karOrani ? parseFloat(karOrani) : null,
        notlar: notlar || null,
        ticari_sartname_ekli: sartname, ticari_sartname_metni: sartname ? sartnameMetin : null,
      }).eq('id', teklif.id)
      if (tErr) throw new Error(tErr.message)

      const { error: delErr } = await supabase.from('teklif_kalemleri').delete().eq('teklif_id', teklif.id)
      if (delErr) throw new Error(delErr.message)

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
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4 flex items-center gap-3 sticky top-0 z-10">
        <div className="w-8 h-8 bg-[#C8102E] rounded-lg flex items-center justify-center text-white font-bold text-sm">K</div>
        <Link href={`/fiyat-teklifleri/${teklif.id}`} className="text-gray-500 text-sm hover:text-gray-700">← {teklif.teklif_no}</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-lg font-bold text-gray-900">Teklifi Düzenle</h1>
      </div>

      <form onSubmit={handleKaydet} className="p-4 max-w-5xl mx-auto space-y-4">

        {/* ── Bölüm 1: Teklif Bilgileri ── */}
        <div className="bg-white border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b">Teklif Bilgileri</h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Teklif No</label>
                <input value={teklif.teklif_no} readOnly className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-gray-50 font-mono text-gray-700 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Teklif Tarihi</label>
                <input type="date" value={tarih} onChange={e => setTarih(e.target.value)} className={`mt-1 ${INPUT}`} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Geçerlilik Süresi (gün)</label>
                <input type="number" min={1} value={gecerlilik} onChange={e => setGecerlilik(parseInt(e.target.value) || 7)} className={`mt-1 ${INPUT}`} />
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Geçerlilik Bitiş</label>
                <input value={gecerlilikBitis} readOnly className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-700 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Şehir</label>
                <select value={sehir} onChange={e => setSehir(e.target.value)} className={`mt-1 ${INPUT}`}>
                  {SEHIR_SELECT}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Durum</label>
                <select value={durum} onChange={e => setDurum(e.target.value as Durum)} className={`mt-1 ${INPUT}`}>
                  <option value="taslak">Taslak</option>
                  <option value="gonderildi">Gönderildi</option>
                  <option value="bekliyor">Bekliyor</option>
                  <option value="kazanildi">Kazanıldı</option>
                  <option value="kaybedildi">Kaybedildi</option>
                  <option value="iptal">İptal</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Şube</label>
                <SubeSelect value={subeId} onChange={setSubeId} label="" />
              </div>
            </div>
          </div>
        </div>

        {/* ── Bölüm 2: Müşteri ── */}
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3 pb-2 border-b">
            <h2 className="text-sm font-semibold text-gray-700">Müşteri</h2>
            <div className="flex gap-1">
              {(['kayitli', 'manuel'] as const).map(mod => (
                <button key={mod} type="button" onClick={() => setMusteriMod(mod)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${musteriMod === mod ? 'bg-[#C8102E] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
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
                <div className="absolute z-20 w-full mt-1 bg-white border rounded-lg shadow-xl max-h-48 overflow-y-auto">
                  {filteredMusteriler.length === 0 ? <div className="px-3 py-2 text-sm text-gray-400">Bulunamadı</div>
                    : filteredMusteriler.map(m => (
                      <div key={m.id} onClick={() => { setSeciliMusteri(m); setMusteriArama(m.full_name); setShowDropdown(false) }}
                        className="px-3 py-2 hover:bg-red-50 cursor-pointer border-b last:border-0">
                        <div className="text-sm font-medium">{m.full_name}</div>
                        {m.phone && <div className="text-xs text-gray-400">{m.phone}</div>}
                      </div>
                    ))}
                </div>
              )}
              {seciliMusteri && <div className="mt-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">✅ {seciliMusteri.full_name}</div>}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Ad / Ünvan <span className="text-red-500">*</span></label>
                <input value={manuelAdi} onChange={e => setManuelAdi(e.target.value)} placeholder="Firma veya kişi adı" className={`mt-1 ${INPUT}`} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Şehir</label>
                <select value={manuelSehir} onChange={e => setManuelSehir(e.target.value)} className={`mt-1 ${INPUT}`}>
                  {SEHIR_SELECT}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Telefon</label>
                <input value={manuelTel} onChange={e => setManuelTel(e.target.value)} placeholder="0530 000 00 00" className={`mt-1 ${INPUT}`} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">E-posta</label>
                <input type="email" value={manuelEmail} onChange={e => setManuelEmail(e.target.value)} placeholder="ornek@firma.com" className={`mt-1 ${INPUT}`} />
              </div>
            </div>
          )}
        </div>

        {/* ── Bölüm 3: Para Birimi ve KDV ── */}
        <div className="bg-white border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 pb-2 border-b">Para Birimi ve KDV</h2>
          <div className="flex flex-wrap items-end gap-6">
            <div>
              <div className="text-xs font-medium text-gray-600 mb-1.5">Para Birimi</div>
              <div className="flex gap-1">
                {(['TL', 'USD', 'EUR'] as const).map(pb => (
                  <button key={pb} type="button" onClick={() => setParaBirimi(pb)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${paraBirimi === pb ? 'bg-[#C8102E] text-white border-[#C8102E]' : 'bg-white text-gray-700 border-gray-300 hover:border-gray-500'}`}>
                    {pb}
                  </button>
                ))}
              </div>
              {kur && <div className="mt-1.5 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1">1 {paraBirimi} ≈ {kur.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺</div>}
            </div>
            <div className="h-8 border-l border-gray-200 self-center hidden sm:block" />
            <div>
              <div className="text-xs font-medium text-gray-600 mb-1.5">KDV Durumu</div>
              <div className="flex gap-1">
                {([{ value: 'haric', label: 'KDV Hariç' }, { value: 'dahil', label: 'KDV Dahil' }, { value: 'yok', label: 'KDV Yok' }] as const).map(opt => (
                  <button key={opt.value} type="button" onClick={() => setKdvDurumu(opt.value)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${kdvDurumu === opt.value ? 'bg-[#C8102E] text-white border-[#C8102E]' : 'bg-white text-gray-700 border-gray-300 hover:border-gray-500'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {kdvDurumu !== 'yok' && (
              <>
                <div className="h-8 border-l border-gray-200 self-center hidden sm:block" />
                <div>
                  <div className="text-xs font-medium text-gray-600 mb-1.5">KDV Oranı</div>
                  <div className="flex gap-1 items-center">
                    {[1, 10, 20].map(oran => (
                      <button key={oran} type="button" onClick={() => { setKdvOrani(oran); setKdvManuelVal('') }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${kdvOrani === oran && !kdvManuelVal ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-700 border-gray-300 hover:border-gray-500'}`}>
                        %{oran}
                      </button>
                    ))}
                    <div className="flex items-center border rounded-lg overflow-hidden">
                      <span className="px-2 text-sm text-gray-500 bg-gray-50 border-r select-none">%</span>
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
        <div className="bg-white border rounded-lg overflow-hidden" ref={acRef}>
          <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700">Teklif Kalemleri</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1">
                <input type="number" value={karOrani} onChange={e => setKarOrani(e.target.value)} placeholder="örn: 20 veya -10"
                  className="w-28 border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />
                <button type="button" onClick={applyKarOrani}
                  className="text-xs border border-gray-300 text-gray-600 px-2 py-1.5 rounded-lg hover:bg-gray-50 whitespace-nowrap">
                  Kar Uygula
                </button>
              </div>
              <button type="button" onClick={() => setKalemler(prev => [...prev, newKalem()])}
                className="text-xs bg-gray-800 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700">
                + Kalem Ekle
              </button>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase">
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
                <div className="col-span-1 text-center text-xs text-gray-400">{idx + 1}</div>
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
                  {acDropId === k.id && acFiltered.length > 0 && (
                    <div className="absolute z-30 left-0 right-0 top-full mt-0.5 bg-white border border-gray-200 rounded-lg shadow-xl max-h-52 overflow-y-auto">
                      {acFiltered.map(u => (
                        <div key={u.id} onMouseDown={e => { e.preventDefault(); selectUrun(k.id, u) }}
                          className="px-3 py-2 hover:bg-red-50 cursor-pointer border-b last:border-0">
                          <div className="text-sm font-medium text-gray-900">{u.ad}</div>
                          <div className="text-xs text-gray-500 mt-0.5">
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
                <div className="col-span-1 text-right text-sm font-medium text-gray-800 pr-1">
                  {k.toplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                </div>
                <div className="col-span-1 text-center">
                  <button type="button" onClick={() => removeKalem(k.id)} className="text-red-400 hover:text-red-600 text-xl font-bold leading-none">×</button>
                </div>
              </div>
            ))}
          </div>

          {/* Alt toplamlar */}
          <div className="px-4 py-3 bg-gray-50 border-t">
            <div className="ml-auto w-72 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">KDV Hariç Toplam</span>
                <span className="font-medium">{araToplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {paraBirimi}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600 shrink-0">Genel İskonto</span>
                <div className="flex items-center gap-1 ml-auto">
                  <button type="button" onClick={() => setGenelIskontoTip('yuzde')}
                    className={`px-2 py-0.5 text-xs rounded border transition-colors ${genelIskontoTip === 'yuzde' ? 'bg-gray-700 text-white border-gray-700' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`}>%</button>
                  <button type="button" onClick={() => setGenelIskontoTip('tl')}
                    className={`px-2 py-0.5 text-xs rounded border transition-colors ${genelIskontoTip === 'tl' ? 'bg-gray-700 text-white border-gray-700' : 'border-gray-300 text-gray-600 hover:bg-gray-100'}`}>TL</button>
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
                  <span className="text-gray-600">İskonto Sonrası</span>
                  <span className="font-medium">{iskontoSonrasi.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {paraBirimi}</span>
                </div>
              )}
              {kdvDurumu !== 'yok' && (
                <div className="flex justify-between">
                  <span className="text-gray-600">KDV (%{kdvOrani})</span>
                  <span className="font-medium">{kdvTutari.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {paraBirimi}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 border-t border-gray-300">
                <span className="font-bold text-gray-900">Genel Toplam</span>
                <span className="font-bold text-[#C8102E] text-base">{genelToplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} {paraBirimi}</span>
              </div>
              <div className="text-xs text-gray-500 italic">{tutarYaziyla}</div>
            </div>
          </div>
        </div>

        {/* ── Bölüm 5: Notlar ── */}
        <div className="bg-white border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-2 pb-2 border-b">Notlar</h2>
          <textarea value={notlar} onChange={e => setNotlar(e.target.value)} rows={3} placeholder="Teklif ile ilgili notlar..." className={INPUT} />
        </div>

        {/* ── Bölüm 6: Ticari Şartname ── */}
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2 pb-2 border-b">
            <h2 className="text-sm font-semibold text-gray-700">Ticari Şartname</h2>
            <label className="flex items-center gap-2 cursor-pointer">
              <span className="text-xs text-gray-600">PDF'e Ekle</span>
              <div onClick={() => setSartname((p: boolean) => !p)} className={`relative w-10 h-5 rounded-full cursor-pointer transition-colors ${sartname ? 'bg-[#C8102E]' : 'bg-gray-300'}`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${sartname ? 'left-5' : 'left-0.5'}`} />
              </div>
            </label>
          </div>
          {sartname ? <textarea value={sartnameMetin} onChange={e => setSartnameMetin(e.target.value)} rows={10} className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            : <p className="text-xs text-gray-400 italic">Kapalı — PDF'e eklenmeyecek.</p>}
        </div>

        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</div>}

        <div className="flex gap-3 pb-6">
          <button type="submit" disabled={saving}
            className="flex-1 bg-[#C8102E] text-white py-3 rounded-lg font-semibold hover:bg-[#a50d26] disabled:opacity-50 transition-colors text-sm">
            {saving ? 'Kaydediliyor...' : '💾 Güncelle'}
          </button>
          <Link href={`/fiyat-teklifleri/${teklif.id}`} className="px-8 py-3 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors text-center">İptal</Link>
        </div>
      </form>

      {/* ── Dolum fiyat tipi seçim popup ── */}
      {dolumPopup && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
            <div className="px-5 py-4 border-b">
              <h3 className="text-base font-bold text-gray-900">Fiyat Tipi Seçin</h3>
              <p className="text-sm text-gray-500 mt-1">{dolumPopup.urun.ad}</p>
            </div>
            <div className="p-5 space-y-3">
              <button onClick={() => selectDolumTip('bakim')}
                className="w-full flex items-center justify-between p-3 border-2 border-gray-200 rounded-lg hover:border-[#C8102E] hover:bg-red-50 transition-colors text-left">
                <div>
                  <div className="text-sm font-semibold text-gray-900">🔧 Periyodik Bakım</div>
                  <div className="text-xs text-gray-500">Kontrol, basınç testi, rapor</div>
                </div>
                <div className="text-base font-bold text-[#C8102E]">{dolumPopup.urun.periyodik_bakim_fiyati?.toLocaleString('tr-TR')} ₺</div>
              </button>
              <button onClick={() => selectDolumTip('dolum')}
                className="w-full flex items-center justify-between p-3 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left">
                <div>
                  <div className="text-sm font-semibold text-gray-900">💧 Dolum</div>
                  <div className="text-xs text-gray-500">Tam dolum ve bakım</div>
                </div>
                <div className="text-base font-bold text-blue-700">{dolumPopup.urun.dolum_fiyati?.toLocaleString('tr-TR')} ₺</div>
              </button>
            </div>
            <div className="px-5 py-3 border-t">
              <button onClick={() => setDolumPopup(null)} className="w-full py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">İptal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
