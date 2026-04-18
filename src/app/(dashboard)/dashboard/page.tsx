import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { formatCurrency, formatTRDate } from '@/lib/finance/formatters'
import {
  ClipboardList, Users, FileText, Wallet,
  TrendingUp, TrendingDown, AlertTriangle, Package
} from 'lucide-react'

// ─── Tipler ───────────────────────────────────────────────────
type Rol = 'Admin' | 'İdari Çalışan' | 'Saha Tekniker' | 'Pazarlamacı' | 'Fabrika'

// ─── Yardımcılar ─────────────────────────────────────────────
function safe(n: number | null | undefined) { return n ?? 0 }

function DurumBadge({ durum }: { durum: string }) {
  const cfg: Record<string, string> = {
    completed:   'bg-green-50 text-green-700 border-green-200',
    tamamlandi:  'bg-green-50 text-green-700 border-green-200',
    bekliyor:    'bg-blue-50 text-blue-700 border-blue-200',
    beklemede:   'bg-blue-50 text-blue-700 border-blue-200',
    devam_ediyor:'bg-orange-50 text-orange-700 border-orange-200',
  }
  const label: Record<string, string> = {
    completed:   'Tamamlandı',
    tamamlandi:  'Tamamlandı',
    bekliyor:    'Bekliyor',
    beklemede:   'Beklemede',
    devam_ediyor:'Devam Ediyor',
  }
  const cls = cfg[durum] ?? 'bg-gray-100 text-gray-600 border-gray-200'
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {label[durum] ?? durum}
    </span>
  )
}

function KpiKart({
  href, baslik, deger, alt, color = 'default',
}: {
  href: string; baslik: string; deger: string | number
  alt?: string; color?: 'default' | 'yellow' | 'red' | 'green'
}) {
  const bg   = { default: 'bg-white', yellow: 'bg-yellow-50 border-yellow-200', red: 'bg-red-50 border-red-200', green: 'bg-green-50 border-green-200' }
  const text = { default: 'text-gray-900', yellow: 'text-yellow-700', red: 'text-red-700', green: 'text-green-700' }
  const sub  = { default: 'text-gray-400', yellow: 'text-yellow-600', red: 'text-red-500', green: 'text-green-600' }
  return (
    <Link href={href} className={`${bg[color]} border rounded-xl p-5 hover:shadow-sm transition-shadow block`}>
      <div className={`text-xs font-medium mb-1 ${sub[color]}`}>{baslik}</div>
      <div className={`text-2xl font-bold ${text[color]}`}>{deger}</div>
      {alt && <div className={`text-xs mt-1 ${sub[color]}`}>{alt}</div>}
    </Link>
  )
}

// ─── Hatırlatmalar: cihazları müşteri bazlı grupla ─────────────
function buildHatirlatmalar(devices: any[], today: Date) {
  const map = new Map<string, { id: string; full_name: string; count: number; minDays: number }>()
  for (const d of devices ?? []) {
    const c = d.customers as any
    if (!c) continue
    const days = Math.floor((new Date(d.expiry_date).getTime() - today.getTime()) / 86400000)
    if (!map.has(c.id)) map.set(c.id, { id: c.id, full_name: c.full_name, count: 0, minDays: days })
    const row = map.get(c.id)!
    row.count++
    if (days < row.minDays) row.minDays = days
  }
  return Array.from(map.values())
    .sort((a, b) => a.minDays - b.minDays)
    .slice(0, 5)
}

function GunBadge({ days }: { days: number }) {
  if (days < 0) return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">{Math.abs(days)}g gecikti</span>
  if (days <= 7) return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-orange-100 text-orange-700">{days} gün</span>
  return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700">{days} gün</span>
}

// ─── Aylık Servis Dağılımı ─────────────────────────────────────
function servisDagilim(items: any[]) {
  const cats = [
    { key: 'KKT Dolumu',       test: (n: string) => /kkt/i.test(n) },
    { key: 'CO2 Dolumu',       test: (n: string) => /co2/i.test(n) },
    { key: 'Periyodik Bakım',  test: (n: string) => /bakim|bakım|periyodik/i.test(n) },
    { key: 'Yeni Cihaz Satışı',test: (n: string) => /satış|satis|yeni cihaz/i.test(n) },
    { key: 'Yedek Parça',      test: (n: string) => /parça|parca|yedek/i.test(n) },
  ]
  const counts: Record<string, number> = Object.fromEntries(cats.map(c => [c.key, 0]))
  for (const item of items ?? []) {
    const name = (item.device_name ?? '').toLowerCase()
    for (const cat of cats) {
      if (cat.test(name)) { counts[cat.key]++; break }
    }
  }
  return cats.map(c => ({ label: c.key, sayi: counts[c.key] }))
}

// ─── ANA SAYFA ────────────────────────────────────────────────
export default async function DashboardPage() {
  const supabase    = await createClient()
  const svcSupabase = createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  const today        = new Date(); today.setHours(0, 0, 0, 0)
  const todayStr     = today.toISOString().split('T')[0]
  const monthStart   = new Date(today.getFullYear(), today.getMonth(), 1).toISOString()
  const monthStartDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const in90Days     = new Date(today); in90Days.setDate(in90Days.getDate() + 90)
  const in90DaysStr  = in90Days.toISOString().split('T')[0]

  // ── Rol çek ──────────────────────────────────────────────────
  let rol: Rol = 'Admin'
  if (user) {
    const { data: profil } = await svcSupabase
      .from('kullanici_profiller')
      .select('roller(ad)')
      .eq('id', user.id)
      .single()
    const rolAd = (profil?.roller as any)?.ad as string | undefined
    if (rolAd) rol = rolAd as Rol
  }

  const isAdminOrIdari   = rol === 'Admin' || rol === 'İdari Çalışan'
  const isPazarlamaci    = rol === 'Pazarlamacı'
  const isFabrika        = rol === 'Fabrika'
  const isSaha           = rol === 'Saha Tekniker'

  const dateLabel = new Date().toLocaleDateString('tr-TR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  // ── Fabrika rolü için özel veri ───────────────────────────────
  if (isFabrika) {
    const [{ data: hammaddeler }, { data: aktifEmir }, { count: tamamlananEmir }] = await Promise.all([
      svcSupabase.from('hammaddeler')
        .select('id, ad, birim, mevcut_stok, minimum_stok')
        .eq('aktif', true)
        .order('mevcut_stok', { ascending: true })
        .limit(10),
      svcSupabase.from('uretim_emirleri')
        .select('id, urun_adi, miktar, durum')
        .in('durum', ['beklemede', 'devam_ediyor'])
        .order('created_at', { ascending: false })
        .limit(8),
      svcSupabase.from('uretim_emirleri')
        .select('id', { count: 'exact', head: true })
        .eq('durum', 'tamamlandi')
        .gte('updated_at', monthStart),
    ])

    const kritikler = (hammaddeler ?? []).filter((h: any) => Number(h.mevcut_stok) < Number(h.minimum_stok))

    return (
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Fabrika Paneli</h1>
            <p className="text-sm text-gray-400 mt-0.5 capitalize">{dateLabel}</p>
          </div>
          <Link href="/fabrika" className="border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            Fabrika →
          </Link>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className={`border rounded-xl p-5 ${kritikler.length > 0 ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
            <div className={`text-xs font-medium mb-1 ${kritikler.length > 0 ? 'text-red-500' : 'text-gray-500'}`}>Kritik Stok</div>
            <div className={`text-2xl font-bold ${kritikler.length > 0 ? 'text-red-700' : 'text-green-700'}`}>{kritikler.length}</div>
            <div className="text-xs text-gray-400 mt-1">{kritikler.length > 0 ? 'hammadde kritik' : 'stok yeterli'}</div>
          </div>
          <div className="bg-white border rounded-xl p-5">
            <div className="text-xs font-medium text-gray-500 mb-1">Aktif Emir</div>
            <div className="text-2xl font-bold text-blue-700">{(aktifEmir ?? []).length}</div>
            <div className="text-xs text-gray-400 mt-1">üretim emri</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-xl p-5">
            <div className="text-xs font-medium text-green-600 mb-1">Bu Ay Tamamlanan</div>
            <div className="text-2xl font-bold text-green-700">{tamamlananEmir ?? 0}</div>
            <div className="text-xs text-green-500 mt-1">üretim emri</div>
          </div>
          <div className="bg-white border rounded-xl p-5">
            <div className="text-xs font-medium text-gray-500 mb-1">Hammadde</div>
            <div className="text-2xl font-bold text-gray-900">{(hammaddeler ?? []).length}</div>
            <div className="text-xs text-gray-400 mt-1">kayıtlı hammadde</div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Kritik Stok */}
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Düşük Stok Uyarıları</h2>
              <Link href="/fabrika" className="text-xs text-[#C8102E] hover:underline">Fabrika →</Link>
            </div>
            {kritikler.length > 0 ? (
              <div className="divide-y">
                {kritikler.slice(0, 6).map((h: any) => {
                  const pct = Number(h.minimum_stok) > 0 ? Math.round(Number(h.mevcut_stok) / Number(h.minimum_stok) * 100) : 100
                  const badge = pct === 0 ? 'bg-red-100 text-red-700' : pct < 50 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                  const label = pct === 0 ? 'Kritik' : pct < 50 ? 'Uyarı' : 'Düşük'
                  return (
                    <div key={h.id} className="px-5 py-3 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{h.ad}</div>
                        <div className="text-xs text-gray-400">{Number(h.mevcut_stok).toLocaleString('tr-TR')} / min {Number(h.minimum_stok).toLocaleString('tr-TR')} {h.birim}</div>
                      </div>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${badge}`}>{label}</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="px-4 py-8 text-center text-sm text-gray-400">Tüm stoklar yeterli.</div>
            )}
          </div>

          {/* Aktif Üretim Emirleri */}
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Aktif Üretim Emirleri</h2>
              <Link href="/fabrika" className="text-xs text-[#C8102E] hover:underline">Tümü →</Link>
            </div>
            {(aktifEmir ?? []).length > 0 ? (
              <div className="divide-y">
                {(aktifEmir ?? []).map((e: any) => (
                  <div key={e.id} className="px-5 py-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{e.urun_adi}</div>
                      <div className="text-xs text-gray-400">{Number(e.miktar).toLocaleString('tr-TR')} adet</div>
                    </div>
                    <DurumBadge durum={e.durum} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-4 py-8 text-center text-sm text-gray-400">Aktif üretim emri yok.</div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Diğer roller için ortak veri çekimi ───────────────────────
  const fetchAll = await Promise.all([
    // 1: Toplam müşteri
    supabase.from('customers').select('*', { count: 'exact', head: true }).eq('is_active', true),
    // 2: Bu ay yeni müşteri
    supabase.from('customers').select('*', { count: 'exact', head: true }).eq('is_active', true).gte('created_at', monthStart),
    // 3: Bu ay servis
    supabase.from('service_forms').select('*', { count: 'exact', head: true }).gte('created_at', monthStart),
    // 4: Bekleyen (status != completed) servis
    supabase.from('service_forms').select('*', { count: 'exact', head: true }).neq('status', 'completed'),
    // 5: Yaklaşan SKT'li cihazlar (90 gün)
    supabase.from('devices')
      .select('expiry_date, customers(id, full_name)')
      .eq('is_active', true)
      .not('expiry_date', 'is', null)
      .lte('expiry_date', in90DaysStr)
      .order('expiry_date', { ascending: true }),
    // 6: Son 5 servis formu
    supabase.from('service_forms')
      .select('id, form_number, service_date, status, customers(full_name)')
      .order('created_at', { ascending: false })
      .limit(5),
    // 7: Bu ay servis item'ları (dağılım için)
    supabase.from('service_form_items')
      .select('device_name, service_form_id'),
  ])

  const [
    { count: customerCount },
    { count: newCustomerCount },
    { count: monthServiceCount },
    { count: bekleyenServisCount },
    { data: expiringDevices },
    { data: recentServices },
    { data: allItems },
  ] = fetchAll

  // Admin/İdari mali veriler
  let bekleyenAlacakTutar = 0, bekleyenAlacakSayi = 0
  let vadesiGecenBorcTutar = 0, vadesiGecenBorcTedarikci = 0
  let buAyGelir = 0, buAyGider = 0
  let bekleyenTeklifSayisi = 0

  if (isAdminOrIdari) {
    const [gelirRes, giderRes, alacakRes, borcRes, teklifRes] = await Promise.all([
      svcSupabase.from('invoices').select('total_amount')
        .eq('invoice_type', 'satis').gte('invoice_date', monthStartDate).neq('status', 'iptal'),
      svcSupabase.from('invoices').select('total_amount')
        .eq('invoice_type', 'alis').gte('invoice_date', monthStartDate).neq('status', 'iptal'),
      svcSupabase.from('invoices').select('total_amount, paid_amount')
        .eq('invoice_type', 'satis').neq('status', 'odendi').neq('status', 'iptal'),
      svcSupabase.from('invoices').select('total_amount, paid_amount, supplier_name')
        .eq('invoice_type', 'alis').lt('due_date', todayStr).neq('status', 'odendi').neq('status', 'iptal'),
      svcSupabase.from('teklifler').select('*', { count: 'exact', head: true }).in('durum', ['bekliyor', 'gonderildi']),
    ])

    buAyGelir = (gelirRes.data ?? []).reduce((s, i) => s + safe(i.total_amount), 0)
    buAyGider = (giderRes.data ?? []).reduce((s, i) => s + safe(i.total_amount), 0)
    bekleyenAlacakSayi = (alacakRes.data ?? []).length
    bekleyenAlacakTutar = (alacakRes.data ?? []).reduce((s, i) => s + Math.max(0, safe(i.total_amount) - safe(i.paid_amount)), 0)
    const borcData = borcRes.data ?? []
    vadesiGecenBorcTutar = borcData.reduce((s, i) => s + Math.max(0, safe(i.total_amount) - safe(i.paid_amount)), 0)
    vadesiGecenBorcTedarikci = new Set(borcData.map(i => i.supplier_name).filter(Boolean)).size
    bekleyenTeklifSayisi = teklifRes.count ?? 0
  }

  // Pazarlamacı verileri
  let sonTeklifler: any[] = []
  if (isPazarlamaci) {
    const [teklifRes, sonTeklifRes] = await Promise.all([
      supabase.from('teklifler').select('*', { count: 'exact', head: true }).eq('durum', 'bekliyor'),
      supabase.from('teklifler')
        .select('id, teklif_no, musteri_adi, genel_toplam, para_birimi, durum, tarih')
        .order('created_at', { ascending: false }).limit(5),
    ])
    bekleyenTeklifSayisi = teklifRes.count ?? 0
    sonTeklifler = sonTeklifRes.data ?? []
  }

  // Kritik stok (Admin/İdari/Saha için de göster)
  let kritikStoklar: any[] = []
  let stokYuklenemedi = false
  if (!isPazarlamaci) {
    const { data: hammaddeler, error: stokErr } = await svcSupabase
      .from('hammaddeler')
      .select('id, ad, birim, mevcut_stok, minimum_stok')
      .eq('aktif', true)
    if (stokErr) { stokYuklenemedi = true }
    else { kritikStoklar = (hammaddeler ?? []).filter((h: any) => Number(h.mevcut_stok) < Number(h.minimum_stok)).slice(0, 4) }
  }

  const hatirlatmalar = buildHatirlatmalar(expiringDevices ?? [], today)
  const dagilim = servisDagilim(allItems ?? [])
  const maxDagilim = Math.max(...dagilim.map(d => d.sayi), 1)

  return (
    <div className="p-6 space-y-6">

      {/* ── TOPBAR ──────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Genel Bakış</h1>
          <p className="text-sm text-gray-400 mt-0.5 capitalize">{dateLabel}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/service-forms/new"
            className="border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            + Servis Formu
          </Link>
          <Link href="/customers/new"
            className="bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26] transition-colors">
            + Yeni Müşteri
          </Link>
        </div>
      </div>

      {/* ── SATIR 1: KPI KARTLAR ─────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Toplam Müşteri — herkes */}
        <KpiKart
          href="/customers"
          baslik="Toplam Müşteri"
          deger={(customerCount ?? 0).toLocaleString('tr-TR')}
          alt={`${newCustomerCount ?? 0} yeni bu ay`}
        />

        {/* Bekleyen Alacak — sadece Admin/İdari */}
        {isAdminOrIdari && (
          <KpiKart
            href="/cari-hesap/giden-faturalar"
            baslik="Bekleyen Alacak"
            deger={formatCurrency(bekleyenAlacakTutar)}
            alt={`${bekleyenAlacakSayi} fatura ödenmedi`}
            color="yellow"
          />
        )}

        {/* Pazarlamacı: Bekleyen Teklif */}
        {isPazarlamaci && (
          <KpiKart
            href="/fiyat-teklifleri"
            baslik="Bekleyen Teklifler"
            deger={bekleyenTeklifSayisi}
            alt="onay bekliyor"
            color="yellow"
          />
        )}

        {/* Vadesi Geçen Borç — sadece Admin/İdari */}
        {isAdminOrIdari && (
          <KpiKart
            href="/cari-hesap/gelen-faturalar"
            baslik="Vadesi Geçen Borç"
            deger={formatCurrency(vadesiGecenBorcTutar)}
            alt={`${vadesiGecenBorcTedarikci} tedarikçi`}
            color={vadesiGecenBorcTutar > 0 ? 'red' : 'default'}
          />
        )}

        {/* Bu Ay Servis — Admin/İdari/Saha */}
        {!isPazarlamaci && (
          <KpiKart
            href="/service-forms"
            baslik="Bu Ay Servis"
            deger={(monthServiceCount ?? 0).toLocaleString('tr-TR')}
            alt={`${bekleyenServisCount ?? 0} bekliyor`}
            color="green"
          />
        )}

        {/* Pazarlamacı: Bu Ay Servis yerine Toplam Müşteri zaten var, 2. kart teklifler — ok */}
      </div>

      {/* ── SATIR 2: 3 KOLONLU GRID ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr_1.5fr] gap-6">

        {/* ── KOLON 1: HIZLI İŞLEMLER + MALİ ÖZET ─────────────────── */}
        <div className="space-y-4">
          {/* Hızlı İşlemler */}
          <div className="bg-white border rounded-xl p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Hızlı İşlemler</h2>
            <div className="grid grid-cols-2 gap-2">
              <Link href="/service-forms/new"
                className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-red-50 border border-transparent hover:border-red-100 transition-colors">
                <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                  <ClipboardList size={18} className="text-[#C8102E]" />
                </div>
                <span className="text-xs text-center text-gray-700 font-medium leading-tight">Servis Formu Oluştur</span>
              </Link>
              <Link href="/customers/new"
                className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-blue-50 border border-transparent hover:border-blue-100 transition-colors">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <Users size={18} className="text-blue-600" />
                </div>
                <span className="text-xs text-center text-gray-700 font-medium leading-tight">Yeni Müşteri</span>
              </Link>
              {isAdminOrIdari && (
                <Link href="/cari-hesap/giden-faturalar/new"
                  className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-green-50 border border-transparent hover:border-green-100 transition-colors">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <Wallet size={18} className="text-green-600" />
                  </div>
                  <span className="text-xs text-center text-gray-700 font-medium leading-tight">Fatura Ekle</span>
                </Link>
              )}
              <Link href="/fiyat-teklifleri/yeni"
                className="flex flex-col items-center gap-2 p-3 rounded-lg hover:bg-orange-50 border border-transparent hover:border-orange-100 transition-colors">
                <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                  <FileText size={18} className="text-orange-600" />
                </div>
                <span className="text-xs text-center text-gray-700 font-medium leading-tight">Teklif Oluştur</span>
              </Link>
            </div>
          </div>

          {/* Bu Ay Mali Özet — SADECE Admin/İdari */}
          {isAdminOrIdari && (
            <div className="bg-white border rounded-xl p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Bu Ay Mali Özet</h2>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <TrendingUp size={14} className="text-green-500" />
                    Toplam Gelir
                  </div>
                  <span className="text-sm font-semibold text-green-700">{formatCurrency(buAyGelir)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <TrendingDown size={14} className="text-red-500" />
                    Toplam Gider
                  </div>
                  <span className="text-sm font-semibold text-red-700">{formatCurrency(buAyGider)}</span>
                </div>
                <div className="border-t pt-2 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">Net Kar</span>
                  <span className={`text-sm font-bold ${buAyGelir - buAyGider >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {formatCurrency(buAyGelir - buAyGider)}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-gray-500">Bekleyen Teklifler</span>
                  <Link href="/fiyat-teklifleri" className="text-xs font-semibold text-orange-600 hover:underline">
                    {bekleyenTeklifSayisi} adet →
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── KOLON 2: HATIRLATMALAR / SON TEKLİFLER (Pazarlamacı) ── */}
        <div className="bg-white border rounded-xl overflow-hidden">
          {isPazarlamaci ? (
            <>
              <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Son Fiyat Teklifleri</h2>
                <Link href="/fiyat-teklifleri" className="text-xs text-[#C8102E] hover:underline font-medium">Tümü →</Link>
              </div>
              {sonTeklifler.length > 0 ? (
                <div className="divide-y">
                  {sonTeklifler.map(t => (
                    <Link key={t.id} href={`/fiyat-teklifleri/${t.id}`}
                      className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                      <div>
                        <div className="text-sm font-mono font-medium text-[#C8102E]">{t.teklif_no}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{t.musteri_adi || '—'}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500">{formatTRDate(t.tarih)}</div>
                        <DurumBadge durum={t.durum} />
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-8 text-center text-sm text-gray-400">Teklif bulunamadı.</div>
              )}
            </>
          ) : (
            <>
              <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Hatırlatmalar</h2>
                <Link href="/hatirlatmalar" className="text-xs text-[#C8102E] hover:underline font-medium">Tümü →</Link>
              </div>
              {hatirlatmalar.length > 0 ? (
                <div className="divide-y">
                  {hatirlatmalar.map(row => (
                    <Link key={row.id} href={`/customers/${row.id}`}
                      className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{row.full_name}</div>
                        <div className="text-xs text-gray-400">{row.count} cihaz</div>
                      </div>
                      <GunBadge days={row.minDays} />
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-8 text-center text-sm text-gray-400">90 gün içinde bakım gerektiren cihaz yok.</div>
              )}
            </>
          )}
        </div>

        {/* ── KOLON 3: SON SERVİS FORMLARI ─────────────────────────── */}
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Son Servis Formları</h2>
            <Link href="/service-forms" className="text-xs text-[#C8102E] hover:underline font-medium">Tümü →</Link>
          </div>
          {(recentServices ?? []).length > 0 ? (
            <div className="divide-y">
              {(recentServices ?? []).map(sf => {
                const customer = sf.customers as any
                return (
                  <Link key={sf.id} href={`/service-forms/${sf.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                    <div>
                      <div className="text-sm font-mono font-medium text-[#C8102E]">
                        {sf.form_number ?? `#${sf.id.slice(0, 6)}`}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">{customer?.full_name ?? '—'}</div>
                    </div>
                    <div className="text-right space-y-1">
                      <div className="text-xs text-gray-400">{formatTRDate(sf.service_date)}</div>
                      <DurumBadge durum={sf.status ?? 'completed'} />
                    </div>
                  </Link>
                )
              })}
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-gray-400">Henüz servis formu yok.</div>
          )}
          <div className="px-4 py-3 border-t bg-gray-50">
            <Link href="/service-forms/new"
              className="block text-center text-xs text-[#C8102E] font-medium hover:underline">
              + Yeni Servis Formu →
            </Link>
          </div>
        </div>
      </div>

      {/* ── SATIR 3: SERVİS DAĞILIMI + STOK ─────────────────────── */}
      {!isPazarlamaci && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Aylık Servis Dağılımı */}
          <div className="bg-white border rounded-xl p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Aylık Servis Dağılımı</h2>
            <div className="space-y-3">
              {dagilim.map(cat => (
                <div key={cat.label} className="flex items-center gap-3">
                  <div className="w-32 text-xs text-gray-600 truncate flex-shrink-0">{cat.label}</div>
                  <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                    <div
                      className="h-5 bg-[#C8102E] rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                      style={{ width: `${Math.max(cat.sayi > 0 ? (cat.sayi / maxDagilim) * 100 : 0, cat.sayi > 0 ? 8 : 0)}%` }}
                    />
                  </div>
                  <div className="w-7 text-xs font-bold text-gray-700 text-right flex-shrink-0">{cat.sayi}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Kritik Stok Uyarıları */}
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b bg-gray-50 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Kritik Stok Uyarıları</h2>
              <Link href="/fabrika" className="text-xs text-[#C8102E] hover:underline font-medium">Fabrika →</Link>
            </div>
            {stokYuklenemedi ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                <Package size={24} className="mx-auto mb-2 text-gray-300" />
                Fabrika modülü henüz yapılandırılmadı.
              </div>
            ) : kritikStoklar.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                <Package size={24} className="mx-auto mb-2 text-gray-300" />
                Kritik stok uyarısı bulunmuyor.
              </div>
            ) : (
              <div className="divide-y">
                {kritikStoklar.map((h: any) => {
                  const pct = Number(h.minimum_stok) > 0
                    ? Math.round(Number(h.mevcut_stok) / Number(h.minimum_stok) * 100) : 100
                  const badge = pct === 0
                    ? 'bg-red-100 text-red-700'
                    : pct < 50 ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-green-100 text-green-700'
                  const label = pct === 0 ? 'Kritik' : pct < 50 ? 'Uyarı' : 'Yeterli'
                  return (
                    <div key={h.id} className="px-5 py-3 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{h.ad}</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {Number(h.mevcut_stok).toLocaleString('tr-TR')} / min {Number(h.minimum_stok).toLocaleString('tr-TR')} {h.birim}
                        </div>
                      </div>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${badge}`}>{label}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
