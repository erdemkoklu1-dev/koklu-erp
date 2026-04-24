import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { formatTRDate } from '@/lib/finance/formatters'
import { ProformaSilButton } from './ProformaSilButton'

const DURUM_CONFIG: Record<string, { label: string; className: string }> = {
  taslak:      { label: 'Taslak',      className: 'bg-gray-100 text-gray-600 border-gray-200' },
  gonderildi:  { label: 'Gönderildi',  className: 'bg-blue-50 text-blue-700 border-blue-200' },
  onaylandi:   { label: 'Onaylandı',   className: 'bg-green-50 text-green-700 border-green-200' },
  iptal:       { label: 'İptal',       className: 'bg-gray-100 text-gray-500 border-gray-200' },
  faturalandi: { label: 'Faturalandı', className: 'bg-purple-50 text-purple-700 border-purple-200' },
}

function fmtTutar(n: number, para: string) {
  const s = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2 }).format(n)
  if (para === 'USD') return `$ ${s}`
  if (para === 'EUR') return `€ ${s}`
  return `${s} ₺`
}

export default async function ProformaListesiPage({
  searchParams,
}: {
  searchParams: Promise<{ durum?: string; from?: string; to?: string; q?: string; para_birimi?: string }>
}) {
  const { durum, from, to, q, para_birimi } = await searchParams
  const supabase = createServiceClient()

  let query = supabase
    .from('proforma_faturalar')
    .select('id, proforma_no, tarih, musteri_unvan, ara_toplam, kdv_tutari, toplam_tutar, para_birimi, durum')
    .order('created_at', { ascending: false })

  if (durum && durum !== 'tumu')           query = query.eq('durum', durum)
  if (from)                                query = query.gte('tarih', from)
  if (to)                                  query = query.lte('tarih', to)
  if (q)                                   query = query.ilike('musteri_unvan', `%${q}%`)
  if (para_birimi && para_birimi !== 'tumu') query = query.eq('para_birimi', para_birimi)

  const { data: proformalar } = await query

  function buildUrl(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams()
    const base = { durum, from, to, q, para_birimi, ...overrides }
    for (const [k, v] of Object.entries(base)) { if (v) params.set(k, v) }
    return `/fiyat-teklifleri/proforma?${params.toString()}`
  }

  const durumFilter = durum ?? 'tumu'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#C8102E] rounded-lg flex items-center justify-center text-white font-bold text-sm">P</div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">Proforma Faturalar</h1>
            <Link href="/fiyat-teklifleri" className="text-xs text-gray-400 hover:text-gray-600">← Fiyat Teklifleri</Link>
          </div>
        </div>
        <Link href="/fiyat-teklifleri/proforma/yeni"
          className="bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26] transition-colors">
          + Yeni Proforma
        </Link>
      </div>

      <div className="p-6 max-w-6xl mx-auto space-y-5">

        {/* Filtreler */}
        <div className="bg-white border rounded-lg p-4 flex flex-wrap items-center gap-3">
          <div className="flex gap-1 flex-wrap">
            {[
              { value: 'tumu',       label: 'Tümü' },
              { value: 'taslak',     label: 'Taslak' },
              { value: 'gonderildi', label: 'Gönderildi' },
              { value: 'onaylandi',  label: 'Onaylandı' },
              { value: 'faturalandi',label: 'Faturalandı' },
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

          <form method="GET" action="/fiyat-teklifleri/proforma" className="flex flex-wrap items-center gap-2">
            {durum && <input type="hidden" name="durum" value={durum} />}
            <input type="date" name="from" defaultValue={from}
              className="border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />
            <span className="text-xs text-gray-400">–</span>
            <input type="date" name="to" defaultValue={to}
              className="border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />
            <input type="text" name="q" defaultValue={q} placeholder="Müşteri ara..."
              className="border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#C8102E] w-36" />
            <select name="para_birimi" defaultValue={para_birimi ?? ''}
              className="border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#C8102E]">
              <option value="">Tüm Paralar</option>
              <option value="TRY">TRY</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
            <button type="submit"
              className="bg-gray-800 text-white px-3 py-1.5 rounded-lg text-xs hover:bg-gray-700">
              Filtrele
            </button>
            {(from || to || q || para_birimi) && (
              <Link href="/fiyat-teklifleri/proforma" className="text-xs text-gray-400 hover:text-gray-600 underline">
                Temizle
              </Link>
            )}
          </form>
        </div>

        {/* Tablo */}
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">PROFORMA NO</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">TARİH</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">MÜŞTERİ</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">ARA TOPLAM</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">KDV</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500">TOPLAM</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">DURUM</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500">İŞLEM</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {proformalar && proformalar.length > 0 ? proformalar.map((p) => {
                const conf = DURUM_CONFIG[p.durum] ?? DURUM_CONFIG.taslak
                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono font-medium text-[#C8102E]">{p.proforma_no}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{formatTRDate(p.tarih)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.musteri_unvan || '-'}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">{fmtTutar(p.ara_toplam ?? 0, p.para_birimi)}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-600">{fmtTutar(p.kdv_tutari ?? 0, p.para_birimi)}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">{fmtTutar(p.toplam_tutar ?? 0, p.para_birimi)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${conf.className}`}>
                        {conf.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Link href={`/fiyat-teklifleri/proforma/${p.id}`}
                          className="text-blue-600 text-sm font-medium hover:underline">
                          Düzenle
                        </Link>
                        <Link href={`/fiyat-teklifleri/proforma/${p.id}/pdf`} target="_blank"
                          className="text-gray-600 text-sm font-medium hover:underline">
                          PDF
                        </Link>
                        <ProformaSilButton id={p.id} proformaNo={p.proforma_no} />
                      </div>
                    </td>
                  </tr>
                )
              }) : (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400 text-sm">
                    Henüz proforma fatura oluşturulmamış.{' '}
                    <Link href="/fiyat-teklifleri/proforma/yeni" className="text-[#C8102E] hover:underline">
                      İlk proformayı oluştur →
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
