import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { formatTRDate } from '@/lib/finance/formatters'
import { TURKEY_PROVINCES } from '@/lib/turkey-provinces'
import { TeklifSilButton } from './TeklifSilButton'
import PrintButton from '@/components/PrintButton'

const DURUM_CONFIG: Record<string, { label: string; className: string }> = {
  taslak:     { label: 'Taslak',     className: 'bg-gray-100 text-gray-600 border-gray-200' },
  gonderildi: { label: 'Gönderildi', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  bekliyor:   { label: 'Bekliyor',   className: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  kazanildi:  { label: 'Kazanıldı',  className: 'bg-green-50 text-green-700 border-green-200' },
  kaybedildi: { label: 'Kaybedildi', className: 'bg-red-50 text-red-700 border-red-200' },
  iptal:      { label: 'İptal',      className: 'bg-gray-100 text-gray-500 border-gray-200' },
}

function formatAmount(amount: number, currency: string) {
  if (currency === 'TL') {
    return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(amount) + ' ₺'
  }
  if (currency === 'USD') {
    return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(amount) + ' $'
  }
  if (currency === 'EUR') {
    return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(amount) + ' €'
  }
  return String(amount)
}

export default async function FiyatTeklifleriPage({
  searchParams,
}: {
  searchParams: Promise<{ durum?: string; from?: string; to?: string; q?: string; sehir?: string }>
}) {
  const { durum, from, to, q, sehir } = await searchParams
  const supabase = createServiceClient()

  let query = supabase
    .from('teklifler')
    .select('id, teklif_no, tarih, musteri_adi, musteri_sehir, genel_toplam, para_birimi, kdv_durumu, durum, customers(full_name)')
    .order('created_at', { ascending: false })

  if (durum && durum !== 'tumu') query = query.eq('durum', durum)
  if (from) query = query.gte('tarih', from)
  if (to)   query = query.lte('tarih', to)
  if (q)    query = query.ilike('musteri_adi', `%${q}%`)
  if (sehir) query = query.eq('musteri_sehir', sehir)

  const { data: teklifler } = await query

  // Özet istatistikler
  const { data: ozet } = await supabase
    .from('teklifler')
    .select('durum, genel_toplam')

  const toplam    = (ozet ?? []).length
  const kazanilan = (ozet ?? []).filter(t => t.durum === 'kazanildi').length
  const kaybedilen = (ozet ?? []).filter(t => t.durum === 'kaybedildi').length
  const bekleyen  = (ozet ?? []).filter(t => ['bekliyor', 'gonderildi', 'taslak'].includes(t.durum)).length

  function buildUrl(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams()
    const base = { durum, from, to, q, sehir, ...overrides }
    for (const [k, v] of Object.entries(base)) {
      if (v) params.set(k, v)
    }
    return `/fiyat-teklifleri?${params.toString()}`
  }

  const durumFilter = durum ?? 'tumu'

  const printDate = new Date().toLocaleString('tr-TR')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Print header */}
      <div className="print-header hidden">
        <div>KÖKLÜ YANGIN SÖNDÜRME CİHAZLARI</div>
        <div style={{ fontWeight: 'normal', fontSize: '12px', marginTop: '4px' }}>Fiyat Teklifleri Listesi · {printDate}</div>
        {durum && durum !== 'tumu' && <div style={{ fontWeight: 'normal', fontSize: '11px', marginTop: '2px' }}>Filtreler: Durum: {durum}</div>}
      </div>

      {/* Header */}
      <div className="no-print bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#C8102E] rounded-lg flex items-center justify-center text-white font-bold text-sm">K</div>
          <h1 className="text-lg font-bold text-gray-900">Fiyat Teklifleri</h1>
        </div>
        <div className="flex gap-2">
          <PrintButton />
          <Link href="/fiyat-teklifleri/fiyat-listesi" target="_blank"
            className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
            📄 Fiyat Listesi
          </Link>
          <Link href="/fiyat-teklifleri/yeni"
            className="bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26] transition-colors">
            + Yeni Teklif
          </Link>
        </div>
      </div>

      <div className="p-6 max-w-6xl mx-auto space-y-5">

        {/* Özet kartlar */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white border rounded-lg p-4">
            <div className="text-xs text-gray-500">Toplam Teklif</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{toplam}</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="text-xs text-green-600">Kazanılan</div>
            <div className="text-2xl font-bold text-green-700 mt-1">{kazanilan}</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="text-xs text-red-600">Kaybedilen</div>
            <div className="text-2xl font-bold text-red-700 mt-1">{kaybedilen}</div>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="text-xs text-yellow-700">Bekleyen</div>
            <div className="text-2xl font-bold text-yellow-700 mt-1">{bekleyen}</div>
          </div>
        </div>

        {/* Filtreler */}
        <div className="bg-white border rounded-lg p-4 flex flex-wrap items-center gap-3">
          {/* Durum filtresi */}
          <div className="flex gap-1 flex-wrap">
            {[
              { value: 'tumu',       label: 'Tümü' },
              { value: 'bekliyor',   label: 'Bekliyor' },
              { value: 'gonderildi', label: 'Gönderildi' },
              { value: 'kazanildi',  label: 'Kazanıldı' },
              { value: 'kaybedildi', label: 'Kaybedildi' },
              { value: 'iptal',      label: 'İptal' },
            ].map(opt => (
              <Link key={opt.value}
                href={buildUrl({ durum: opt.value === 'tumu' ? undefined : opt.value })}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  durumFilter === opt.value
                    ? 'bg-[#C8102E] text-white border-[#C8102E]'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                }`}>
                {opt.label}
              </Link>
            ))}
          </div>

          <div className="h-4 border-l border-gray-200 hidden sm:block" />

          {/* Tarih / Müşteri / Şehir form */}
          <form method="GET" action="/fiyat-teklifleri" className="flex flex-wrap items-center gap-2">
            {durum && <input type="hidden" name="durum" value={durum} />}

            <input type="date" name="from" defaultValue={from}
              className="border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />
            <span className="text-xs text-gray-400">–</span>
            <input type="date" name="to" defaultValue={to}
              className="border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />

            <input type="text" name="q" defaultValue={q} placeholder="Müşteri ara..."
              className="border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#C8102E] w-36" />

            {/* Şehir filtresi */}
            <select name="sehir" defaultValue={sehir ?? ''}
              className="border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#C8102E]">
              <option value="">Tümü</option>
              <option disabled>─────────</option>
              <option value="Erzincan">Erzincan</option>
              <option value="İstanbul">İstanbul</option>
              <option disabled>─────────</option>
              {TURKEY_PROVINCES.map(il => (
                <option key={il} value={il}>{il}</option>
              ))}
            </select>

            <button type="submit"
              className="bg-gray-800 text-white px-3 py-1.5 rounded-lg text-xs hover:bg-gray-700">
              Filtrele
            </button>
            {(from || to || q || sehir) && (
              <Link href="/fiyat-teklifleri" className="text-xs text-gray-400 hover:text-gray-600 underline">
                Temizle
              </Link>
            )}
          </form>
        </div>

        {/* Teklif listesi */}
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">TEKLİF NO</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">MÜŞTERİ</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">ŞEHİR</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">TARİH</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">TUTAR</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">PARA</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">KDV</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">DURUM</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">İŞLEM</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {teklifler && teklifler.length > 0 ? teklifler.map((t) => {
                const conf = DURUM_CONFIG[t.durum] ?? DURUM_CONFIG.taslak
                const musteriAdi = (t.customers as any)?.full_name ?? t.musteri_adi
                const kdvLabel = t.kdv_durumu === 'dahil' ? 'KDV Dahil' : t.kdv_durumu === 'haric' ? 'KDV Hariç' : 'KDV Yok'
                return (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono font-medium text-[#C8102E]">{t.teklif_no}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{musteriAdi || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{t.musteri_sehir || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatTRDate(t.tarih)}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                      {formatAmount(t.genel_toplam ?? 0, t.para_birimi)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{t.para_birimi}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{kdvLabel}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${conf.className}`}>
                        {conf.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Link href={`/fiyat-teklifleri/${t.id}`}
                          className="text-[#C8102E] text-sm font-medium hover:underline">
                          Detay →
                        </Link>
                        <Link href={`/fiyat-teklifleri/${t.id}/duzenle`}
                          className="text-blue-600 text-sm font-medium hover:underline">
                          Düzenle
                        </Link>
                        <Link href={`/fiyat-teklifleri/proforma/yeni?teklif_id=${t.id}`}
                          className="text-purple-600 text-sm font-medium hover:underline">
                          Proforma
                        </Link>
                        <TeklifSilButton id={t.id} teklifNo={t.teklif_no} />
                      </div>
                    </td>
                  </tr>
                )
              }) : (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-400 text-sm">
                    Henüz teklif oluşturulmamış.{' '}
                    <Link href="/fiyat-teklifleri/yeni" className="text-[#C8102E] hover:underline">
                      İlk teklifi oluştur →
                    </Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
