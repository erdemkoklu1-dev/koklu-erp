'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatTRDate } from '@/lib/finance/formatters'
import {
  ChevronLeft, Edit, Plus, Check, X, Star, Calendar,
  FileText, Briefcase, User, Phone, Wallet, Clock, Award
} from 'lucide-react'

/* ---- Types ---- */
type Personel = {
  id: string; sicil_no: string | null; ad: string; soyad: string
  tc_kimlik_no: string | null; dogum_tarihi: string | null; dogum_yeri: string | null
  cinsiyet: string | null; medeni_durum: string | null; kan_grubu: string | null; uyruk: string
  telefon: string | null; email: string | null; adres: string | null; sehir: string | null; posta_kodu: string | null
  acil_iletisim_adi: string | null; acil_iletisim_telefonu: string | null; acil_iletisim_yakinligi: string | null
  sube_id: string | null; pozisyon: string | null; departman: string | null
  rol_id: string | null; istihdam_tipi: string | null; calisma_sekli: string | null
  ise_baslama_tarihi: string | null; isten_cikis_tarihi: string | null; sgk_no: string | null; vergi_no: string | null
  maas: number | null; maas_turu: string | null; iban: string | null; banka_adi: string | null
  durum: string; notlar: string | null
  subeler: { ad: string } | null; roller: { ad: string } | null
}
type Izin = { id: string; izin_tipi: string; baslangic_tarihi: string; bitis_tarihi: string; gun_sayisi: number; durum: string; aciklama: string | null; onaylayan: { ad: string; soyad: string } | null }
type Maas = { id: string; odeme_donemi: string; brut_maas: number; sgk_isci_payi: number; sgk_isveren_payi: number; gelir_vergisi: number; damga_vergisi: number; net_maas: number; mesai_ucreti: number; ikramiye: number; toplam_odenen: number; odeme_tarihi: string | null; odeme_yontemi: string; aciklama: string | null; odendi: boolean }
type Mesai = { id: string; tarih: string; giris_saati: string | null; cikis_saati: string | null; calisma_suresi: number | null; mesai_suresi: number | null; mesai_tipi: string; aciklama: string | null }
type Performans = { id: string; donem: string; puan: number | null; kategori: string | null; aciklama: string | null; hedefler: string | null; degerlendiren: { ad: string; soyad: string } | null }
type Belge = { id: string; belge_tipi: string | null; belge_adi: string; belge_no: string | null; verilis_tarihi: string | null; gecerlilik_tarihi: string | null; veren_kurum: string | null; notlar: string | null }
type IzinHakki = { id: string; yil: number; toplam_hak: number; kullanilan: number; kalan: number; devreden: number }
type Sube = { id: string; ad: string }
type PersonelKisa = { id: string; ad: string; soyad: string }

/* ---- Constants ---- */
const DURUM_CFG: Record<string, { label: string; cls: string }> = {
  aktif:  { label: 'Aktif',  cls: 'bg-green-100 text-green-700 border border-green-200' },
  izinli: { label: 'İzinli', cls: 'bg-blue-100 text-blue-700 border border-blue-200' },
  deneme: { label: 'Deneme', cls: 'bg-yellow-100 text-yellow-700 border border-yellow-200' },
  istifa: { label: 'İstifa', cls: 'bg-red-100 text-red-700 border border-red-200' },
  cikis:  { label: 'Çıkış',  cls: 'bg-gray-100 text-gray-600 border border-gray-200' },
}

const IZIN_TIPI_LABEL: Record<string, string> = {
  yillik: 'Yıllık İzin', hastalik: 'Hastalık', mazeret: 'Mazeret',
  ucretsiz: 'Ücretsiz', dogum: 'Doğum', babalik: 'Babalık',
  evlilik: 'Evlilik', olum: 'Ölüm', resmi: 'Resmi Tatil'
}

const IZIN_DURUM_CFG: Record<string, { label: string; cls: string }> = {
  bekliyor:    { label: 'Bekliyor',    cls: 'bg-yellow-100 text-yellow-700' },
  onaylandi:   { label: 'Onaylandı',  cls: 'bg-green-100 text-green-700' },
  reddedildi:  { label: 'Reddedildi', cls: 'bg-red-100 text-red-700' },
  iptal:       { label: 'İptal',       cls: 'bg-gray-100 text-gray-500' },
}

const KATEGORI_LABEL: Record<string, string> = {
  is_kalitesi: 'İş Kalitesi', verimlilik: 'Verimlilik', iletisim: 'İletişim',
  takim_calismasi: 'Takım Çalışması', musteri_memnuniyeti: 'Müşteri Memnuniyeti'
}

const BELGE_TIPI_LABEL: Record<string, string> = {
  diploma: 'Diploma', sertifika: 'Sertifika', ehliyet: 'Ehliyet',
  kimlik: 'Kimlik', sgk: 'SGK', vergi: 'Vergi', diger: 'Diğer'
}

const thCls = 'px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide'
const tdCls = 'px-4 py-3 text-sm text-gray-700'
const INPUT = 'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500'
const SELECT = 'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 bg-white'
const LABEL = 'block text-sm font-medium text-gray-700 mb-1'

type Tab = 'genel' | 'izin' | 'maas' | 'mesai' | 'performans' | 'belgeler' | 'ozluk'

const TABS: { key: Tab; label: string; icon: any }[] = [
  { key: 'genel',       label: 'Genel Bilgiler',    icon: User },
  { key: 'izin',        label: 'İzin Yönetimi',     icon: Calendar },
  { key: 'maas',        label: 'Maaş & Ödemeler',   icon: Wallet },
  { key: 'mesai',       label: 'Mesai Takibi',       icon: Clock },
  { key: 'performans',  label: 'Performans',         icon: Award },
  { key: 'belgeler',    label: 'Belgeler',            icon: FileText },
  { key: 'ozluk',       label: 'Özlük Özeti',        icon: Briefcase },
]

/* Maaş hesaplama yardımcıları */
function hesaplaMaas(brut: number) {
  const sgkIsci     = Math.round(brut * 0.14 * 100) / 100
  const sgkIsveren  = Math.round(brut * 0.205 * 100) / 100
  const matrah      = brut - sgkIsci
  // Basit gelir vergisi dilimi (2026)
  let gv = 0
  if (matrah <= 110000) gv = matrah * 0.15
  else if (matrah <= 230000) gv = 16500 + (matrah - 110000) * 0.20
  else if (matrah <= 870000) gv = 40500 + (matrah - 230000) * 0.27
  else if (matrah <= 3000000) gv = 213300 + (matrah - 870000) * 0.35
  else gv = 958800 + (matrah - 3000000) * 0.40
  gv = Math.round(gv * 100) / 100
  const damga   = Math.round(brut * 0.00759 * 100) / 100
  const net     = Math.round((brut - sgkIsci - gv - damga) * 100) / 100
  return { sgkIsci, sgkIsveren, gv, damga, net }
}

function kidimHesapla(ise_baslama: string | null) {
  if (!ise_baslama) return null
  const start = new Date(ise_baslama)
  const now = new Date()
  const diffMs = now.getTime() - start.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const yil = Math.floor(diffDays / 365)
  const ay  = Math.floor((diffDays % 365) / 30)
  const gun = diffDays % 30
  return { yil, ay, gun }
}

function izinHakkiHesapla(ise_baslama: string | null) {
  if (!ise_baslama) return 14
  const yil = Math.floor((new Date().getTime() - new Date(ise_baslama).getTime()) / (365.25 * 24 * 3600 * 1000))
  if (yil >= 15) return 26
  if (yil >= 5) return 20
  return 14
}

/* =============================================================== */
export default function PersonelDetayClient({
  personel, izinler, maaslar, mesailer, performanslar, belgeler, izinHakki, subeler, personelListesi
}: {
  personel: Personel; izinler: Izin[]; maaslar: Maas[]; mesailer: Mesai[]
  performanslar: Performans[]; belgeler: Belge[]; izinHakki: IzinHakki[]
  subeler: Sube[]; personelListesi: PersonelKisa[]
}) {
  const router = useRouter()
  const supabase = createClient()
  const [tab, setTab] = useState<Tab>('genel')

  /* --- Durum local state (anlık güncelleme) --- */
  const [durum, setDurum] = useState(personel.durum)

  /* --- İzin Modal --- */
  const [izinModal, setIzinModal] = useState(false)
  const [izinForm, setIzinForm] = useState({ izin_tipi: 'yillik', baslangic_tarihi: '', bitis_tarihi: '', aciklama: '' })
  const [izinLoading, setIzinLoading] = useState(false)
  const [localIzinler, setLocalIzinler] = useState<Izin[]>(izinler)

  /* --- Maaş Modal --- */
  const [maasModal, setMaasModal] = useState(false)
  const [maasForm, setMaasForm] = useState({ odeme_donemi: new Date().toISOString().slice(0, 7), brut_maas: '', mesai_ucreti: '0', ikramiye: '0', kesinti: '0', odeme_yontemi: 'havale', aciklama: '' })
  const [maasLoading, setMaasLoading] = useState(false)
  const [localMaaslar, setLocalMaaslar] = useState<Maas[]>(maaslar)

  /* --- Mesai Modal --- */
  const [mesaiModal, setMesaiModal] = useState(false)
  const [mesaiForm, setMesaiForm] = useState({ tarih: new Date().toISOString().split('T')[0], giris_saati: '09:00', cikis_saati: '18:00', mesai_tipi: 'normal', aciklama: '' })
  const [mesaiLoading, setMesaiLoading] = useState(false)
  const [localMesailer, setLocalMesailer] = useState<Mesai[]>(mesailer)

  /* --- Performans Modal --- */
  const [perfModal, setPerfModal] = useState(false)
  const [perfForm, setPerfForm] = useState({ donem: '', puan: '3', kategori: 'is_kalitesi', aciklama: '', hedefler: '' })
  const [perfLoading, setPerfLoading] = useState(false)
  const [localPerformans, setLocalPerformans] = useState<Performans[]>(performanslar)

  /* --- Belge Modal --- */
  const [belgeModal, setBelgeModal] = useState(false)
  const [belgeForm, setBelgeForm] = useState({ belge_tipi: 'diploma', belge_adi: '', belge_no: '', verilis_tarihi: '', gecerlilik_tarihi: '', veren_kurum: '', notlar: '' })
  const [belgeLoading, setBelgeLoading] = useState(false)
  const [localBelgeler, setLocalBelgeler] = useState<Belge[]>(belgeler)

  const kidem = kidimHesapla(personel.ise_baslama_tarihi)
  const durumCfg = DURUM_CFG[durum] ?? { label: durum, cls: 'bg-gray-100 text-gray-600' }

  /* --- İzin Kaydet --- */
  async function kaydetIzin() {
    if (!izinForm.baslangic_tarihi || !izinForm.bitis_tarihi) return
    setIzinLoading(true)
    const bas = new Date(izinForm.baslangic_tarihi)
    const bit = new Date(izinForm.bitis_tarihi)
    const gun = Math.max(1, Math.ceil((bit.getTime() - bas.getTime()) / (1000 * 60 * 60 * 24)) + 1)
    const { data, error } = await supabase.from('personel_izinler').insert([{
      personel_id: personel.id,
      izin_tipi: izinForm.izin_tipi,
      baslangic_tarihi: izinForm.baslangic_tarihi,
      bitis_tarihi: izinForm.bitis_tarihi,
      gun_sayisi: gun,
      aciklama: izinForm.aciklama || null,
    }]).select('*').single()
    if (!error && data) {
      setLocalIzinler(prev => [{ ...data, onaylayan: null } as any, ...prev])
      setIzinModal(false)
      setIzinForm({ izin_tipi: 'yillik', baslangic_tarihi: '', bitis_tarihi: '', aciklama: '' })
    }
    setIzinLoading(false)
  }

  /* --- İzin Onayla/Reddet --- */
  async function izinDurumGuncelle(id: string, yeniDurum: string) {
    await supabase.from('personel_izinler').update({ durum: yeniDurum, onay_tarihi: new Date().toISOString().split('T')[0] }).eq('id', id)
    setLocalIzinler(prev => prev.map(i => i.id === id ? { ...i, durum: yeniDurum } : i))
  }

  /* --- Maaş Kaydet --- */
  async function kaydetMaas() {
    if (!maasForm.brut_maas) return
    setMaasLoading(true)
    const brut = parseFloat(maasForm.brut_maas)
    const { sgkIsci, sgkIsveren, gv, damga, net } = hesaplaMaas(brut)
    const mesai = parseFloat(maasForm.mesai_ucreti) || 0
    const ikramiye = parseFloat(maasForm.ikramiye) || 0
    const kesinti = parseFloat(maasForm.kesinti) || 0
    const toplam = net + mesai + ikramiye - kesinti
    const { data, error } = await supabase.from('maas_odemeleri').insert([{
      personel_id: personel.id,
      odeme_donemi: maasForm.odeme_donemi,
      brut_maas: brut,
      sgk_isci_payi: sgkIsci,
      sgk_isveren_payi: sgkIsveren,
      gelir_vergisi: gv,
      damga_vergisi: damga,
      net_maas: net,
      mesai_ucreti: mesai,
      ikramiye, kesinti,
      toplam_odenen: toplam,
      odeme_yontemi: maasForm.odeme_yontemi,
      aciklama: maasForm.aciklama || null,
    }]).select('*').single()
    if (!error && data) {
      setLocalMaaslar(prev => [data as any, ...prev])
      setMaasModal(false)
    }
    setMaasLoading(false)
  }

  /* --- Maaş Ödendi Toggle --- */
  async function toggleOdendi(id: string, odendi: boolean) {
    await supabase.from('maas_odemeleri').update({ odendi: !odendi, odeme_tarihi: !odendi ? new Date().toISOString().split('T')[0] : null }).eq('id', id)
    setLocalMaaslar(prev => prev.map(m => m.id === id ? { ...m, odendi: !odendi } : m))
  }

  /* --- Mesai Kaydet --- */
  async function kaydetMesai() {
    setMesaiLoading(true)
    const giris = mesaiForm.giris_saati
    const cikis = mesaiForm.cikis_saati
    let calisma = 0
    if (giris && cikis) {
      const [gh, gm] = giris.split(':').map(Number)
      const [ch, cm] = cikis.split(':').map(Number)
      calisma = Math.round(((ch * 60 + cm) - (gh * 60 + gm)) / 60 * 100) / 100
    }
    const mesai = Math.max(0, calisma - 8)
    const { data, error } = await supabase.from('mesai_kayitlari').insert([{
      personel_id: personel.id,
      tarih: mesaiForm.tarih,
      giris_saati: giris || null,
      cikis_saati: cikis || null,
      calisma_suresi: calisma,
      mesai_suresi: mesai,
      mesai_tipi: mesaiForm.mesai_tipi,
      aciklama: mesaiForm.aciklama || null,
    }]).select('*').single()
    if (!error && data) {
      setLocalMesailer(prev => [data as any, ...prev])
      setMesaiModal(false)
    }
    setMesaiLoading(false)
  }

  /* --- Performans Kaydet --- */
  async function kaydetPerformans() {
    setPerfLoading(true)
    const { data, error } = await supabase.from('performans_degerlendirmeleri').insert([{
      personel_id: personel.id,
      donem: perfForm.donem || new Date().toISOString().slice(0, 7),
      puan: parseInt(perfForm.puan),
      kategori: perfForm.kategori,
      aciklama: perfForm.aciklama || null,
      hedefler: perfForm.hedefler || null,
    }]).select('*').single()
    if (!error && data) {
      setLocalPerformans(prev => [{ ...data, degerlendiren: null } as any, ...prev])
      setPerfModal(false)
    }
    setPerfLoading(false)
  }

  /* --- Belge Kaydet --- */
  async function kaydetBelge() {
    if (!belgeForm.belge_adi) return
    setBelgeLoading(true)
    const { data, error } = await supabase.from('personel_belgeler').insert([{
      personel_id: personel.id,
      ...belgeForm,
      verilis_tarihi: belgeForm.verilis_tarihi || null,
      gecerlilik_tarihi: belgeForm.gecerlilik_tarihi || null,
    }]).select('*').single()
    if (!error && data) {
      setLocalBelgeler(prev => [data as any, ...prev])
      setBelgeModal(false)
      setBelgeForm({ belge_tipi: 'diploma', belge_adi: '', belge_no: '', verilis_tarihi: '', gecerlilik_tarihi: '', veren_kurum: '', notlar: '' })
    }
    setBelgeLoading(false)
  }

  /* Maaş brüt preview */
  const brut = parseFloat(maasForm.brut_maas) || 0
  const preview = brut > 0 ? hesaplaMaas(brut) : null

  /* İzin hakları (bu yıl) */
  const buYil = new Date().getFullYear()
  const buYilHak = izinHakki.find(h => h.yil === buYil)
  const hesaplananHak = izinHakkiHesapla(personel.ise_baslama_tarihi)
  const kullanilan = localIzinler.filter(i => i.durum === 'onaylandi' && i.izin_tipi === 'yillik' && new Date(i.baslangic_tarihi).getFullYear() === buYil).reduce((s, i) => s + i.gun_sayisi, 0)
  const kalan = (buYilHak?.toplam_hak ?? hesaplananHak) - kullanilan

  /* Belge durumu */
  const today = new Date()
  const d30 = new Date(); d30.setDate(today.getDate() + 30)
  function belgeRenk(b: Belge) {
    if (!b.gecerlilik_tarihi) return ''
    const exp = new Date(b.gecerlilik_tarihi)
    if (exp < today) return 'bg-red-50 border-red-200'
    if (exp < d30) return 'bg-yellow-50 border-yellow-200'
    return ''
  }

  /* Yıllık maaş bar chart data */
  const maasBarData = (() => {
    const aylar: Record<string, number> = {}
    localMaaslar.forEach(m => { aylar[m.odeme_donemi] = (aylar[m.odeme_donemi] ?? 0) + m.net_maas })
    return Object.entries(aylar).sort(([a], [b]) => a.localeCompare(b)).slice(-12)
  })()
  const maxMaas = Math.max(...maasBarData.map(([, v]) => v), 1)

  return (
    <div className="p-6 max-w-screen-xl mx-auto space-y-6">
      {/* Üst Başlık */}
      <div className="flex items-start gap-4">
        <Link href="/personel" className="text-gray-400 hover:text-gray-600 mt-1"><ChevronLeft size={20} /></Link>
        <div className="flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-[#C8102E] flex items-center justify-center text-white text-xl font-bold flex-shrink-0">
                {personel.ad[0]}{personel.soyad[0]}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{personel.ad} {personel.soyad}</h1>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {personel.pozisyon && <span className="text-sm text-gray-500">{personel.pozisyon}</span>}
                  {personel.subeler && <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full">{personel.subeler.ad}</span>}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${durumCfg.cls}`}>{durumCfg.label}</span>
                  {personel.sicil_no && <span className="text-xs text-gray-400 font-mono">{personel.sicil_no}</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Link href={`/personel/${personel.id}/edit`} className="flex items-center gap-2 border rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                <Edit size={14} /> Düzenle
              </Link>
              <button onClick={() => { setTab('izin'); setIzinModal(true) }} className="flex items-center gap-2 border rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                <Calendar size={14} /> İzin Ekle
              </button>
              <button onClick={() => { setTab('maas'); setMaasModal(true) }} className="flex items-center gap-2 bg-[#C8102E] text-white rounded-lg px-3 py-2 text-sm hover:bg-red-700 transition-colors">
                <Wallet size={14} /> Maaş Öde
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sekmeler */}
      <div className="border-b">
        <div className="flex overflow-x-auto gap-0">
          {TABS.map(t => {
            const Icon = t.icon
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${tab === t.key ? 'border-[#C8102E] text-[#C8102E]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                <Icon size={15} /> {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ═══════ TAB 1: GENEL BİLGİLER ═══════ */}
      {tab === 'genel' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <InfoCard title="Kişisel Bilgiler">
            <InfoRow label="TC Kimlik No"   value={personel.tc_kimlik_no} />
            <InfoRow label="Doğum Tarihi"   value={formatTRDate(personel.dogum_tarihi)} />
            <InfoRow label="Doğum Yeri"     value={personel.dogum_yeri} />
            <InfoRow label="Cinsiyet"        value={personel.cinsiyet === 'erkek' ? 'Erkek' : personel.cinsiyet === 'kadin' ? 'Kadın' : personel.cinsiyet} />
            <InfoRow label="Medeni Durum"   value={personel.medeni_durum === 'bekar' ? 'Bekar' : personel.medeni_durum === 'evli' ? 'Evli' : personel.medeni_durum === 'bosanmis' ? 'Boşanmış' : personel.medeni_durum} />
            <InfoRow label="Kan Grubu"       value={personel.kan_grubu} />
            <InfoRow label="Uyruk"           value={personel.uyruk} />
          </InfoCard>

          <InfoCard title="İletişim">
            <InfoRow label="Telefon"         value={personel.telefon} />
            <InfoRow label="E-posta"         value={personel.email} />
            <InfoRow label="Adres"           value={personel.adres} />
            <InfoRow label="Şehir"           value={personel.sehir} />
            <InfoRow label="Posta Kodu"      value={personel.posta_kodu} />
            <div className="border-t pt-2 mt-2">
              <p className="text-xs text-gray-400 mb-2 uppercase tracking-wide">Acil İletişim</p>
              <InfoRow label="Ad Soyad"      value={personel.acil_iletisim_adi} />
              <InfoRow label="Telefon"       value={personel.acil_iletisim_telefonu} />
              <InfoRow label="Yakınlık"      value={personel.acil_iletisim_yakinligi} />
            </div>
          </InfoCard>

          <InfoCard title="Özlük Bilgileri">
            <InfoRow label="Sicil No"        value={personel.sicil_no} />
            <InfoRow label="Şube"            value={personel.subeler?.ad} />
            <InfoRow label="Pozisyon"        value={personel.pozisyon} />
            <InfoRow label="Departman"       value={personel.departman} />
            <InfoRow label="Rol"             value={personel.roller?.ad} />
            <InfoRow label="İstihdam"        value={personel.istihdam_tipi === 'tam_zamanli' ? 'Tam Zamanlı' : personel.istihdam_tipi === 'yari_zamanli' ? 'Yarı Zamanlı' : personel.istihdam_tipi === 'sozlesmeli' ? 'Sözleşmeli' : personel.istihdam_tipi === 'stajyer' ? 'Stajyer' : personel.istihdam_tipi} />
            <InfoRow label="Çalışma Şekli"  value={personel.calisma_sekli} />
            <InfoRow label="İşe Başlama"    value={formatTRDate(personel.ise_baslama_tarihi)} />
            <InfoRow label="SGK No"          value={personel.sgk_no} />
            <InfoRow label="Vergi No"        value={personel.vergi_no} />
          </InfoCard>

          <InfoCard title="Mali Bilgiler">
            <InfoRow label="Maaş"            value={personel.maas != null ? formatCurrency(personel.maas) : null} />
            <InfoRow label="Maaş Türü"      value={personel.maas_turu} />
            <InfoRow label="IBAN"            value={personel.iban} />
            <InfoRow label="Banka"           value={personel.banka_adi} />
            {personel.notlar && <div className="border-t pt-2 mt-2"><InfoRow label="Notlar" value={personel.notlar} /></div>}
          </InfoCard>
        </div>
      )}

      {/* ═══════ TAB 2: İZİN YÖNETİMİ ═══════ */}
      {tab === 'izin' && (
        <div className="space-y-4">
          {/* Yıllık izin özeti */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Toplam Hak', value: buYilHak?.toplam_hak ?? hesaplananHak, color: 'text-blue-600' },
              { label: 'Kullanılan', value: kullanilan, color: 'text-orange-600' },
              { label: 'Kalan', value: Math.max(0, kalan), color: 'text-green-600' },
              { label: 'Devreden', value: buYilHak?.devreden ?? 0, color: 'text-purple-600' },
            ].map(s => (
              <div key={s.label} className="bg-white rounded-xl border p-4 text-center">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-500 mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Tablo */}
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <p className="font-semibold text-gray-800 text-sm">İzin Talepleri</p>
              <button onClick={() => setIzinModal(true)} className="flex items-center gap-1.5 text-sm text-[#C8102E] hover:underline font-medium">
                <Plus size={14} /> İzin Talebi Ekle
              </button>
            </div>
            <table className="w-full">
              <thead className="border-b"><tr>
                <th className={thCls}>İzin Tipi</th>
                <th className={thCls}>Başlangıç</th>
                <th className={thCls}>Bitiş</th>
                <th className={thCls}>Gün</th>
                <th className={thCls}>Durum</th>
                <th className={thCls}>İşlemler</th>
              </tr></thead>
              <tbody className="divide-y">
                {localIzinler.map(i => {
                  const dc = IZIN_DURUM_CFG[i.durum] ?? { label: i.durum, cls: 'bg-gray-100 text-gray-600' }
                  return (
                    <tr key={i.id} className="hover:bg-gray-50">
                      <td className={tdCls}>{IZIN_TIPI_LABEL[i.izin_tipi] ?? i.izin_tipi}</td>
                      <td className={tdCls}>{formatTRDate(i.baslangic_tarihi)}</td>
                      <td className={tdCls}>{formatTRDate(i.bitis_tarihi)}</td>
                      <td className={tdCls}>{i.gun_sayisi}</td>
                      <td className={tdCls}><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${dc.cls}`}>{dc.label}</span></td>
                      <td className={tdCls}>
                        {i.durum === 'bekliyor' && (
                          <div className="flex items-center gap-2">
                            <button onClick={() => izinDurumGuncelle(i.id, 'onaylandi')} className="text-green-600 hover:text-green-800" title="Onayla"><Check size={15} /></button>
                            <button onClick={() => izinDurumGuncelle(i.id, 'reddedildi')} className="text-red-500 hover:text-red-700" title="Reddet"><X size={15} /></button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {localIzinler.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400 text-sm">İzin kaydı yok.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════ TAB 3: MAAŞ VE ÖDEMELER ═══════ */}
      {tab === 'maas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-gray-800">Maaş Ödemeleri</p>
            <button onClick={() => setMaasModal(true)} className="flex items-center gap-1.5 text-sm text-[#C8102E] hover:underline font-medium">
              <Plus size={14} /> Maaş Ödemesi Ekle
            </button>
          </div>

          {/* Bar chart */}
          {maasBarData.length > 0 && (
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs font-semibold text-gray-500 mb-3 uppercase tracking-wide">Yıllık Net Maaş</p>
              <div className="flex items-end gap-1 h-24">
                {maasBarData.map(([ay, val]) => (
                  <div key={ay} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full bg-[#C8102E] rounded-sm" style={{ height: `${(val / maxMaas) * 80}px` }} title={formatCurrency(val)} />
                    <span className="text-xs text-gray-400">{ay.slice(5)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Maaş kartları */}
          <div className="space-y-3">
            {localMaaslar.map(m => (
              <div key={m.id} className="bg-white rounded-xl border p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="font-semibold text-gray-900">{m.odeme_donemi.slice(0, 4)} / {m.odeme_donemi.slice(5, 7)}</p>
                  <div className="flex items-center gap-2">
                    {m.odendi
                      ? <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 font-medium">Ödendi ✓</span>
                      : <span className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5 font-medium">Ödenmedi</span>
                    }
                    <button onClick={() => toggleOdendi(m.id, m.odendi)} className="text-xs text-[#C8102E] hover:underline">{m.odendi ? 'Geri Al' : 'Ödendi İşaretle'}</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div><p className="text-xs text-gray-400">Brüt</p><p className="font-medium">{formatCurrency(m.brut_maas)}</p></div>
                  <div><p className="text-xs text-gray-400">SGK İşçi</p><p className="text-orange-600">-{formatCurrency(m.sgk_isci_payi)}</p></div>
                  <div><p className="text-xs text-gray-400">Gelir Vergisi</p><p className="text-orange-600">-{formatCurrency(m.gelir_vergisi)}</p></div>
                  <div><p className="text-xs text-gray-400">Damga Vergisi</p><p className="text-orange-600">-{formatCurrency(m.damga_vergisi)}</p></div>
                  <div><p className="text-xs text-gray-400">Net Maaş</p><p className="font-bold text-green-600">{formatCurrency(m.net_maas)}</p></div>
                  {m.mesai_ucreti > 0 && <div><p className="text-xs text-gray-400">Mesai</p><p className="text-blue-600">+{formatCurrency(m.mesai_ucreti)}</p></div>}
                  {m.ikramiye > 0 && <div><p className="text-xs text-gray-400">İkramiye</p><p className="text-blue-600">+{formatCurrency(m.ikramiye)}</p></div>}
                  <div><p className="text-xs text-gray-400">Toplam Ödenen</p><p className="font-bold">{formatCurrency(m.toplam_odenen)}</p></div>
                </div>
                {m.odeme_tarihi && <p className="text-xs text-gray-400 mt-2">Ödeme Tarihi: {formatTRDate(m.odeme_tarihi)} · {m.odeme_yontemi}</p>}
              </div>
            ))}
            {localMaaslar.length === 0 && <div className="bg-white rounded-xl border p-10 text-center text-gray-400 text-sm">Maaş ödemesi bulunamadı.</div>}
          </div>

          {/* İşveren maliyeti özeti */}
          {localMaaslar.length > 0 && (
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Toplam İşveren Maliyeti</p>
              <p className="text-xl font-bold text-[#C8102E]">{formatCurrency(localMaaslar.reduce((s, m) => s + m.brut_maas + m.sgk_isveren_payi, 0))}</p>
              <p className="text-xs text-gray-400 mt-1">Brüt maaş + SGK işveren payı toplamı</p>
            </div>
          )}
        </div>
      )}

      {/* ═══════ TAB 4: MESAİ TAKİBİ ═══════ */}
      {tab === 'mesai' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-gray-800">Mesai Kayıtları</p>
            <button onClick={() => setMesaiModal(true)} className="flex items-center gap-1.5 text-sm text-[#C8102E] hover:underline font-medium">
              <Plus size={14} /> Mesai Kaydı Ekle
            </button>
          </div>
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full">
              <thead className="border-b"><tr>
                <th className={thCls}>Tarih</th>
                <th className={thCls}>Giriş</th>
                <th className={thCls}>Çıkış</th>
                <th className={thCls}>Çalışma</th>
                <th className={thCls}>Mesai</th>
                <th className={thCls}>Tip</th>
              </tr></thead>
              <tbody className="divide-y">
                {localMesailer.map(m => (
                  <tr key={m.id} className={`hover:bg-gray-50 ${(m.mesai_suresi ?? 0) > 0 ? 'bg-orange-50/30' : ''}`}>
                    <td className={`${tdCls} font-medium`}>{formatTRDate(m.tarih)}</td>
                    <td className={tdCls}>{m.giris_saati ?? '-'}</td>
                    <td className={tdCls}>{m.cikis_saati ?? '-'}</td>
                    <td className={tdCls}>{m.calisma_suresi != null ? `${m.calisma_suresi} sa` : '-'}</td>
                    <td className={tdCls}>
                      {(m.mesai_suresi ?? 0) > 0
                        ? <span className="text-orange-600 font-medium">{m.mesai_suresi} sa</span>
                        : '-'
                      }
                    </td>
                    <td className={tdCls}>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${m.mesai_tipi === 'resmi_tatil' ? 'bg-red-100 text-red-700' : m.mesai_tipi === 'hafta_sonu' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                        {m.mesai_tipi === 'normal' ? 'Normal' : m.mesai_tipi === 'hafta_sonu' ? 'H.Sonu' : 'Resmi'}
                      </span>
                    </td>
                  </tr>
                ))}
                {localMesailer.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400 text-sm">Mesai kaydı yok.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════ TAB 5: PERFORMANS ═══════ */}
      {tab === 'performans' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-gray-800">Performans Değerlendirmeleri</p>
            <button onClick={() => setPerfModal(true)} className="flex items-center gap-1.5 text-sm text-[#C8102E] hover:underline font-medium">
              <Plus size={14} /> Değerlendirme Ekle
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {localPerformans.map(p => (
              <div key={p.id} className="bg-white rounded-xl border p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-gray-900">{p.donem}</p>
                  <div className="flex items-center gap-0.5">
                    {[1,2,3,4,5].map(s => (
                      <Star key={s} size={16} className={s <= (p.puan ?? 0) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'} />
                    ))}
                  </div>
                </div>
                {p.kategori && <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">{KATEGORI_LABEL[p.kategori] ?? p.kategori}</span>}
                {p.aciklama && <p className="text-sm text-gray-600">{p.aciklama}</p>}
                {p.hedefler && <p className="text-xs text-gray-400 border-t pt-2 mt-2"><span className="font-medium">Hedefler:</span> {p.hedefler}</p>}
                {p.degerlendiren && <p className="text-xs text-gray-400">Değerlendiren: {p.degerlendiren.ad} {p.degerlendiren.soyad}</p>}
              </div>
            ))}
            {localPerformans.length === 0 && <div className="col-span-2 bg-white rounded-xl border p-10 text-center text-gray-400 text-sm">Performans değerlendirmesi yok.</div>}
          </div>
        </div>
      )}

      {/* ═══════ TAB 6: BELGELER ═══════ */}
      {tab === 'belgeler' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-gray-800">Belgeler ve Sertifikalar</p>
            <button onClick={() => setBelgeModal(true)} className="flex items-center gap-1.5 text-sm text-[#C8102E] hover:underline font-medium">
              <Plus size={14} /> Belge Ekle
            </button>
          </div>
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full">
              <thead className="border-b"><tr>
                <th className={thCls}>Tip</th>
                <th className={thCls}>Belge Adı</th>
                <th className={thCls}>Belge No</th>
                <th className={thCls}>Veriliş</th>
                <th className={thCls}>Geçerlilik</th>
                <th className={thCls}>Kurum</th>
              </tr></thead>
              <tbody className="divide-y">
                {localBelgeler.map(b => {
                  const cls = belgeRenk(b)
                  return (
                    <tr key={b.id} className={`hover:bg-gray-50 ${cls}`}>
                      <td className={tdCls}><span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full">{BELGE_TIPI_LABEL[b.belge_tipi ?? ''] ?? b.belge_tipi}</span></td>
                      <td className={`${tdCls} font-medium`}>{b.belge_adi}</td>
                      <td className={tdCls}>{b.belge_no ?? '-'}</td>
                      <td className={tdCls}>{formatTRDate(b.verilis_tarihi)}</td>
                      <td className={tdCls}>
                        {b.gecerlilik_tarihi
                          ? <span className={`${new Date(b.gecerlilik_tarihi) < today ? 'text-red-600 font-medium' : new Date(b.gecerlilik_tarihi) < d30 ? 'text-yellow-600 font-medium' : ''}`}>{formatTRDate(b.gecerlilik_tarihi)}</span>
                          : '-'
                        }
                      </td>
                      <td className={tdCls}>{b.veren_kurum ?? '-'}</td>
                    </tr>
                  )
                })}
                {localBelgeler.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400 text-sm">Belge kaydı yok.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════ TAB 7: ÖZLÜK ÖZETİ ═══════ */}
      {tab === 'ozluk' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border p-4 space-y-4">
            <p className="font-semibold text-gray-800">Kıdem Bilgisi</p>
            {kidem ? (
              <div className="grid grid-cols-3 gap-4 text-center">
                <div><p className="text-3xl font-bold text-[#C8102E]">{kidem.yil}</p><p className="text-xs text-gray-400">Yıl</p></div>
                <div><p className="text-3xl font-bold text-[#C8102E]">{kidem.ay}</p><p className="text-xs text-gray-400">Ay</p></div>
                <div><p className="text-3xl font-bold text-[#C8102E]">{kidem.gun}</p><p className="text-xs text-gray-400">Gün</p></div>
              </div>
            ) : <p className="text-sm text-gray-400">İşe başlama tarihi girilmemiş.</p>}
            <div className="border-t pt-3 text-sm space-y-1">
              <InfoRow label="İşe Giriş"     value={formatTRDate(personel.ise_baslama_tarihi)} />
              {personel.isten_cikis_tarihi && <InfoRow label="İşten Çıkış" value={formatTRDate(personel.isten_cikis_tarihi)} />}
              <InfoRow label="Pozisyon"      value={personel.pozisyon} />
              <InfoRow label="Departman"     value={personel.departman} />
              <InfoRow label="İstihdam"      value={personel.istihdam_tipi} />
            </div>
          </div>

          <div className="bg-white rounded-xl border p-4 space-y-4">
            <p className="font-semibold text-gray-800">Özet İstatistikler</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-sm text-gray-500">Toplam İzin Kullanımı</span>
                <span className="font-semibold">{localIzinler.filter(i => i.durum === 'onaylandi').reduce((s, i) => s + i.gun_sayisi, 0)} gün</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-sm text-gray-500">Toplam Maaş Ödemesi</span>
                <span className="font-semibold text-green-600">{formatCurrency(localMaaslar.filter(m => m.odendi).reduce((s, m) => s + m.toplam_odenen, 0))}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-sm text-gray-500">Toplam Mesai</span>
                <span className="font-semibold">{localMesailer.reduce((s, m) => s + (m.mesai_suresi ?? 0), 0).toFixed(1)} sa</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b">
                <span className="text-sm text-gray-500">Performans Değerlendirmesi</span>
                <span className="font-semibold">{localPerformans.length} adet</span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-sm text-gray-500">Belge Sayısı</span>
                <span className="font-semibold">{localBelgeler.length} adet</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ MODALLER ═══════ */}

      {/* İzin Modal */}
      {izinModal && (
        <Modal title="İzin Talebi Ekle" onClose={() => setIzinModal(false)}>
          <div className="space-y-3">
            <div>
              <label className={LABEL}>İzin Tipi</label>
              <select value={izinForm.izin_tipi} onChange={e => setIzinForm(f => ({ ...f, izin_tipi: e.target.value }))} className={SELECT}>
                {Object.entries(IZIN_TIPI_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={LABEL}>Başlangıç</label><input type="date" value={izinForm.baslangic_tarihi} onChange={e => setIzinForm(f => ({ ...f, baslangic_tarihi: e.target.value }))} className={INPUT} /></div>
              <div><label className={LABEL}>Bitiş</label><input type="date" value={izinForm.bitis_tarihi} onChange={e => setIzinForm(f => ({ ...f, bitis_tarihi: e.target.value }))} className={INPUT} /></div>
            </div>
            <div><label className={LABEL}>Açıklama</label><textarea value={izinForm.aciklama} onChange={e => setIzinForm(f => ({ ...f, aciklama: e.target.value }))} rows={2} className={INPUT} /></div>
            <button onClick={kaydetIzin} disabled={izinLoading || !izinForm.baslangic_tarihi || !izinForm.bitis_tarihi}
              className="w-full bg-[#C8102E] text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50">{izinLoading ? 'Kaydediliyor...' : 'Kaydet'}</button>
          </div>
        </Modal>
      )}

      {/* Maaş Modal */}
      {maasModal && (
        <Modal title="Maaş Ödemesi Ekle" onClose={() => setMaasModal(false)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className={LABEL}>Dönem</label><input type="month" value={maasForm.odeme_donemi} onChange={e => setMaasForm(f => ({ ...f, odeme_donemi: e.target.value }))} className={INPUT} /></div>
              <div><label className={LABEL}>Brüt Maaş (₺)</label><input type="number" value={maasForm.brut_maas} onChange={e => setMaasForm(f => ({ ...f, brut_maas: e.target.value }))} className={INPUT} /></div>
            </div>
            {preview && (
              <div className="bg-gray-50 rounded-lg p-3 text-sm grid grid-cols-2 gap-2">
                <div className="text-gray-500">SGK İşçi (%14): <span className="text-orange-600 font-medium">{formatCurrency(preview.sgkIsci)}</span></div>
                <div className="text-gray-500">SGK İşveren (%20.5): <span className="text-orange-600 font-medium">{formatCurrency(preview.sgkIsveren)}</span></div>
                <div className="text-gray-500">Gelir Vergisi: <span className="text-orange-600 font-medium">{formatCurrency(preview.gv)}</span></div>
                <div className="text-gray-500">Damga (%0.759): <span className="text-orange-600 font-medium">{formatCurrency(preview.damga)}</span></div>
                <div className="col-span-2 border-t pt-2 font-bold">Net Maaş: <span className="text-green-600">{formatCurrency(preview.net)}</span></div>
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div><label className={LABEL}>Mesai (₺)</label><input type="number" value={maasForm.mesai_ucreti} onChange={e => setMaasForm(f => ({ ...f, mesai_ucreti: e.target.value }))} className={INPUT} /></div>
              <div><label className={LABEL}>İkramiye (₺)</label><input type="number" value={maasForm.ikramiye} onChange={e => setMaasForm(f => ({ ...f, ikramiye: e.target.value }))} className={INPUT} /></div>
              <div><label className={LABEL}>Kesinti (₺)</label><input type="number" value={maasForm.kesinti} onChange={e => setMaasForm(f => ({ ...f, kesinti: e.target.value }))} className={INPUT} /></div>
            </div>
            <div>
              <label className={LABEL}>Ödeme Yöntemi</label>
              <select value={maasForm.odeme_yontemi} onChange={e => setMaasForm(f => ({ ...f, odeme_yontemi: e.target.value }))} className={SELECT}>
                <option value="havale">Havale</option>
                <option value="nakit">Nakit</option>
                <option value="cek">Çek</option>
              </select>
            </div>
            <div><label className={LABEL}>Açıklama</label><input value={maasForm.aciklama} onChange={e => setMaasForm(f => ({ ...f, aciklama: e.target.value }))} className={INPUT} /></div>
            <button onClick={kaydetMaas} disabled={maasLoading || !maasForm.brut_maas}
              className="w-full bg-[#C8102E] text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50">{maasLoading ? 'Kaydediliyor...' : 'Kaydet'}</button>
          </div>
        </Modal>
      )}

      {/* Mesai Modal */}
      {mesaiModal && (
        <Modal title="Mesai Kaydı Ekle" onClose={() => setMesaiModal(false)}>
          <div className="space-y-3">
            <div><label className={LABEL}>Tarih</label><input type="date" value={mesaiForm.tarih} onChange={e => setMesaiForm(f => ({ ...f, tarih: e.target.value }))} className={INPUT} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={LABEL}>Giriş Saati</label><input type="time" value={mesaiForm.giris_saati} onChange={e => setMesaiForm(f => ({ ...f, giris_saati: e.target.value }))} className={INPUT} /></div>
              <div><label className={LABEL}>Çıkış Saati</label><input type="time" value={mesaiForm.cikis_saati} onChange={e => setMesaiForm(f => ({ ...f, cikis_saati: e.target.value }))} className={INPUT} /></div>
            </div>
            <div>
              <label className={LABEL}>Mesai Tipi</label>
              <select value={mesaiForm.mesai_tipi} onChange={e => setMesaiForm(f => ({ ...f, mesai_tipi: e.target.value }))} className={SELECT}>
                <option value="normal">Normal</option>
                <option value="hafta_sonu">Hafta Sonu</option>
                <option value="resmi_tatil">Resmi Tatil</option>
              </select>
            </div>
            <div><label className={LABEL}>Açıklama</label><input value={mesaiForm.aciklama} onChange={e => setMesaiForm(f => ({ ...f, aciklama: e.target.value }))} className={INPUT} /></div>
            <button onClick={kaydetMesai} disabled={mesaiLoading}
              className="w-full bg-[#C8102E] text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50">{mesaiLoading ? 'Kaydediliyor...' : 'Kaydet'}</button>
          </div>
        </Modal>
      )}

      {/* Performans Modal */}
      {perfModal && (
        <Modal title="Performans Değerlendirmesi Ekle" onClose={() => setPerfModal(false)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className={LABEL}>Dönem</label><input value={perfForm.donem} onChange={e => setPerfForm(f => ({ ...f, donem: e.target.value }))} placeholder="2026-Q2" className={INPUT} /></div>
              <div>
                <label className={LABEL}>Puan (1-5)</label>
                <div className="flex items-center gap-1 mt-1">
                  {[1,2,3,4,5].map(s => (
                    <button key={s} onClick={() => setPerfForm(f => ({ ...f, puan: String(s) }))}>
                      <Star size={24} className={s <= parseInt(perfForm.puan) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'} />
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className={LABEL}>Kategori</label>
              <select value={perfForm.kategori} onChange={e => setPerfForm(f => ({ ...f, kategori: e.target.value }))} className={SELECT}>
                {Object.entries(KATEGORI_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div><label className={LABEL}>Açıklama</label><textarea value={perfForm.aciklama} onChange={e => setPerfForm(f => ({ ...f, aciklama: e.target.value }))} rows={2} className={INPUT} /></div>
            <div><label className={LABEL}>Hedefler</label><textarea value={perfForm.hedefler} onChange={e => setPerfForm(f => ({ ...f, hedefler: e.target.value }))} rows={2} className={INPUT} /></div>
            <button onClick={kaydetPerformans} disabled={perfLoading}
              className="w-full bg-[#C8102E] text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50">{perfLoading ? 'Kaydediliyor...' : 'Kaydet'}</button>
          </div>
        </Modal>
      )}

      {/* Belge Modal */}
      {belgeModal && (
        <Modal title="Belge Ekle" onClose={() => setBelgeModal(false)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={LABEL}>Belge Tipi</label>
                <select value={belgeForm.belge_tipi} onChange={e => setBelgeForm(f => ({ ...f, belge_tipi: e.target.value }))} className={SELECT}>
                  {Object.entries(BELGE_TIPI_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div><label className={LABEL}>Belge Adı *</label><input value={belgeForm.belge_adi} onChange={e => setBelgeForm(f => ({ ...f, belge_adi: e.target.value }))} className={INPUT} /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className={LABEL}>Belge No</label><input value={belgeForm.belge_no} onChange={e => setBelgeForm(f => ({ ...f, belge_no: e.target.value }))} className={INPUT} /></div>
              <div><label className={LABEL}>Veriliş Tarihi</label><input type="date" value={belgeForm.verilis_tarihi} onChange={e => setBelgeForm(f => ({ ...f, verilis_tarihi: e.target.value }))} className={INPUT} /></div>
              <div><label className={LABEL}>Geçerlilik Tarihi</label><input type="date" value={belgeForm.gecerlilik_tarihi} onChange={e => setBelgeForm(f => ({ ...f, gecerlilik_tarihi: e.target.value }))} className={INPUT} /></div>
            </div>
            <div><label className={LABEL}>Veren Kurum</label><input value={belgeForm.veren_kurum} onChange={e => setBelgeForm(f => ({ ...f, veren_kurum: e.target.value }))} className={INPUT} /></div>
            <div><label className={LABEL}>Notlar</label><input value={belgeForm.notlar} onChange={e => setBelgeForm(f => ({ ...f, notlar: e.target.value }))} className={INPUT} /></div>
            <button onClick={kaydetBelge} disabled={belgeLoading || !belgeForm.belge_adi}
              className="w-full bg-[#C8102E] text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50">{belgeLoading ? 'Kaydediliyor...' : 'Kaydet'}</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ---- Yardımcı Bileşenler ---- */
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border p-4">
      <p className="font-semibold text-gray-800 mb-3 text-sm uppercase tracking-wide text-gray-400">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-gray-400 w-32 flex-shrink-0">{label}</span>
      <span className="text-gray-800 font-medium">{value}</span>
    </div>
  )
}
