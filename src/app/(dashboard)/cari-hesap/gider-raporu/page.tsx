import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { formatCurrency, formatTRDate } from '@/lib/finance/formatters'

export default async function GiderRaporuPage({
  searchParams,
}: {
  searchParams: Promise<{ ay?: string; yil?: string }>
}) {
  const params = await searchParams
  const supabase = createServiceClient()
  const today = new Date().toISOString().split('T')[0]

  const now = new Date()
  const selectedYil = parseInt(params.yil ?? String(now.getFullYear()))
  const selectedAy  = params.ay ? parseInt(params.ay) : null  // null = tüm yıl

  // Tarih aralığı
  const baslangic = selectedAy
    ? `${selectedYil}-${String(selectedAy).padStart(2, '0')}-01`
    : `${selectedYil}-01-01`
  const bitis = selectedAy
    ? new Date(selectedYil, selectedAy, 0).toISOString().split('T')[0]
    : `${selectedYil}-12-31`

  // Tüm alis faturaları + kalemleri
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, invoice_number, supplier_name, invoice_date, due_date, total_amount, paid_amount, status, notes')
    .eq('invoice_type', 'alis')
    .neq('status', 'iptal')
    .gte('invoice_date', baslangic)
    .lte('invoice_date', bitis)
    .order('invoice_date', { ascending: false })

  const rows = invoices ?? []

  // Kategori parsing (notes alanından "Kategori: X" çıkar)
  function parseKategori(notes: string | null): string {
    if (!notes) return 'Genel Gider'
    const m = notes.match(/Kategori:\s*([^|]+)/)
    return m ? m[1].trim() : 'Genel Gider'
  }

  // KPI
  const toplamTutar    = rows.reduce((s, i) => s + (i.total_amount ?? 0), 0)
  const toplamOdenen   = rows.reduce((s, i) => s + (i.paid_amount ?? 0), 0)
  const toplamKalan    = Math.max(0, toplamTutar - toplamOdenen)
  const gecikmisSayi   = rows.filter(i =>
    i.due_date && i.due_date < today && (i.total_amount ?? 0) - (i.paid_amount ?? 0) > 0
  ).length

  // Kategoriye göre gider dağılımı
  const kategoriMap: Record<string, { tutar: number; sayi: number }> = {}
  for (const inv of rows) {
    const kat = parseKategori(inv.notes)
    if (!kategoriMap[kat]) kategoriMap[kat] = { tutar: 0, sayi: 0 }
    kategoriMap[kat].tutar += inv.total_amount ?? 0
    kategoriMap[kat].sayi += 1
  }
  const kategoriList = Object.entries(kategoriMap)
    .sort((a, b) => b[1].tutar - a[1].tutar)

  // Tedarikçiye göre gider dağılımı
  const tedarikciMap: Record<string, { tutar: number; kalan: number; sayi: number }> = {}
  for (const inv of rows) {
    const ad = inv.supplier_name ?? 'Bilinmiyor'
    if (!tedarikciMap[ad]) tedarikciMap[ad] = { tutar: 0, kalan: 0, sayi: 0 }
    tedarikciMap[ad].tutar += inv.total_amount ?? 0
    tedarikciMap[ad].kalan += Math.max(0, (inv.total_amount ?? 0) - (inv.paid_amount ?? 0))
    tedarikciMap[ad].sayi += 1
  }
  const tedarikciList = Object.entries(tedarikciMap)
    .sort((a, b) => b[1].tutar - a[1].tutar)
    .slice(0, 10)

  // Aylık gider (tüm yıl için)
  const { data: aylikData } = selectedAy ? { data: null } : await supabase
    .from('invoices')
    .select('invoice_date, total_amount')
    .eq('invoice_type', 'alis')
    .neq('status', 'iptal')
    .gte('invoice_date', `${selectedYil}-01-01`)
    .lte('invoice_date', `${selectedYil}-12-31`)

  const aylikMap: Record<string, number> = {}
  for (const inv of aylikData ?? []) {
    if (!inv.invoice_date) continue
    const ay = inv.invoice_date.slice(0, 7)  // YYYY-MM
    aylikMap[ay] = (aylikMap[ay] ?? 0) + (inv.total_amount ?? 0)
  }
  const aylikList = Object.entries(aylikMap).sort((a, b) => a[0].localeCompare(b[0]))
  const maxAylik = Math.max(...aylikList.map(([, v]) => v), 1)

  const TR_AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
  const yillar = [now.getFullYear() - 1, now.getFullYear()]
  const aylar = Array.from({ length: 12 }, (_, i) => i + 1)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Gider Raporu</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <Link href="/cari-hesap/gelen-faturalar"
            className="text-xs text-[#C8102E] hover:underline font-medium">
            ← Gelen Faturalar
          </Link>
          <form method="GET" className="flex items-center gap-2">
            <select
              name="yil"
              defaultValue={selectedYil}
              className="border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
            >
              {yillar.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select
              name="ay"
              defaultValue={selectedAy ?? ''}
              className="border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
            >
              <option value="">Tüm Yıl</option>
              {aylar.map(a => (
                <option key={a} value={a}>{TR_AYLAR[a - 1]}</option>
              ))}
            </select>
            <button type="submit"
              className="bg-[#C8102E] text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-[#a50d26]">
              Uygula
            </button>
          </form>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 border rounded-xl p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Toplam Gider</div>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(toplamTutar)}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{rows.length} fatura</div>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="text-xs text-green-600 mb-0.5">Ödenen</div>
          <div className="text-xl font-bold text-green-700">{formatCurrency(toplamOdenen)}</div>
        </div>
        <div className={`rounded-xl p-4 border ${toplamKalan > 0 ? 'bg-orange-50 border-orange-200' : 'bg-white dark:bg-gray-800'}`}>
          <div className={`text-xs mb-0.5 ${toplamKalan > 0 ? 'text-orange-600' : 'text-gray-500 dark:text-gray-400'}`}>Kalan Borç</div>
          <div className={`text-xl font-bold ${toplamKalan > 0 ? 'text-orange-700' : 'text-gray-900 dark:text-gray-100'}`}>
            {formatCurrency(toplamKalan)}
          </div>
        </div>
        <div className={`rounded-xl p-4 border ${gecikmisSayi > 0 ? 'bg-red-50 border-red-200' : 'bg-white dark:bg-gray-800'}`}>
          <div className={`text-xs mb-0.5 ${gecikmisSayi > 0 ? 'text-red-600' : 'text-gray-500 dark:text-gray-400'}`}>Gecikmiş</div>
          <div className={`text-xl font-bold ${gecikmisSayi > 0 ? 'text-red-700' : 'text-gray-900 dark:text-gray-100'}`}>
            {gecikmisSayi}
          </div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">vadesi geçmiş</div>
        </div>
      </div>

      {/* Aylık Grafik (tüm yıl seçiliyse) */}
      {!selectedAy && aylikList.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-4">{selectedYil} — Aylık Gider</h3>
          <div className="flex items-end gap-2 h-36">
            {Array.from({ length: 12 }, (_, i) => {
              const key = `${selectedYil}-${String(i + 1).padStart(2, '0')}`
              const val = aylikMap[key] ?? 0
              const h = val > 0 ? Math.max(4, Math.round((val / maxAylik) * 120)) : 0
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                    {val > 0 ? formatCurrency(val).replace('₺', '') : ''}
                  </div>
                  <div
                    className="w-full rounded-t bg-[#C8102E] transition-all"
                    style={{ height: `${h}px`, minHeight: val > 0 ? '4px' : '0' }}
                  />
                  <div className="text-xs text-gray-400 dark:text-gray-500">{TR_AYLAR[i]}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Kategoriye göre gider */}
        <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50 dark:bg-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Kategoriye Göre Gider</h3>
          </div>
          {kategoriList.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">Veri yok</div>
          ) : (
            <div className="divide-y">
              {kategoriList.map(([kat, data]) => {
                const pct = toplamTutar > 0 ? (data.tutar / toplamTutar) * 100 : 0
                return (
                  <div key={kat} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-700 dark:text-gray-300">{kat}</span>
                      <div className="text-right">
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(data.tutar)}</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">{data.sayi} fatura</span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#C8102E] rounded-full"
                        style={{ width: `${pct.toFixed(1)}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">%{pct.toFixed(1)}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Tedarikçiye göre gider */}
        <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50 dark:bg-gray-700 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Tedarikçiye Göre Gider (Top 10)</h3>
          </div>
          {tedarikciList.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">Veri yok</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700 border-b">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Tedarikçi</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Toplam</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Kalan Borç</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Fatura</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {tedarikciList.map(([ad, data]) => (
                    <tr key={ad} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/cari-hesap/tedarikciler/${encodeURIComponent(ad)}`}
                          className="text-gray-900 dark:text-gray-100 hover:text-[#C8102E] hover:underline font-medium"
                        >
                          {ad}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-right font-medium text-gray-800 dark:text-gray-200">
                        {formatCurrency(data.tutar)}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-semibold ${data.kalan > 0 ? 'text-orange-600' : 'text-gray-400 dark:text-gray-500'}`}>
                        {data.kalan > 0 ? formatCurrency(data.kalan) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-500 dark:text-gray-400">{data.sayi}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Ödenmemiş / Gecikmiş borçlar */}
      {(() => {
        const odenmemis = rows.filter(i =>
          (i.total_amount ?? 0) - (i.paid_amount ?? 0) > 0
        ).sort((a, b) => {
          // Gecikmiş önce
          const aGec = a.due_date && a.due_date < today ? -1 : 0
          const bGec = b.due_date && b.due_date < today ? -1 : 0
          if (aGec !== bGec) return aGec - bGec
          return (a.due_date ?? '').localeCompare(b.due_date ?? '')
        })
        if (odenmemis.length === 0) return null
        return (
          <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b bg-gray-50 dark:bg-gray-700 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Ödenmemiş Borçlar
                <span className="ml-2 bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full">
                  {odenmemis.length}
                </span>
              </h3>
              <Link href="/cari-hesap/gelen-faturalar?odeme_durumu=odenmemis"
                className="text-xs text-[#C8102E] hover:underline font-medium">
                Tümünü Gör →
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700 border-b">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Tedarikçi</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Fatura No</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Kategori</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Vade</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400">Kalan</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y max-h-64">
                  {odenmemis.slice(0, 20).map(inv => {
                    const kalan = Math.max(0, (inv.total_amount ?? 0) - (inv.paid_amount ?? 0))
                    const isOverdue = !!(inv.due_date && inv.due_date < today)
                    const kat = parseKategori(inv.notes)
                    return (
                      <tr key={inv.id} className={isOverdue ? 'bg-red-50/50' : 'hover:bg-gray-50'}>
                        <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-gray-100">{inv.supplier_name ?? '—'}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-500 dark:text-gray-400">{inv.invoice_number}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">{kat}</td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          {inv.due_date ? (
                            <span className={isOverdue ? 'text-red-600 font-medium' : 'text-gray-600 dark:text-gray-300'}>
                              {formatTRDate(inv.due_date)}
                              {isOverdue && <span className="ml-1 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">Gecikmiş</span>}
                            </span>
                          ) : '—'}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-semibold ${isOverdue ? 'text-red-600' : 'text-orange-600'}`}>
                          {formatCurrency(kalan)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Link href={`/cari-hesap/faturalar/${inv.id}`}
                            className="text-xs text-[#C8102E] hover:underline font-medium">
                            Detay →
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
