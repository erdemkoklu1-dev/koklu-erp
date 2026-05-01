import type { ReactNode } from 'react'
import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { formatCurrency, formatTRDate, INVOICE_STATUS_CONFIG } from '@/lib/finance/formatters'
import FaturaFiltrePaneli from '../_components/FaturaFiltrePaneli'
import PrintButton from '@/components/PrintButton'

const TYPE_LABELS: Record<string, string> = {
  satis: 'Satış', alis: 'Alış', iade_satis: 'İade (Satış)', iade_alis: 'İade (Alış)',
}

function computeDateRange(period?: string, from?: string, to?: string) {
  const today = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  if (period === 'bu_ay') return {
    from: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-01`,
    to: today.toISOString().split('T')[0],
  }
  if (period === 'gecen_ay') {
    const lastDay = new Date(today.getFullYear(), today.getMonth(), 0)
    const firstDay = new Date(lastDay.getFullYear(), lastDay.getMonth(), 1)
    return { from: firstDay.toISOString().split('T')[0], to: lastDay.toISOString().split('T')[0] }
  }
  if (period === 'son_3_ay') {
    const start = new Date(today); start.setMonth(today.getMonth() - 3)
    return { from: start.toISOString().split('T')[0], to: today.toISOString().split('T')[0] }
  }
  if (period === 'bu_yil') return {
    from: `${today.getFullYear()}-01-01`,
    to: today.toISOString().split('T')[0],
  }
  return { from: from ?? null, to: to ?? null }
}

export default async function FaturalarPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; q?: string; period?: string; from?: string; to?: string; sort?: string }>
}) {
  const { status, type, q, period, from: fromParam, to: toParam, sort } = await searchParams
  const supabase = createServiceClient()

  const isMahsupFilter = status === 'vergi_mahsup'
  const { from: dateFrom, to: dateTo } = computeDateRange(period, fromParam, toParam)

  // Ana sorgu
  let query = supabase
    .from('invoices')
    .select('id, invoice_number, invoice_type, invoice_date, due_date, total_amount, paid_amount, status, mahsup_durumu, description, customers(full_name), supplier_name')

  if (isMahsupFilter) {
    query = query.eq('mahsup_durumu', 'vergi_mahsup')
  } else {
    if (status && status !== 'all') query = query.eq('status', status)
  }
  if (type && type !== 'all') query = query.eq('invoice_type', type)
  if (dateFrom) query = query.gte('invoice_date', dateFrom)
  if (dateTo)   query = query.lte('invoice_date', dateTo)

  // DB-level sort
  const dbSortCol = sort === 'date_asc' ? 'invoice_date'
    : sort === 'amount_desc' || sort === 'amount_asc' ? 'total_amount'
    : 'invoice_date'
  const dbAsc = sort === 'date_asc' || sort === 'amount_asc'
  query = query.order(dbSortCol, { ascending: dbAsc })

  const { data: rawInvoices } = await query

  // Counts (no date filter, to keep status chips accurate)
  const { data: allInvoices } = await supabase
    .from('invoices')
    .select('status, mahsup_durumu')

  const counts: Record<string, number> = { all: allInvoices?.length ?? 0 }
  for (const inv of allInvoices ?? []) {
    counts[inv.status] = (counts[inv.status] ?? 0) + 1
    if (inv.mahsup_durumu === 'vergi_mahsup') {
      counts['vergi_mahsup'] = (counts['vergi_mahsup'] ?? 0) + 1
    }
  }

  // Client-side sort (computed fields) + search filter
  let invoices = rawInvoices ?? []
  if (sort === 'customer_asc') {
    invoices = [...invoices].sort((a, b) => {
      const na = (a.customers as any)?.full_name ?? a.supplier_name ?? ''
      const nb = (b.customers as any)?.full_name ?? b.supplier_name ?? ''
      return na.localeCompare(nb, 'tr')
    })
  } else if (sort === 'customer_desc') {
    invoices = [...invoices].sort((a, b) => {
      const na = (a.customers as any)?.full_name ?? a.supplier_name ?? ''
      const nb = (b.customers as any)?.full_name ?? b.supplier_name ?? ''
      return nb.localeCompare(na, 'tr')
    })
  } else if (sort === 'kalan_desc') {
    invoices = [...invoices].sort((a, b) =>
      ((b.total_amount ?? 0) - (b.paid_amount ?? 0)) - ((a.total_amount ?? 0) - (a.paid_amount ?? 0))
    )
  }

  const filtered = invoices.filter(inv => {
    if (!q) return true
    const s = q.toLowerCase()
    const c = inv.customers as any
    return (
      inv.invoice_number.toLowerCase().includes(s) ||
      (c?.full_name ?? '').toLowerCase().includes(s) ||
      (inv.supplier_name ?? '').toLowerCase().includes(s)
    )
  })

  const toplamFatura = filtered.reduce((s, i) => s + (i.total_amount ?? 0), 0)
  const toplamOdenen = filtered.reduce((s, i) => s + (i.paid_amount ?? 0), 0)
  const toplamKalan = toplamFatura - toplamOdenen
  const mahsupToplam = isMahsupFilter ? toplamFatura : 0

  const mahsupKurum: Record<string, number> = {}
  const mahsupDonem: Record<string, number> = {}
  if (isMahsupFilter) {
    for (const inv of filtered) {
      const c = inv.customers as any
      const ad = c?.full_name ?? inv.supplier_name ?? 'Bilinmiyor'
      mahsupKurum[ad] = (mahsupKurum[ad] ?? 0) + (inv.total_amount ?? 0)
      if (inv.invoice_date) {
        const d = new Date(inv.invoice_date)
        const key = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`
        mahsupDonem[key] = (mahsupDonem[key] ?? 0) + (inv.total_amount ?? 0)
      }
    }
  }

  const today = new Date().toISOString().split('T')[0]
  const hasActiveFilters = !!(status && status !== 'all') || !!(type && type !== 'all') || !!q || !!period || !!dateFrom || !!dateTo || !!(sort && sort !== 'date_desc')

  const statusFilters = [
    { key: 'all', label: 'Tümü' },
    { key: 'kesildi', label: 'Kesildi' },
    { key: 'gonderildi', label: 'Gönderildi' },
    { key: 'kismi_odendi', label: 'Kısmi Ödendi' },
    { key: 'odendi', label: 'Ödendi' },
    { key: 'taslak', label: 'Taslak' },
    { key: 'iptal', label: 'İptal' },
    { key: 'vergi_mahsup', label: 'Vergi Mahsupları' },
  ]

  // Preserve date/sort params in status/type links
  function buildStatusUrl(key: string) {
    const p = new URLSearchParams()
    p.set('status', key)
    if (type && type !== 'all') p.set('type', type)
    if (q) p.set('q', q)
    if (period) p.set('period', period)
    if (period === 'ozel' && fromParam) p.set('from', fromParam)
    if (period === 'ozel' && toParam)   p.set('to', toParam)
    if (sort && sort !== 'date_desc')   p.set('sort', sort)
    return `/cari-hesap/faturalar?${p.toString()}`
  }

  function buildTypeUrl(t: string) {
    const p = new URLSearchParams()
    if (status) p.set('status', status)
    if (t) p.set('type', t)
    if (q) p.set('q', q)
    if (period) p.set('period', period)
    if (period === 'ozel' && fromParam) p.set('from', fromParam)
    if (period === 'ozel' && toParam)   p.set('to', toParam)
    if (sort && sort !== 'date_desc')   p.set('sort', sort)
    return `/cari-hesap/faturalar?${p.toString()}`
  }

  const printDate = new Date().toLocaleString('tr-TR')
  const activeFilterText = [
    status && status !== 'all' ? `Durum: ${status}` : null,
    type && type !== 'all' ? `Tip: ${type}` : null,
    q ? `Arama: ${q}` : null,
    period ? `Dönem: ${period}` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="p-6 space-y-4">

      {/* Print header - sadece yazdırırken görünür */}
      <div className="print-header hidden">
        <div>KÖKLÜ YANGIN SÖNDÜRME CİHAZLARI</div>
        <div style={{ fontWeight: 'normal', fontSize: '12px', marginTop: '4px' }}>Faturalar Listesi · {printDate}</div>
        {activeFilterText && <div style={{ fontWeight: 'normal', fontSize: '11px', marginTop: '2px' }}>Filtreler: {activeFilterText}</div>}
      </div>

      {/* Üst bar */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Faturalar</h2>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <Link href="/cari-hesap/faturalar"
              className="no-print text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 border rounded-lg px-3 py-1.5 hover:bg-gray-50">
              Filtreleri Temizle
            </Link>
          )}
          <PrintButton />
          <Link href="/cari-hesap/faturalar/new"
            className="no-print bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26]">
            + Yeni Fatura
          </Link>
        </div>
      </div>

      {/* Durum filtreleri */}
      <div className="flex flex-wrap gap-2">
        {statusFilters.map(f => {
          const active = (status ?? 'all') === f.key
          const cnt = counts[f.key] ?? 0
          const isMahsupBtn = f.key === 'vergi_mahsup'
          return (
            <Link key={f.key} href={buildStatusUrl(f.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${
                active
                  ? isMahsupBtn ? 'bg-violet-600 text-white border-violet-600'
                    : 'bg-[#C8102E] text-white border-[#C8102E]'
                  : isMahsupBtn ? 'bg-white dark:bg-gray-800 text-violet-600 border-violet-200 hover:border-violet-400'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-[#C8102E] hover:text-[#C8102E]'
              }`}>
              {f.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                active ? 'bg-white dark:bg-gray-800/20 text-white' : isMahsupBtn ? 'bg-violet-50 text-violet-600' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
              }`}>{cnt}</span>
            </Link>
          )
        })}
      </div>

      {/* Tip + arama */}
      <div className="flex gap-3">
        <Link href={buildTypeUrl('satis')}
          className={`px-3 py-1.5 rounded-lg text-sm border font-medium transition-colors ${
            (type ?? '') === 'satis' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50'
          }`}>Satış Faturaları</Link>
        <Link href={buildTypeUrl('alis')}
          className={`px-3 py-1.5 rounded-lg text-sm border font-medium transition-colors ${
            (type ?? '') === 'alis' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50'
          }`}>Alış Faturaları</Link>
        <Link href={buildTypeUrl('')}
          className="px-3 py-1.5 rounded-lg text-sm border font-medium bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50">
          Tümü
        </Link>
        <form method="GET" action="/cari-hesap/faturalar" className="flex-1 flex gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          {type   && <input type="hidden" name="type"   value={type} />}
          {period && <input type="hidden" name="period" value={period} />}
          {period === 'ozel' && fromParam && <input type="hidden" name="from" value={fromParam} />}
          {period === 'ozel' && toParam   && <input type="hidden" name="to"   value={toParam} />}
          {sort && sort !== 'date_desc' && <input type="hidden" name="sort" value={sort} />}
          <input name="q" defaultValue={q ?? ''} placeholder="Fatura no, müşteri ara..."
            className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]/20 focus:border-[#C8102E]" />
          <button type="submit" className="border rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-800 hover:bg-gray-50">Ara</button>
        </form>
      </div>

      {/* Tarih / Sıralama filtresi */}
      <FaturaFiltrePaneli
        basePath="/cari-hesap/faturalar"
        preserveParams={{
          status: status ?? undefined,
          type: type ?? undefined,
          q: q ?? undefined,
        }}
      />

      {/* Özet kartlar */}
      {isMahsupFilter ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-violet-50 border border-violet-200 rounded-lg p-4">
            <div className="text-xs text-violet-600">Toplam Mahsup Edilen</div>
            <div className="text-xl font-bold text-violet-700 mt-0.5">{formatCurrency(mahsupToplam)}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
            <div className="text-xs text-gray-500 dark:text-gray-400">Mahsup Fatura Sayısı</div>
            <div className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-0.5">{filtered.length} fatura</div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
            <div className="text-xs text-gray-500 dark:text-gray-400">Toplam Tutar</div>
            <div className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-0.5">{formatCurrency(toplamFatura)}</div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="text-xs text-green-600">Tahsil Edilen</div>
            <div className="text-xl font-bold text-green-700 mt-0.5">{formatCurrency(toplamOdenen)}</div>
          </div>
          <div className={`rounded-lg p-4 border ${toplamKalan > 0 ? 'bg-orange-50 border-orange-200' : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600'}`}>
            <div className={`text-xs ${toplamKalan > 0 ? 'text-orange-600' : 'text-gray-500 dark:text-gray-400'}`}>Kalan</div>
            <div className={`text-xl font-bold mt-0.5 ${toplamKalan > 0 ? 'text-orange-700' : 'text-gray-900 dark:text-gray-100'}`}>{formatCurrency(toplamKalan)}</div>
          </div>
        </div>
      )}

      {/* Sonuç sayısı */}
      <div className="text-sm text-gray-500 dark:text-gray-400 px-1">
        <span className="font-semibold text-gray-700 dark:text-gray-300">{filtered.length}</span> sonuç bulundu
        {(period || dateFrom || dateTo) && (
          <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">
            {period && period !== 'ozel' && `· ${period === 'bu_ay' ? 'Bu Ay' : period === 'gecen_ay' ? 'Geçen Ay' : period === 'son_3_ay' ? 'Son 3 Ay' : 'Bu Yıl'}`}
            {dateFrom && ` · ${dateFrom}`}
            {dateTo   && ` — ${dateTo}`}
          </span>
        )}
      </div>

      {/* Tablo */}
      <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-gray-400 dark:text-gray-500 text-sm">Fatura bulunamadı.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Fatura No</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Müşteri / Tedarikçi</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Tip</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Tarih</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Vade</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Tutar</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Kalan</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Durum</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(inv => {
                  const customer = inv.customers as any
                  const kalan = (inv.total_amount ?? 0) - (inv.paid_amount ?? 0)
                  const unpaid = !['odendi', 'iptal', 'taslak'].includes(inv.status)
                  const isMahsup = (inv as any).mahsup_durumu === 'vergi_mahsup'
                  const statusConf = isMahsup
                    ? INVOICE_STATUS_CONFIG['vergi_mahsup']
                    : (INVOICE_STATUS_CONFIG[inv.status] ?? INVOICE_STATUS_CONFIG['taslak'])

                  let vadeBadge: ReactNode = null
                  if (inv.due_date && unpaid && !isMahsup) {
                    const diffDays = Math.floor(
                      (new Date(inv.due_date).getTime() - new Date(today).getTime()) / 86_400_000
                    )
                    if (diffDays < 0) {
                      vadeBadge = <span className="ml-1.5 inline-flex px-1.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700 border border-red-200">Gecikmiş</span>
                    } else if (diffDays === 0) {
                      vadeBadge = <span className="ml-1.5 inline-flex px-1.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 border border-orange-200">Bugün</span>
                    } else if (diffDays <= 7) {
                      vadeBadge = <span className="ml-1.5 inline-flex px-1.5 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700 border border-yellow-200">{diffDays}g kaldı</span>
                    }
                  }

                  return (
                    <tr key={inv.id} className={`hover:bg-gray-50 transition-colors ${isMahsup ? 'bg-violet-50/30' : ''}`}>
                      <td className="px-4 py-3">
                        <Link href={`/cari-hesap/faturalar/${inv.id}`}
                          className="text-sm font-semibold text-[#C8102E] hover:underline">
                          {inv.invoice_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                        {customer?.full_name ?? inv.supplier_name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{TYPE_LABELS[inv.invoice_type] ?? inv.invoice_type}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{formatTRDate(inv.invoice_date)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                        <span className={inv.due_date && unpaid && !isMahsup && inv.due_date < today ? 'text-red-600 font-medium' : ''}>
                          {inv.due_date ? formatTRDate(inv.due_date) : '—'}
                        </span>
                        {vadeBadge}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 text-right">{formatCurrency(inv.total_amount)}</td>
                      <td className={`px-4 py-3 text-sm font-semibold text-right ${kalan > 0 ? 'text-orange-600' : 'text-gray-400 dark:text-gray-500'}`}>
                        {kalan > 0 ? formatCurrency(kalan) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${statusConf.className}`}>
                          {statusConf.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/cari-hesap/faturalar/${inv.id}`}
                          className="text-xs text-[#C8102E] font-medium hover:underline">
                          Detay →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mahsup özet kartları */}
      {isMahsupFilter && filtered.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white dark:bg-gray-800 border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Kuruma Göre Mahsup</h3>
            <div className="space-y-2">
              {Object.entries(mahsupKurum).sort((a, b) => b[1] - a[1]).map(([kurum, tutar]) => (
                <div key={kurum} className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-300 truncate max-w-48">{kurum}</span>
                  <span className="font-semibold text-violet-700 ml-2">{formatCurrency(tutar)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 border rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Döneme Göre Mahsup</h3>
            <div className="space-y-2">
              {Object.entries(mahsupDonem).sort((a, b) => b[0].localeCompare(a[0])).map(([donem, tutar]) => (
                <div key={donem} className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-300">{donem}</span>
                  <span className="font-semibold text-violet-700">{formatCurrency(tutar)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
