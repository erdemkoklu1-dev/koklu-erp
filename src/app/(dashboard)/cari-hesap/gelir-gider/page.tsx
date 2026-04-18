import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { formatCurrency, formatTRDate, INVOICE_STATUS_CONFIG } from '@/lib/finance/formatters'

const PERIOD_MULT: Record<string, number> = {
  aylik: 1, ucaylik: 1 / 3, altiaylik: 1 / 6, yillik: 1 / 12,
}
const PERIOD_LABELS: Record<string, string> = {
  aylik: 'Aylık', ucaylik: '3 Aylık', altiaylik: '6 Aylık', yillik: 'Yıllık',
}

export default async function GelirGiderPage({
  searchParams,
}: {
  searchParams: Promise<{ direction?: string; q?: string; from?: string; to?: string }>
}) {
  const { direction, q, from, to } = await searchParams
  const supabase = createServiceClient()

  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`

  // ── Bu ay özeti ────────────────────────────────────────────────────
  const [
    { data: monthGelir },
    { data: monthGider },
    { data: monthMahsup },
    { data: allFixedExpenses },
  ] = await Promise.all([
    supabase.from('invoices')
      .select('total_amount')
      .eq('invoice_type', 'satis')
      .eq('mahsup_durumu', 'normal')
      .neq('status', 'iptal')
      .gte('invoice_date', monthStart),
    supabase.from('invoices')
      .select('total_amount')
      .eq('invoice_type', 'alis')
      .neq('status', 'iptal')
      .gte('invoice_date', monthStart),
    supabase.from('invoices')
      .select('total_amount, id')
      .eq('invoice_type', 'satis')
      .eq('mahsup_durumu', 'vergi_mahsup')
      .neq('status', 'iptal')
      .gte('invoice_date', monthStart),
    supabase.from('fixed_expenses')
      .select('id, name, amount, kdv_rate, period, day_of_month, start_date, end_date, expense_categories(name)')
      .eq('is_active', true),
  ])

  // Sabit giderlerin aylık karşılığını hesapla (bu ay aktif olanlar)
  const activeFixed = (allFixedExpenses ?? []).filter(e =>
    e.start_date <= todayStr && (!e.end_date || e.end_date >= monthStart)
  )
  const aylikSabitGider = activeFixed.reduce((s, e) => {
    const mult = PERIOD_MULT[e.period as string] ?? 1
    return s + (e.amount ?? 0) * mult
  }, 0)

  const aylikGelir = (monthGelir ?? []).reduce((s, r) => s + (r.total_amount ?? 0), 0)
  const aylikFaturaGider = (monthGider ?? []).reduce((s, r) => s + (r.total_amount ?? 0), 0)
  const aylikMahsup = (monthMahsup ?? []).reduce((s, r) => s + (r.total_amount ?? 0), 0)
  const aylikMahsupSayisi = (monthMahsup ?? []).length
  const aylikGider = aylikFaturaGider + aylikSabitGider + aylikMahsup

  // ── Ana liste ──────────────────────────────────────────────────────
  const shouldFetchGelir = !direction || direction === 'all' || direction === 'gelir'
  const shouldFetchGider = !direction || direction === 'all' || direction === 'gider'

  function applyInvoiceDateFilter(q2: any) {
    if (from) q2 = q2.gte('invoice_date', from)
    if (to)   q2 = q2.lte('invoice_date', to)
    return q2
  }

  const [{ data: gelirRows }, { data: giderRows }, { data: mahsupRows }] = await Promise.all([
    shouldFetchGelir
      ? applyInvoiceDateFilter(
          supabase.from('invoices')
            .select('id, invoice_number, invoice_date, total_amount, paid_amount, status, customers(full_name)')
            .eq('invoice_type', 'satis')
            .eq('mahsup_durumu', 'normal')
            .neq('status', 'iptal')
            .order('invoice_date', { ascending: false })
        )
      : Promise.resolve({ data: [] }),
    shouldFetchGider
      ? applyInvoiceDateFilter(
          supabase.from('invoices')
            .select('id, invoice_number, invoice_date, total_amount, paid_amount, status, supplier_name')
            .eq('invoice_type', 'alis')
            .neq('status', 'iptal')
            .order('invoice_date', { ascending: false })
        )
      : Promise.resolve({ data: [] }),
    shouldFetchGider
      ? applyInvoiceDateFilter(
          supabase.from('invoices')
            .select('id, invoice_number, invoice_date, total_amount, paid_amount, status, mahsup_tarihi, mahsup_aciklama, customers(full_name)')
            .eq('invoice_type', 'satis')
            .eq('mahsup_durumu', 'vergi_mahsup')
            .neq('status', 'iptal')
            .order('invoice_date', { ascending: false })
        )
      : Promise.resolve({ data: [] }),
  ])

  type Row = {
    id: string
    rowType: 'invoice' | 'fixed' | 'mahsup'
    direction: 'gelir' | 'gider'
    referans: string | null
    tarih: string | null
    taraf: string | null
    total_amount: number
    paid_amount: number
    status: string | null
    period?: string
  }

  const gelir: Row[] = (gelirRows ?? []).map((r: any) => ({
    id: r.id, rowType: 'invoice', direction: 'gelir',
    referans: r.invoice_number, tarih: r.invoice_date,
    taraf: r.customers?.full_name ?? null,
    total_amount: r.total_amount ?? 0, paid_amount: r.paid_amount ?? 0,
    status: r.status,
  }))

  const giderFatura: Row[] = (giderRows ?? []).map((r: any) => ({
    id: r.id, rowType: 'invoice', direction: 'gider',
    referans: r.invoice_number, tarih: r.invoice_date,
    taraf: r.supplier_name ?? null,
    total_amount: r.total_amount ?? 0, paid_amount: r.paid_amount ?? 0,
    status: r.status,
  }))

  const mahsupFatura: Row[] = (mahsupRows ?? []).map((r: any) => ({
    id: r.id, rowType: 'mahsup', direction: 'gider',
    referans: r.invoice_number, tarih: r.mahsup_tarihi ?? r.invoice_date,
    taraf: r.customers?.full_name ?? null,
    total_amount: r.total_amount ?? 0, paid_amount: r.paid_amount ?? 0,
    status: 'vergi_mahsup',
    _aciklama: r.mahsup_aciklama,
  } as Row & { _aciklama: string | null }))

  // Sabit giderleri satır olarak ekle (tarih filtresi: start_date aralığına göre)
  const fixedRows: Row[] = shouldFetchGider ? activeFixed
    .filter(e => {
      const dueDateThisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(e.day_of_month).padStart(2, '0')}`
      const dueDate = dueDateThisMonth <= todayStr ? dueDateThisMonth : e.start_date
      if (from && dueDate < from) return false
      if (to   && dueDate > to)   return false
      return true
    })
    .map(e => {
      const cat = (e as any).expense_categories
      const dueDateThisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(e.day_of_month).padStart(2, '0')}`
      return {
        id: `fixed-${e.id}`, rowType: 'fixed', direction: 'gider',
        referans: null, tarih: dueDateThisMonth,
        taraf: cat?.name ?? null,
        total_amount: e.amount ?? 0, paid_amount: 0,
        status: null, period: e.period as string,
        _name: e.name,
      } as Row & { _name: string }
    }) : []

  // Birleştir, tarihe göre sırala
  const combined: Row[] = [...gelir, ...giderFatura, ...mahsupFatura, ...fixedRows].sort((a, b) =>
    (b.tarih ?? '').localeCompare(a.tarih ?? '')
  )

  // Arama filtresi
  const filtered = combined.filter(r => {
    if (!q) return true
    const search = q.toLowerCase()
    return (
      (r.referans ?? '').toLowerCase().includes(search) ||
      (r.taraf ?? '').toLowerCase().includes(search) ||
      ((r as any)._name ?? '').toLowerCase().includes(search) ||
      ((r as any)._aciklama ?? '').toLowerCase().includes(search)
    )
  })

  const toplamGelir  = filtered.filter(r => r.direction === 'gelir').reduce((s, r) => s + r.total_amount, 0)
  const toplamGider  = filtered.filter(r => r.direction === 'gider').reduce((s, r) => s + r.total_amount, 0)

  function buildUrl(overrides: Record<string, string | undefined>) {
    const params = new URLSearchParams()
    const base = { direction, q, from, to, ...overrides }
    for (const [k, v] of Object.entries(base)) {
      if (v && v !== 'all') params.set(k, v)
    }
    const qs = params.toString()
    return `/cari-hesap/gelir-gider${qs ? '?' + qs : ''}`
  }

  return (
    <div className="p-6 space-y-4">

      {/* Üst bar */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Gelir / Gider İşlemleri</h2>
        <div className="flex gap-2">
          <Link href="/cari-hesap/sabit-giderler"
            className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            Sabit Giderler
          </Link>
          <Link href="/cari-hesap/faturalar/new"
            className="bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26]">
            + Yeni Fatura
          </Link>
        </div>
      </div>

      {/* Bu ay özeti */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="text-xs text-green-600">Bu Ay Gelir</div>
          <div className="text-xl font-bold text-green-700 mt-0.5">{formatCurrency(aylikGelir)}</div>
          <div className="text-xs text-gray-400 mt-0.5">satış faturaları</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="text-xs text-red-600">Bu Ay Gider</div>
          <div className="text-xl font-bold text-red-700 mt-0.5">{formatCurrency(aylikGider)}</div>
          <div className="text-xs text-gray-400 mt-0.5">
            fatura {formatCurrency(aylikFaturaGider)} + sabit {formatCurrency(aylikSabitGider)}
          </div>
        </div>
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
          <div className="text-xs text-violet-600">Vergi Mahsup Toplamı</div>
          <div className="text-xl font-bold text-violet-700 mt-0.5">{formatCurrency(aylikMahsup)}</div>
          <div className="text-xs text-gray-400 mt-0.5">
            {aylikMahsupSayisi} fatura mahsup edildi
          </div>
        </div>
        <div className={`rounded-xl p-4 border ${aylikGelir - aylikGider >= 0 ? 'bg-gray-50 border-gray-200' : 'bg-orange-50 border-orange-200'}`}>
          <div className="text-xs text-gray-500">Bu Ay Net</div>
          <div className={`text-xl font-bold mt-0.5 ${aylikGelir - aylikGider >= 0 ? 'text-gray-900' : 'text-orange-700'}`}>
            {formatCurrency(aylikGelir - aylikGider)}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">gelir − gider</div>
        </div>
      </div>

      {/* Filtreler */}
      <div className="bg-white border rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {[
            { value: 'all', label: 'Tümü' },
            { value: 'gelir', label: 'Gelir' },
            { value: 'gider', label: 'Gider' },
          ].map(opt => (
            <Link key={opt.value} href={buildUrl({ direction: opt.value })}
              className={`px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${
                (!direction || direction === 'all') && opt.value === 'all'
                  ? 'bg-[#C8102E] text-white border-[#C8102E]'
                  : direction === opt.value && opt.value !== 'all'
                  ? opt.value === 'gelir' ? 'bg-green-600 text-white border-green-600' : 'bg-red-600 text-white border-red-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
              }`}>
              {opt.label}
            </Link>
          ))}
        </div>
        <form method="GET" action="/cari-hesap/gelir-gider" className="flex gap-2 flex-wrap">
          {direction && direction !== 'all' && <input type="hidden" name="direction" value={direction} />}
          <input type="date" name="from" defaultValue={from ?? ''}
            className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]/20 focus:border-[#C8102E]" />
          <input type="date" name="to" defaultValue={to ?? ''}
            className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]/20 focus:border-[#C8102E]" />
          <input name="q" defaultValue={q ?? ''} placeholder="Fatura no, müşteri, tedarikçi veya gider adı..."
            className="flex-1 min-w-48 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]/20 focus:border-[#C8102E]" />
          <button type="submit" className="border rounded-lg px-3 py-1.5 text-sm bg-white hover:bg-gray-50">Ara</button>
          {(from || to || q) && (
            <Link href={buildUrl({ q: undefined, from: undefined, to: undefined })}
              className="border rounded-lg px-3 py-1.5 text-sm bg-white hover:bg-gray-50 text-gray-400">
              Temizle
            </Link>
          )}
        </form>
      </div>

      {/* Özet satır */}
      <div className="flex gap-4 text-sm px-1">
        <span className="text-gray-500">{filtered.length} kayıt</span>
        <span className="text-green-600 font-medium">Gelir: {formatCurrency(toplamGelir)}</span>
        <span className="text-red-600 font-medium">Gider: {formatCurrency(toplamGider)}</span>
        <span className={`font-semibold ${toplamGelir - toplamGider >= 0 ? 'text-gray-900' : 'text-orange-600'}`}>
          Net: {formatCurrency(toplamGelir - toplamGider)}
        </span>
      </div>

      {/* Tablo */}
      <div className="bg-white border rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-gray-400 text-sm">Kayıt bulunamadı.</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Tarih</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Tür</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Açıklama</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Durum / Periyot</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Ödenen</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Tutar</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(r => {
                const isFixed = r.rowType === 'fixed'
                const isMahsupRow = r.rowType === 'mahsup'
                const rAny = r as any
                const statusConf = !isFixed && r.status
                  ? (INVOICE_STATUS_CONFIG[r.status] ?? INVOICE_STATUS_CONFIG['taslak'])
                  : null
                const kalan = Math.max(0, r.total_amount - r.paid_amount)

                return (
                  <tr key={r.id} className={`hover:bg-gray-50 ${isFixed ? 'bg-purple-50/30' : isMahsupRow ? 'bg-violet-50/40' : ''}`}>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                      {formatTRDate(r.tarih)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${
                        r.direction === 'gelir' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                      }`}>
                        {r.direction === 'gelir' ? 'Gelir' : 'Gider'}
                      </span>
                      {isFixed && (
                        <span className="ml-1 inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-700">
                          Sabit
                        </span>
                      )}
                      {isMahsupRow && (
                        <span className="ml-1 inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-violet-50 text-violet-700">
                          Mahsup
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 max-w-xs">
                      {isFixed ? (
                        <div>
                          <span className="font-medium">{rAny._name}</span>
                          {r.taraf && <span className="text-xs text-gray-400 ml-1">· {r.taraf}</span>}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          {r.referans && (
                            <Link href={`/cari-hesap/faturalar/${r.id}`}
                              className="font-mono text-xs text-[#C8102E] hover:underline">
                              {r.referans}
                            </Link>
                          )}
                          <div>
                            <span className="truncate text-gray-700">{r.taraf ?? '—'}</span>
                            {isMahsupRow && rAny._aciklama && (
                              <div className="text-xs text-violet-500 mt-0.5">{rAny._aciklama}</div>
                            )}
                            {isMahsupRow && !rAny._aciklama && (
                              <div className="text-xs text-gray-400 mt-0.5">Vergi Ödemesi / Mahsup</div>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {isFixed ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
                          {PERIOD_LABELS[r.period ?? ''] ?? r.period}
                        </span>
                      ) : statusConf ? (
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${statusConf.className}`}>
                          {statusConf.label}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-green-700">
                      {!isFixed && r.paid_amount > 0 ? formatCurrency(r.paid_amount) : '—'}
                    </td>
                    <td className={`px-4 py-3 text-sm font-semibold text-right ${
                      r.direction === 'gelir' ? 'text-green-700' : isMahsupRow ? 'text-violet-700' : 'text-red-700'
                    }`}>
                      {r.direction === 'gelir' ? '+' : '-'}{formatCurrency(r.total_amount)}
                      {!isFixed && kalan > 0 && (
                        <div className="text-xs font-normal text-orange-500">{formatCurrency(kalan)} kalan</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isFixed ? (
                        <Link href="/cari-hesap/sabit-giderler"
                          className="text-xs text-gray-400 hover:text-purple-600">Düzenle →</Link>
                      ) : (
                        <Link href={`/cari-hesap/faturalar/${r.id}`}
                          className="text-xs text-gray-400 hover:text-[#C8102E]">Detay →</Link>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
