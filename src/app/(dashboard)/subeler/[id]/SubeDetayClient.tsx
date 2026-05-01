'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatTRDate, INVOICE_STATUS_CONFIG, MONTHS_TR } from '@/lib/finance/formatters'

type Sube = {
  id: string; ad: string; tip: string; sehir: string | null; ilce: string | null
  adres: string | null; telefon: string | null; email: string | null
  yetkili_kisi: string | null; yetkili_telefon: string | null
  acilis_tarihi: string | null; aktif: boolean; notlar: string | null
}
type Musteri  = { id: string; full_name: string; il: string | null; phone: string | null; sube_id?: string | null }
type Fatura   = { id: string; invoice_number: string | null; invoice_date: string | null; due_date: string | null; total_amount: number | null; paid_amount: number | null; status: string | null; customer_id?: string | null; supplier_name?: string | null; customers?: { full_name: string } | null }
type Servis   = { id: string; form_number: string | null; service_date: string | null; technician_name: string | null; customers?: { full_name: string } | null }
type GelirGider = { id: string; tarih: string; tip: string; kategori: string | null; aciklama: string | null; tutar: number; belge_no: string | null; created_at: string }
type Calisan  = { id: string; ad_soyad: string | null; email: string | null; telefon: string | null; roller?: { ad: string } | null }
type PersonelKisa = { id: string; sicil_no: string | null; ad: string; soyad: string; pozisyon: string | null; durum: string }

type Props = {
  sube: Sube
  musteriler: Musteri[]
  tumMusteriler: Musteri[]
  gidenFaturalar: Fatura[]
  gelenFaturalar: Fatura[]
  servisFormlari: Servis[]
  gelirGiderler: GelirGider[]
  calisanlar: Calisan[]
  personeller: PersonelKisa[]
}

const TIP_CFG: Record<string, { label: string; cls: string }> = {
  merkez: { label: 'Merkez', cls: 'bg-red-50 text-red-700 border-red-200' },
  sube:   { label: 'Şube',   cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  depo:   { label: 'Depo',   cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  ofis:   { label: 'Ofis',   cls: 'bg-purple-50 text-purple-700 border-purple-200' },
}

type Tab = 'musteriler' | 'giden' | 'gelen' | 'servis' | 'gelir_gider' | 'mali' | 'calisanlar'

const TABS: { key: Tab; label: string }[] = [
  { key: 'musteriler',  label: 'Müşteriler' },
  { key: 'giden',       label: 'Giden Faturalar' },
  { key: 'gelen',       label: 'Gelen Faturalar' },
  { key: 'servis',      label: 'Servis Formları' },
  { key: 'gelir_gider', label: 'Gelir / Gider' },
  { key: 'mali',        label: 'Mali Özet' },
  { key: 'calisanlar',  label: 'Çalışanlar' },
]

export default function SubeDetayClient({ sube, musteriler, tumMusteriler, gidenFaturalar, gelenFaturalar, servisFormlari, gelirGiderler, calisanlar, personeller }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [activeTab, setActiveTab] = useState<Tab>('musteriler')
  const [gelirGiderAlt, setGelirGiderAlt] = useState<'gelir' | 'gider'>('gelir')

  // Müşteri Ata modal
  const [musteriAtaAcik, setMusteriAtaAcik] = useState(false)
  const [musteriAra, setMusteriAra] = useState('')
  const [seciliMusteriler, setSeciliMusteriler] = useState<Set<string>>(new Set())
  const [ataLoading, setAtaLoading] = useState(false)

  // Gelir/Gider modal
  const [ggAcik, setGgAcik] = useState(false)
  const [ggLoading, setGgLoading] = useState(false)
  const [ggForm, setGgForm] = useState({ tarih: new Date().toISOString().split('T')[0], tip: 'gelir', kategori: '', aciklama: '', tutar: '', belge_no: '' })

  // Rapor modal
  const [raporAcik, setRaporAcik] = useState(false)
  const [raporDonemAy, setRaporDonemAy] = useState('')
  const [raporDonemYil, setRaporDonemYil] = useState(String(new Date().getFullYear()))
  const [raporTip, setRaporTip] = useState<'tam' | 'mali' | 'musteri'>('tam')
  const [printConfig, setPrintConfig] = useState<{ tip: string; donem: string } | null>(null)

  // KPI calculations
  const toplamAlacak = gidenFaturalar.reduce((s, f) => s + Math.max(0, (f.total_amount ?? 0) - (f.paid_amount ?? 0)), 0)
  const toplamBorc   = gelenFaturalar.reduce((s, f) => s + Math.max(0, (f.total_amount ?? 0) - (f.paid_amount ?? 0)), 0)
  const netPozisyon  = toplamAlacak - toplamBorc

  const now = new Date()
  const buAyKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const buAyServis  = servisFormlari.filter(s => s.service_date?.startsWith(buAyKey)).length
  const buAyGelir   = gidenFaturalar.filter(f => f.invoice_date?.startsWith(buAyKey)).reduce((s, f) => s + (f.total_amount ?? 0), 0)
                    + gelirGiderler.filter(g => g.tip === 'gelir' && g.tarih.startsWith(buAyKey)).reduce((s, g) => s + g.tutar, 0)
  const buAyGider   = gelenFaturalar.filter(f => f.invoice_date?.startsWith(buAyKey)).reduce((s, f) => s + (f.total_amount ?? 0), 0)
                    + gelirGiderler.filter(g => g.tip === 'gider' && g.tarih.startsWith(buAyKey)).reduce((s, g) => s + g.tutar, 0)

  // Mali özet (12 ay)
  const maliOzet = useMemo(() => {
    const months = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const fatGelir  = gidenFaturalar.filter(f => f.invoice_date?.startsWith(key)).reduce((s, f) => s + (f.total_amount ?? 0), 0)
      const fatGider  = gelenFaturalar.filter(f => f.invoice_date?.startsWith(key)).reduce((s, f) => s + (f.total_amount ?? 0), 0)
      const manGelir  = gelirGiderler.filter(g => g.tip === 'gelir' && g.tarih.startsWith(key)).reduce((s, g) => s + g.tutar, 0)
      const manGider  = gelirGiderler.filter(g => g.tip === 'gider' && g.tarih.startsWith(key)).reduce((s, g) => s + g.tutar, 0)
      months.push({ label: `${MONTHS_TR[d.getMonth()]} ${d.getFullYear()}`, gelir: fatGelir + manGelir, gider: fatGider + manGider, net: (fatGelir + manGelir) - (fatGider + manGider) })
    }
    return months
  }, [gidenFaturalar, gelenFaturalar, gelirGiderler])

  const maxMali = Math.max(...maliOzet.map(m => Math.max(m.gelir, m.gider)), 1)

  // Ata modal: filter customers not in this branch
  const ataListesi = useMemo(() => {
    const inBranch = new Set(musteriler.map(m => m.id))
    return tumMusteriler.filter(m => !inBranch.has(m.id) && (!musteriAra || m.full_name.toLowerCase().includes(musteriAra.toLowerCase())))
  }, [tumMusteriler, musteriler, musteriAra])

  async function musteriAta() {
    if (seciliMusteriler.size === 0) return
    setAtaLoading(true)
    await supabase.from('customers').update({ sube_id: sube.id }).in('id', Array.from(seciliMusteriler))
    setAtaLoading(false)
    setMusteriAtaAcik(false)
    setSeciliMusteriler(new Set())
    router.refresh()
  }

  async function gelirGiderEkle() {
    if (!ggForm.tutar || !ggForm.tarih) return
    setGgLoading(true)
    await supabase.from('sube_gider_gelir').insert([{
      sube_id: sube.id,
      tarih: ggForm.tarih,
      tip: ggForm.tip,
      kategori: ggForm.kategori || null,
      aciklama: ggForm.aciklama || null,
      tutar: parseFloat(ggForm.tutar),
      belge_no: ggForm.belge_no || null,
    }])
    setGgLoading(false)
    setGgAcik(false)
    setGgForm({ tarih: new Date().toISOString().split('T')[0], tip: 'gelir', kategori: '', aciklama: '', tutar: '', belge_no: '' })
    router.refresh()
  }

  function raporOlustur() {
    const ay = raporDonemAy ? parseInt(raporDonemAy) : null
    const donem = ay ? `${MONTHS_TR[ay - 1]} ${raporDonemYil}` : raporDonemYil
    setPrintConfig({ tip: raporTip, donem })
    setRaporAcik(false)
    setTimeout(() => window.print(), 100)
  }

  const cfg = TIP_CFG[sube.tip] ?? { label: sube.tip, cls: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600' }
  const inp = 'mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]'
  const thCls = 'text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide'
  const tdCls = 'px-4 py-3 text-sm text-gray-700 dark:text-gray-300'

  const printDonem = printConfig?.donem ?? ''
  const printTip   = printConfig?.tip ?? 'tam'

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-700">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b px-6 py-4 flex items-center justify-between no-print">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#C8102E] rounded-lg flex items-center justify-center text-white font-bold text-sm">K</div>
          <Link href="/subeler" className="text-gray-500 dark:text-gray-400 hover:text-gray-700 text-sm">← Şubeler</Link>
          <span className="text-gray-300">/</span>
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">{sube.ad}</h1>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${cfg.cls}`}>{cfg.label}</span>
          {!sube.aktif && <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full">Pasif</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setRaporAcik(true)} className="text-sm border text-gray-600 dark:text-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50">
            Rapor Al
          </button>
          <Link href={`/subeler/${sube.id}/edit`} className="bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26]">
            Düzenle
          </Link>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* Şube bilgi kartı */}
        <div className="bg-white dark:bg-gray-800 border rounded-xl p-5 no-print">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            {sube.adres      && <div><span className="text-gray-400 dark:text-gray-500 text-xs">Adres</span><div className="text-gray-800 dark:text-gray-200 mt-0.5">{sube.adres}{sube.ilce ? `, ${sube.ilce}` : ''}{sube.sehir ? ` / ${sube.sehir}` : ''}</div></div>}
            {sube.telefon    && <div><span className="text-gray-400 dark:text-gray-500 text-xs">Telefon</span><div className="text-gray-800 dark:text-gray-200 mt-0.5">{sube.telefon}</div></div>}
            {sube.email      && <div><span className="text-gray-400 dark:text-gray-500 text-xs">E-posta</span><div className="text-gray-800 dark:text-gray-200 mt-0.5">{sube.email}</div></div>}
            {sube.yetkili_kisi && <div><span className="text-gray-400 dark:text-gray-500 text-xs">Yetkili</span><div className="text-gray-800 dark:text-gray-200 mt-0.5">{sube.yetkili_kisi} {sube.yetkili_telefon ? `(${sube.yetkili_telefon})` : ''}</div></div>}
            {sube.acilis_tarihi && <div><span className="text-gray-400 dark:text-gray-500 text-xs">Açılış</span><div className="text-gray-800 dark:text-gray-200 mt-0.5">{formatTRDate(sube.acilis_tarihi)}</div></div>}
            {sube.notlar     && <div className="col-span-2"><span className="text-gray-400 dark:text-gray-500 text-xs">Notlar</span><div className="text-gray-800 dark:text-gray-200 mt-0.5">{sube.notlar}</div></div>}
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 no-print">
          {[
            { label: 'Müşteri', value: musteriler.length, cls: 'text-gray-900 dark:text-gray-100', fmt: false },
            { label: 'Toplam Alacak', value: toplamAlacak, cls: 'text-orange-600', fmt: true },
            { label: 'Toplam Borç', value: toplamBorc, cls: 'text-red-600', fmt: true },
            { label: 'Net Pozisyon', value: netPozisyon, cls: netPozisyon >= 0 ? 'text-green-600' : 'text-red-600', fmt: true },
            { label: 'Bu Ay Servis', value: buAyServis, cls: 'text-gray-900 dark:text-gray-100', fmt: false },
            { label: 'Bu Ay Gelir', value: buAyGelir, cls: 'text-green-600', fmt: true },
            { label: 'Bu Ay Gider', value: buAyGider, cls: 'text-red-600', fmt: true },
          ].map(kpi => (
            <div key={kpi.label} className="bg-white dark:bg-gray-800 border rounded-xl p-4">
              <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">{kpi.label}</div>
              <div className={`text-base font-bold ${kpi.cls}`}>{kpi.fmt ? formatCurrency(kpi.value as number) : kpi.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="no-print">
          <div className="flex gap-1 border-b bg-white dark:bg-gray-800 rounded-t-xl px-4 overflow-x-auto">
            {TABS.map(t => (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === t.key ? 'border-[#C8102E] text-[#C8102E]' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700'}`}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="bg-white dark:bg-gray-800 border border-t-0 rounded-b-xl overflow-hidden">

            {/* --- TAB 1: MÜŞTERİLER --- */}
            {activeTab === 'musteriler' && (
              <div>
                <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 dark:bg-gray-700">
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{musteriler.length} Müşteri</span>
                  <button onClick={() => setMusteriAtaAcik(true)} className="text-xs bg-[#C8102E] text-white px-3 py-1.5 rounded-lg hover:bg-[#a50d26]">
                    + Müşteri Ata
                  </button>
                </div>
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700 border-b">
                    <tr>
                      <th className={thCls}>Müşteri</th>
                      <th className={thCls}>Şehir</th>
                      <th className={thCls}>Telefon</th>
                      <th className={thCls}></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {musteriler.map(m => (
                      <tr key={m.id} className="hover:bg-gray-50">
                        <td className={`${tdCls} font-medium`}>{m.full_name}</td>
                        <td className={tdCls}>{m.il ?? '-'}</td>
                        <td className={tdCls}>{m.phone ?? '-'}</td>
                        <td className="px-4 py-3">
                          <Link href={`/customers/${m.id}`} className="text-[#C8102E] text-xs hover:underline">Detay →</Link>
                        </td>
                      </tr>
                    ))}
                    {musteriler.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-gray-400 dark:text-gray-500 text-sm">Bu şubeye atanmış müşteri yok.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}

            {/* --- TAB 2: GİDEN FATURALAR --- */}
            {activeTab === 'giden' && (
              <div>
                <div className="flex gap-6 px-4 py-3 border-b bg-gray-50 dark:bg-gray-700 text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Toplam: <span className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(gidenFaturalar.reduce((s, f) => s + (f.total_amount ?? 0), 0))}</span></span>
                  <span className="text-gray-500 dark:text-gray-400">Tahsil: <span className="font-semibold text-green-600">{formatCurrency(gidenFaturalar.reduce((s, f) => s + (f.paid_amount ?? 0), 0))}</span></span>
                  <span className="text-gray-500 dark:text-gray-400">Kalan: <span className="font-semibold text-orange-600">{formatCurrency(toplamAlacak)}</span></span>
                </div>
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700 border-b"><tr>
                    <th className={thCls}>Fatura No</th>
                    <th className={thCls}>Müşteri</th>
                    <th className={thCls}>Tarih</th>
                    <th className={thCls + ' text-right'}>Tutar</th>
                    <th className={thCls + ' text-right'}>Kalan</th>
                    <th className={thCls}>Durum</th>
                  </tr></thead>
                  <tbody className="divide-y">
                    {gidenFaturalar.map(f => {
                      const kalan = Math.max(0, (f.total_amount ?? 0) - (f.paid_amount ?? 0))
                      const scfg = INVOICE_STATUS_CONFIG[f.status ?? ''] ?? { label: f.status ?? '-', className: '' }
                      return (
                        <tr key={f.id} className="hover:bg-gray-50">
                          <td className={`${tdCls} font-mono font-medium text-[#C8102E]`}>{f.invoice_number ?? '-'}</td>
                          <td className={tdCls}>{(f.customers as any)?.full_name ?? '-'}</td>
                          <td className={tdCls}>{formatTRDate(f.invoice_date)}</td>
                          <td className={tdCls + ' text-right'}>{formatCurrency(f.total_amount)}</td>
                          <td className={`${tdCls} text-right font-medium ${kalan > 0 ? 'text-orange-600' : 'text-green-600'}`}>{formatCurrency(kalan)}</td>
                          <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${scfg.className}`}>{scfg.label}</span></td>
                        </tr>
                      )
                    })}
                    {gidenFaturalar.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400 dark:text-gray-500 text-sm">Bu şubeye ait giden fatura yok.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}

            {/* --- TAB 3: GELEN FATURALAR --- */}
            {activeTab === 'gelen' && (
              <div>
                <div className="flex gap-6 px-4 py-3 border-b bg-gray-50 dark:bg-gray-700 text-sm">
                  <span className="text-gray-500 dark:text-gray-400">Toplam Borç: <span className="font-semibold text-red-600">{formatCurrency(toplamBorc)}</span></span>
                  <span className="text-gray-500 dark:text-gray-400">Toplam: <span className="font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(gelenFaturalar.reduce((s, f) => s + (f.total_amount ?? 0), 0))}</span></span>
                </div>
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700 border-b"><tr>
                    <th className={thCls}>Fatura No</th>
                    <th className={thCls}>Tedarikçi</th>
                    <th className={thCls}>Tarih</th>
                    <th className={thCls + ' text-right'}>Tutar</th>
                    <th className={thCls + ' text-right'}>Kalan</th>
                    <th className={thCls}>Durum</th>
                  </tr></thead>
                  <tbody className="divide-y">
                    {gelenFaturalar.map(f => {
                      const kalan = Math.max(0, (f.total_amount ?? 0) - (f.paid_amount ?? 0))
                      const scfg = INVOICE_STATUS_CONFIG[f.status ?? ''] ?? { label: f.status ?? '-', className: '' }
                      return (
                        <tr key={f.id} className="hover:bg-gray-50">
                          <td className={`${tdCls} font-mono font-medium text-[#C8102E]`}>{f.invoice_number ?? '-'}</td>
                          <td className={tdCls}>{f.supplier_name ?? '-'}</td>
                          <td className={tdCls}>{formatTRDate(f.invoice_date)}</td>
                          <td className={tdCls + ' text-right'}>{formatCurrency(f.total_amount)}</td>
                          <td className={`${tdCls} text-right font-medium ${kalan > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(kalan)}</td>
                          <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${scfg.className}`}>{scfg.label}</span></td>
                        </tr>
                      )
                    })}
                    {gelenFaturalar.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-gray-400 dark:text-gray-500 text-sm">Bu şubeye ait gelen fatura yok.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}

            {/* --- TAB 4: SERVİS FORMLARI --- */}
            {activeTab === 'servis' && (
              <div>
                <div className="px-4 py-3 border-b bg-gray-50 dark:bg-gray-700 text-sm text-gray-500 dark:text-gray-400">
                  Toplam {servisFormlari.length} form · Bu ay: <span className="font-semibold text-gray-900 dark:text-gray-100">{buAyServis}</span>
                </div>
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700 border-b"><tr>
                    <th className={thCls}>Form No</th>
                    <th className={thCls}>Müşteri</th>
                    <th className={thCls}>Tarih</th>
                    <th className={thCls}>Teknisyen</th>
                    <th className={thCls}></th>
                  </tr></thead>
                  <tbody className="divide-y">
                    {servisFormlari.map(s => (
                      <tr key={s.id} className="hover:bg-gray-50">
                        <td className={`${tdCls} font-mono font-medium text-[#C8102E]`}>{s.form_number ?? '-'}</td>
                        <td className={tdCls}>{(s.customers as any)?.full_name ?? '-'}</td>
                        <td className={tdCls}>{formatTRDate(s.service_date)}</td>
                        <td className={tdCls}>{s.technician_name ?? '-'}</td>
                        <td className="px-4 py-3"><Link href={`/service-forms/${s.id}`} className="text-[#C8102E] text-xs hover:underline">Detay →</Link></td>
                      </tr>
                    ))}
                    {servisFormlari.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400 dark:text-gray-500 text-sm">Bu şubeye ait servis formu yok.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}

            {/* --- TAB 5: GELİR / GİDER --- */}
            {activeTab === 'gelir_gider' && (
              <div>
                <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 dark:bg-gray-700">
                  <div className="flex gap-1">
                    {(['gelir', 'gider'] as const).map(t => (
                      <button key={t} onClick={() => setGelirGiderAlt(t)}
                        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${gelirGiderAlt === t ? 'bg-[#C8102E] text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100'}`}>
                        {t === 'gelir' ? 'Gelirler' : 'Giderler'}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setGgAcik(true)} className="text-xs bg-[#C8102E] text-white px-3 py-1.5 rounded-lg hover:bg-[#a50d26]">
                    + Ekle
                  </button>
                </div>
                {(() => {
                  const rows = gelirGiderler.filter(g => g.tip === gelirGiderAlt)
                  const toplam = rows.reduce((s, g) => s + g.tutar, 0)
                  return (
                    <div>
                      <table className="w-full">
                        <thead className="bg-gray-50 dark:bg-gray-700 border-b"><tr>
                          <th className={thCls}>Tarih</th>
                          <th className={thCls}>Kategori</th>
                          <th className={thCls}>Açıklama</th>
                          <th className={thCls}>Belge No</th>
                          <th className={thCls + ' text-right'}>Tutar</th>
                        </tr></thead>
                        <tbody className="divide-y">
                          {rows.map(g => (
                            <tr key={g.id} className="hover:bg-gray-50">
                              <td className={tdCls}>{formatTRDate(g.tarih)}</td>
                              <td className={tdCls}>{g.kategori ?? '-'}</td>
                              <td className={tdCls}>{g.aciklama ?? '-'}</td>
                              <td className={tdCls}>{g.belge_no ?? '-'}</td>
                              <td className={`${tdCls} text-right font-medium ${gelirGiderAlt === 'gelir' ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(g.tutar)}</td>
                            </tr>
                          ))}
                          {rows.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400 dark:text-gray-500 text-sm">Kayıt yok.</td></tr>}
                        </tbody>
                      </table>
                      {rows.length > 0 && (
                        <div className="px-4 py-3 border-t bg-gray-50 dark:bg-gray-700 flex justify-end text-sm">
                          <span className="text-gray-500 dark:text-gray-400">Dönem Toplamı: <span className={`font-bold ${gelirGiderAlt === 'gelir' ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(toplam)}</span></span>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}

            {/* --- TAB 6: MALİ ÖZET --- */}
            {activeTab === 'mali' && (
              <div className="p-4 space-y-4">
                {/* Bar chart */}
                <div className="space-y-2">
                  {maliOzet.slice(-6).map(m => (
                    <div key={m.label} className="flex items-center gap-3 text-xs">
                      <span className="w-20 text-gray-500 dark:text-gray-400 text-right shrink-0">{m.label.split(' ')[0]}</span>
                      <div className="flex-1 flex gap-1 h-5">
                        <div className="bg-green-400 rounded-sm" style={{ width: `${(m.gelir / maxMali) * 100}%`, minWidth: m.gelir > 0 ? '2px' : '0' }} title={`Gelir: ${formatCurrency(m.gelir)}`} />
                        <div className="bg-red-400 rounded-sm" style={{ width: `${(m.gider / maxMali) * 100}%`, minWidth: m.gider > 0 ? '2px' : '0' }} title={`Gider: ${formatCurrency(m.gider)}`} />
                      </div>
                      <span className={`w-24 text-right font-medium shrink-0 ${m.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(m.net)}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-3 text-xs ml-20 mt-2">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-400 inline-block" /> Gelir</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-400 inline-block" /> Gider</span>
                  </div>
                </div>
                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border rounded-xl overflow-hidden">
                    <thead className="bg-gray-50 dark:bg-gray-700 border-b">
                      <tr>
                        <th className={thCls}>Ay</th>
                        <th className={thCls + ' text-right'}>Gelir</th>
                        <th className={thCls + ' text-right'}>Gider</th>
                        <th className={thCls + ' text-right'}>Net</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {maliOzet.map(m => (
                        <tr key={m.label} className="hover:bg-gray-50">
                          <td className={tdCls + ' font-medium'}>{m.label}</td>
                          <td className={tdCls + ' text-right text-green-600'}>{formatCurrency(m.gelir)}</td>
                          <td className={tdCls + ' text-right text-red-600'}>{formatCurrency(m.gider)}</td>
                          <td className={`${tdCls} text-right font-bold ${m.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(m.net)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t bg-gray-50 dark:bg-gray-700">
                      <tr>
                        <td className={tdCls + ' font-bold text-gray-900 dark:text-gray-100'}>Toplam (12 Ay)</td>
                        <td className={tdCls + ' text-right font-bold text-green-600'}>{formatCurrency(maliOzet.reduce((s, m) => s + m.gelir, 0))}</td>
                        <td className={tdCls + ' text-right font-bold text-red-600'}>{formatCurrency(maliOzet.reduce((s, m) => s + m.gider, 0))}</td>
                        <td className={`${tdCls} text-right font-bold ${maliOzet.reduce((s, m) => s + m.net, 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(maliOzet.reduce((s, m) => s + m.net, 0))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* --- TAB 7: ÇALIŞANLAR --- */}
            {activeTab === 'calisanlar' && (
              <div className="p-4 space-y-4">
                {/* Personeller (IK modülü) */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Personel ({personeller.length})</p>
                    <Link href={`/personel/new?sube=${sube.id}`} className="text-xs text-[#C8102E] hover:underline font-medium">+ Yeni Personel</Link>
                  </div>
                  <table className="w-full border rounded-xl overflow-hidden text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700 border-b"><tr>
                      <th className={thCls}>Sicil No</th>
                      <th className={thCls}>Ad Soyad</th>
                      <th className={thCls}>Pozisyon</th>
                      <th className={thCls}>Durum</th>
                    </tr></thead>
                    <tbody className="divide-y">
                      {personeller.map(p => {
                        const DURUM_CLS: Record<string,string> = { aktif:'bg-green-100 text-green-700', izinli:'bg-blue-100 text-blue-700', deneme:'bg-yellow-100 text-yellow-700', istifa:'bg-red-100 text-red-700', cikis:'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400' }
                        const DURUM_LABEL: Record<string,string> = { aktif:'Aktif', izinli:'İzinli', deneme:'Deneme', istifa:'İstifa', cikis:'Çıkış' }
                        return (
                          <tr key={p.id} className="hover:bg-gray-50">
                            <td className={`${tdCls} font-mono text-xs text-gray-500 dark:text-gray-400`}>{p.sicil_no ?? '-'}</td>
                            <td className={tdCls}>
                              <Link href={`/personel/${p.id}`} className="font-medium text-gray-900 dark:text-gray-100 hover:text-[#C8102E]">{p.ad} {p.soyad}</Link>
                            </td>
                            <td className={tdCls}>{p.pozisyon ?? '-'}</td>
                            <td className={tdCls}><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DURUM_CLS[p.durum] ?? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'}`}>{DURUM_LABEL[p.durum] ?? p.durum}</span></td>
                          </tr>
                        )
                      })}
                      {personeller.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400 dark:text-gray-500 text-sm">Bu şubede kayıtlı personel yok.</td></tr>}
                    </tbody>
                  </table>
                </div>

                {/* Sistem Kullanıcıları */}
                {calisanlar.length > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Sistem Kullanıcıları ({calisanlar.length})</p>
                    <table className="w-full border rounded-xl overflow-hidden text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-700 border-b"><tr>
                        <th className={thCls}>Ad Soyad</th>
                        <th className={thCls}>Rol</th>
                        <th className={thCls}>E-posta</th>
                        <th className={thCls}>Telefon</th>
                      </tr></thead>
                      <tbody className="divide-y">
                        {calisanlar.map(c => (
                          <tr key={c.id} className="hover:bg-gray-50">
                            <td className={`${tdCls} font-medium`}>{c.ad_soyad ?? '-'}</td>
                            <td className={tdCls}>{(c.roller as any)?.ad ?? '-'}</td>
                            <td className={tdCls}>{c.email ?? '-'}</td>
                            <td className={tdCls}>{c.telefon ?? '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── MODAL: MÜŞTERİ ATA ─── */}
      {musteriAtaAcik && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-bold text-gray-900 dark:text-gray-100">Müşteri Ata</h3>
              <button onClick={() => { setMusteriAtaAcik(false); setSeciliMusteriler(new Set()) }} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="px-5 py-3 border-b">
              <input value={musteriAra} onChange={e => setMusteriAra(e.target.value)} placeholder="Müşteri ara..." className={inp} />
            </div>
            <div className="overflow-y-auto flex-1">
              {ataListesi.map(m => (
                <div key={m.id} onClick={() => setSeciliMusteriler(prev => { const n = new Set(prev); n.has(m.id) ? n.delete(m.id) : n.add(m.id); return n })}
                  className={`flex items-center gap-3 px-5 py-3 cursor-pointer border-b hover:bg-gray-50 ${seciliMusteriler.has(m.id) ? 'bg-red-50' : ''}`}>
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${seciliMusteriler.has(m.id) ? 'bg-[#C8102E] border-[#C8102E]' : 'border-gray-300 dark:border-gray-600'}`}>
                    {seciliMusteriler.has(m.id) && <span className="text-white text-xs leading-none">✓</span>}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{m.full_name}</div>
                    {m.il && <div className="text-xs text-gray-400 dark:text-gray-500">{m.il}</div>}
                  </div>
                </div>
              ))}
              {ataListesi.length === 0 && <div className="px-5 py-10 text-center text-gray-400 dark:text-gray-500 text-sm">Atanacak müşteri bulunamadı.</div>}
            </div>
            <div className="px-5 py-4 border-t flex gap-3">
              <button onClick={musteriAta} disabled={ataLoading || seciliMusteriler.size === 0}
                className="flex-1 bg-[#C8102E] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26] disabled:opacity-50">
                {ataLoading ? 'Atanıyor...' : `${seciliMusteriler.size} Müşteriyi Ata`}
              </button>
              <button onClick={() => { setMusteriAtaAcik(false); setSeciliMusteriler(new Set()) }} className="px-4 py-2 border rounded-lg text-sm text-gray-600 dark:text-gray-300">İptal</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: GELİR/GİDER EKLE ─── */}
      {ggAcik && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-bold text-gray-900 dark:text-gray-100">Gelir / Gider Ekle</h3>
              <button onClick={() => setGgAcik(false)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Tip</label>
                  <select value={ggForm.tip} onChange={e => setGgForm(p => ({ ...p, tip: e.target.value }))} className={inp + ' bg-white dark:bg-gray-800'}>
                    <option value="gelir">Gelir</option>
                    <option value="gider">Gider</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Tarih</label>
                  <input type="date" value={ggForm.tarih} onChange={e => setGgForm(p => ({ ...p, tarih: e.target.value }))} className={inp} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Tutar (₺) *</label>
                <input type="number" step="0.01" value={ggForm.tutar} onChange={e => setGgForm(p => ({ ...p, tutar: e.target.value }))} className={inp} placeholder="0.00" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Kategori</label>
                <input value={ggForm.kategori} onChange={e => setGgForm(p => ({ ...p, kategori: e.target.value }))} className={inp} placeholder="Kira, Elektrik, Satış..." />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Açıklama</label>
                <textarea value={ggForm.aciklama} onChange={e => setGgForm(p => ({ ...p, aciklama: e.target.value }))} rows={2} className={inp + ' resize-none'} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Belge No</label>
                <input value={ggForm.belge_no} onChange={e => setGgForm(p => ({ ...p, belge_no: e.target.value }))} className={inp} />
              </div>
            </div>
            <div className="flex gap-3 px-5 pb-5">
              <button onClick={gelirGiderEkle} disabled={ggLoading || !ggForm.tutar}
                className="flex-1 bg-[#C8102E] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26] disabled:opacity-50">
                {ggLoading ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
              <button onClick={() => setGgAcik(false)} className="px-4 py-2 border rounded-lg text-sm text-gray-600 dark:text-gray-300">İptal</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: RAPOR AL ─── */}
      {raporAcik && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h3 className="font-bold text-gray-900 dark:text-gray-100">Rapor Al</h3>
              <button onClick={() => setRaporAcik(false)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Dönem Yılı</label>
                <select value={raporDonemYil} onChange={e => setRaporDonemYil(e.target.value)} className={inp + ' bg-white dark:bg-gray-800'}>
                  {[0, 1, 2].map(i => { const y = new Date().getFullYear() - i; return <option key={y} value={y}>{y}</option> })}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Ay (boş = tüm yıl)</label>
                <select value={raporDonemAy} onChange={e => setRaporDonemAy(e.target.value)} className={inp + ' bg-white dark:bg-gray-800'}>
                  <option value="">Tüm Yıl</option>
                  {MONTHS_TR.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Rapor Tipi</label>
                <select value={raporTip} onChange={e => setRaporTip(e.target.value as any)} className={inp + ' bg-white dark:bg-gray-800'}>
                  <option value="tam">Tam Rapor</option>
                  <option value="mali">Sadece Mali</option>
                  <option value="musteri">Müşteri Listesi</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 px-5 pb-5">
              <button onClick={raporOlustur} className="flex-1 bg-[#C8102E] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26]">
                PDF Oluştur
              </button>
              <button onClick={() => setRaporAcik(false)} className="px-4 py-2 border rounded-lg text-sm text-gray-600 dark:text-gray-300">İptal</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── PRINT ONLY ─── */}
      <div className="print-only hidden p-8 text-sm">
        {/* Başlık */}
        <div className="flex items-start justify-between mb-6 pb-4 border-b-2 border-gray-800">
          <div>
            <div className="text-xl font-bold">KÖKLÜ YANGIN SÖNDÜRME CİHAZLARI</div>
            <div className="text-base font-semibold mt-1">{sube.ad} — Şube Raporu</div>
            <div className="text-gray-600 dark:text-gray-300 mt-0.5">Dönem: {printDonem}</div>
          </div>
          <div className="text-right text-gray-600 dark:text-gray-300 text-xs">
            <div>Rapor Tarihi: {new Date().toLocaleDateString('tr-TR')}</div>
            {sube.telefon && <div>{sube.telefon}</div>}
            {sube.email && <div>{sube.email}</div>}
          </div>
        </div>

        {/* Şube bilgileri */}
        {(printTip === 'tam' || printTip === 'mali') && (
          <div className="mb-6">
            <table className="w-full border-collapse text-xs mb-4">
              <tbody>
                <tr><td className="py-0.5 pr-4 text-gray-500 dark:text-gray-400 w-32">Tip</td><td className="py-0.5 font-medium">{cfg.label}</td><td className="py-0.5 pr-4 text-gray-500 dark:text-gray-400 w-32">Şehir</td><td className="py-0.5 font-medium">{sube.sehir} {sube.ilce && `/ ${sube.ilce}`}</td></tr>
                {sube.adres && <tr><td className="py-0.5 text-gray-500 dark:text-gray-400">Adres</td><td className="py-0.5 font-medium" colSpan={3}>{sube.adres}</td></tr>}
                {sube.yetkili_kisi && <tr><td className="py-0.5 text-gray-500 dark:text-gray-400">Yetkili</td><td className="py-0.5 font-medium">{sube.yetkili_kisi}</td><td className="py-0.5 text-gray-500 dark:text-gray-400">Yetkili Tel</td><td className="py-0.5 font-medium">{sube.yetkili_telefon ?? '-'}</td></tr>}
              </tbody>
            </table>
            {/* KPI */}
            <div className="grid grid-cols-4 gap-3 mb-4">
              {[
                { l: 'Müşteri Sayısı', v: musteriler.length, fmt: false },
                { l: 'Toplam Alacak', v: toplamAlacak, fmt: true },
                { l: 'Toplam Borç', v: toplamBorc, fmt: true },
                { l: 'Net Pozisyon', v: netPozisyon, fmt: true },
              ].map(k => (
                <div key={k.l} className="border rounded p-2 text-center">
                  <div className="text-xs text-gray-500 dark:text-gray-400">{k.l}</div>
                  <div className="font-bold text-sm mt-0.5">{k.fmt ? formatCurrency(k.v as number) : k.v}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Müşteri listesi */}
        {(printTip === 'tam' || printTip === 'musteri') && musteriler.length > 0 && (
          <div className="mb-6">
            <div className="font-bold text-sm mb-2 border-b pb-1">Müşteri Listesi</div>
            <table className="w-full border-collapse text-xs">
              <thead><tr className="border-b bg-gray-50 dark:bg-gray-700">
                <th className="text-left py-1 pr-3">Müşteri</th>
                <th className="text-left py-1 pr-3">Şehir</th>
                <th className="text-left py-1">Telefon</th>
              </tr></thead>
              <tbody>{musteriler.map(m => (
                <tr key={m.id} className="border-b">
                  <td className="py-1 pr-3">{m.full_name}</td>
                  <td className="py-1 pr-3">{m.il ?? '-'}</td>
                  <td className="py-1">{m.phone ?? '-'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}

        {/* Fatura özeti */}
        {(printTip === 'tam' || printTip === 'mali') && (
          <div className="mb-6">
            <div className="font-bold text-sm mb-2 border-b pb-1">Giden Faturalar</div>
            <table className="w-full border-collapse text-xs">
              <thead><tr className="border-b bg-gray-50 dark:bg-gray-700">
                <th className="text-left py-1 pr-3">Fatura No</th>
                <th className="text-left py-1 pr-3">Müşteri</th>
                <th className="text-left py-1 pr-3">Tarih</th>
                <th className="text-right py-1">Tutar</th>
                <th className="text-right py-1">Kalan</th>
              </tr></thead>
              <tbody>{gidenFaturalar.map(f => (
                <tr key={f.id} className="border-b">
                  <td className="py-1 pr-3 font-mono">{f.invoice_number ?? '-'}</td>
                  <td className="py-1 pr-3">{(f.customers as any)?.full_name ?? '-'}</td>
                  <td className="py-1 pr-3">{formatTRDate(f.invoice_date)}</td>
                  <td className="py-1 text-right">{formatCurrency(f.total_amount)}</td>
                  <td className="py-1 text-right">{formatCurrency(Math.max(0, (f.total_amount ?? 0) - (f.paid_amount ?? 0)))}</td>
                </tr>
              ))}</tbody>
            </table>
            <div className="text-right text-xs mt-2 font-semibold">Toplam Alacak: {formatCurrency(toplamAlacak)}</div>
          </div>
        )}

        {/* Mali özet tablo */}
        {(printTip === 'tam' || printTip === 'mali') && (
          <div className="mb-6">
            <div className="font-bold text-sm mb-2 border-b pb-1">Aylık Mali Özet (Son 12 Ay)</div>
            <table className="w-full border-collapse text-xs">
              <thead><tr className="border-b bg-gray-50 dark:bg-gray-700">
                <th className="text-left py-1 pr-3">Ay</th>
                <th className="text-right py-1 pr-3">Gelir</th>
                <th className="text-right py-1 pr-3">Gider</th>
                <th className="text-right py-1">Net</th>
              </tr></thead>
              <tbody>{maliOzet.map(m => (
                <tr key={m.label} className="border-b">
                  <td className="py-1 pr-3">{m.label}</td>
                  <td className="py-1 pr-3 text-right">{formatCurrency(m.gelir)}</td>
                  <td className="py-1 pr-3 text-right">{formatCurrency(m.gider)}</td>
                  <td className="py-1 text-right font-semibold">{formatCurrency(m.net)}</td>
                </tr>
              ))}</tbody>
              <tfoot><tr className="border-t font-bold">
                <td className="py-1 pr-3">Toplam</td>
                <td className="py-1 pr-3 text-right">{formatCurrency(maliOzet.reduce((s, m) => s + m.gelir, 0))}</td>
                <td className="py-1 pr-3 text-right">{formatCurrency(maliOzet.reduce((s, m) => s + m.gider, 0))}</td>
                <td className="py-1 text-right">{formatCurrency(maliOzet.reduce((s, m) => s + m.net, 0))}</td>
              </tr></tfoot>
            </table>
          </div>
        )}

        <div className="mt-8 pt-4 border-t text-xs text-gray-400 dark:text-gray-500 text-center">
          Bu rapor Köklü ERP sistemi tarafından otomatik oluşturulmuştur.
        </div>
      </div>
    </div>
  )
}
