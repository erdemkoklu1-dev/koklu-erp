import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { formatCurrency, formatTRDate, MONTHS_TR, INVOICE_STATUS_CONFIG } from '@/lib/finance/formatters'
import { getCurrentAccess } from '@/lib/auth/authorization'
import { applyBranchScope } from '@/lib/auth/branch-scope'
import { applyTenantScope, getCurrentTenantAccessFromSession } from '@/lib/auth/tenant-scope'

type InvoiceAmountRow = {
  total_amount: number | null
  paid_amount?: number | null
}

type InvoiceDueRow = {
  id: string
  invoice_number: string | null
  total_amount: number | null
  paid_amount: number | null
  due_date: string | null
  customers: { full_name: string | null } | null
}

type YearlyInvoiceRow = {
  invoice_date: string
  invoice_type: string | null
  total_amount: number | null
}

export default async function MaliDurumPage({
  searchParams,
}: {
  searchParams: Promise<{ yil?: string; ay?: string }>
}) {
  const { yil, ay } = await searchParams
  const supabase = createServiceClient()
  const access = await getCurrentAccess()
  const tenantAccess = await getCurrentTenantAccessFromSession()
  const today = new Date()
  const year = parseInt(yil ?? String(today.getFullYear()))
  const month = parseInt(ay ?? String(today.getMonth() + 1))

  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
  const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`
  const yearStart = `${year}-01-01`
  const yearEnd = `${year + 1}-01-01`
  const todayStr = today.toISOString().split('T')[0]
  const in30 = new Date(today); in30.setDate(today.getDate() + 30)
  const in30Str = in30.toISOString().split('T')[0]

  const in7 = new Date(today); in7.setDate(today.getDate() + 7)
  const in7Str = in7.toISOString().split('T')[0]
  const invoiceScope = (query: any) => applyBranchScope(applyTenantScope(query, tenantAccess), access)

  const [
    { data: monthInvoices },
    { data: monthTransactions },
    { data: overdueInvoices },
    { data: upcomingInvoices },
    { data: monthSalaries },
    { data: upcomingTax },
    { data: recentTransactions },
    { data: yearlyInvoicesRaw },
    { data: monthAlisInvoices },
    { data: unpaidAlisInvoices },
    { data: overdueAlisInvoices },
    { data: thisWeekAlisInvoices },
  ] = await Promise.all([
    // Bu ay kesilen satış faturaları
    invoiceScope(supabase.from('invoices')
      .select('total_amount, paid_amount, status')
      .eq('invoice_type', 'satis')
      .gte('invoice_date', monthStart)
      .lt('invoice_date', nextMonth)
      .neq('status', 'iptal')),

    // Bu ay gelir/gider işlemleri
    supabase.from('transactions')
      .select('direction, net_amount, kdv_amount')
      .gte('transaction_date', monthStart)
      .lt('transaction_date', nextMonth),

    // Gecikmiş alacaklar
    invoiceScope(supabase.from('invoices')
      .select('id, invoice_number, total_amount, paid_amount, due_date, customers(full_name)')
      .eq('invoice_type', 'satis')
      .not('due_date', 'is', null)
      .lt('due_date', todayStr)
      .in('status', ['kesildi', 'gonderildi', 'kismi_odendi'])
      .order('due_date', { ascending: true })
      .limit(10)),

    // 30 gün içinde vadesi gelecek
    invoiceScope(supabase.from('invoices')
      .select('id, invoice_number, total_amount, paid_amount, due_date, customers(full_name)')
      .eq('invoice_type', 'satis')
      .gte('due_date', todayStr)
      .lte('due_date', in30Str)
      .in('status', ['kesildi', 'gonderildi', 'kismi_odendi'])
      .order('due_date', { ascending: true })
      .limit(10)),

    // Bu ay maaş ödemeleri
    supabase.from('salary_payments')
      .select('net_amount, sgk_employer, gross_amount')
      .eq('payment_year', year)
      .eq('payment_month', month),

    // Yaklaşan vergi beyannameleri
    supabase.from('tax_declarations')
      .select('tax_type, due_date, tax_amount, status')
      .gte('due_date', todayStr)
      .lte('due_date', in30Str)
      .neq('status', 'odendi')
      .order('due_date', { ascending: true })
      .limit(8),

    // Son 10 işlem
    supabase.from('transactions')
      .select('id, direction, description, net_amount, transaction_date, expense_categories(name)')
      .order('transaction_date', { ascending: false })
      .limit(10),

    // Yıllık aylık özet
    invoiceScope(supabase.from('invoices')
      .select('invoice_date, total_amount, invoice_type')
      .gte('invoice_date', yearStart)
      .lt('invoice_date', yearEnd)
      .neq('status', 'iptal')),

    // Bu ay gelen fatura toplamı
    invoiceScope(supabase.from('invoices')
      .select('total_amount')
      .eq('invoice_type', 'alis')
      .gte('invoice_date', monthStart)
      .lt('invoice_date', nextMonth)
      .neq('status', 'iptal')),

    // Ödenmemiş gelen faturalar
    invoiceScope(supabase.from('invoices')
      .select('total_amount, paid_amount')
      .eq('invoice_type', 'alis')
      .in('status', ['taslak', 'kesildi', 'gonderildi', 'kismi_odendi'])),

    // Vadesi geçmiş borçlar
    invoiceScope(supabase.from('invoices')
      .select('total_amount, paid_amount')
      .eq('invoice_type', 'alis')
      .not('due_date', 'is', null)
      .lt('due_date', todayStr)
      .in('status', ['taslak', 'kesildi', 'gonderildi', 'kismi_odendi'])),

    // Bu hafta vadesi dolacak gelen faturalar
    invoiceScope(supabase.from('invoices')
      .select('id')
      .eq('invoice_type', 'alis')
      .gte('due_date', todayStr)
      .lte('due_date', in7Str)
      .in('status', ['taslak', 'kesildi', 'gonderildi', 'kismi_odendi'])),
  ])

  const monthInvoiceRows = (monthInvoices ?? []) as InvoiceAmountRow[]
  const overdueInvoiceRows = (overdueInvoices ?? []) as InvoiceDueRow[]
  const upcomingInvoiceRows = (upcomingInvoices ?? []) as InvoiceDueRow[]
  const yearlyInvoiceRows = (yearlyInvoicesRaw ?? []) as YearlyInvoiceRow[]
  const monthAlisInvoiceRows = (monthAlisInvoices ?? []) as InvoiceAmountRow[]
  const unpaidAlisInvoiceRows = (unpaidAlisInvoices ?? []) as InvoiceAmountRow[]
  const overdueAlisInvoiceRows = (overdueAlisInvoices ?? []) as InvoiceAmountRow[]
  const thisWeekAlisInvoiceRows = (thisWeekAlisInvoices ?? []) as { id: string }[]

  // Hesaplamalar
  const ciro = monthInvoiceRows.reduce((s, i) => s + (i.total_amount ?? 0), 0)
  const tahsilat = monthInvoiceRows.reduce((s, i) => s + (i.paid_amount ?? 0), 0)
  const alacak = monthInvoiceRows.reduce((s, i) => s + Math.max(0, (i.total_amount ?? 0) - (i.paid_amount ?? 0)), 0)

  const gelirIslemleri = (monthTransactions ?? []).filter(t => t.direction === 'gelir')
  const giderIslemleri = (monthTransactions ?? []).filter(t => t.direction === 'gider')
  const toplamGelir = gelirIslemleri.reduce((s, t) => s + (t.net_amount ?? 0), 0)
  const toplamGider = giderIslemleri.reduce((s, t) => s + (t.net_amount ?? 0), 0)
  const personelMaliyet = (monthSalaries ?? []).reduce((s, p) => s + (p.net_amount ?? 0) + (p.sgk_employer ?? 0), 0)
  const netKar = toplamGelir + tahsilat - toplamGider - personelMaliyet

  const overdueTotal = overdueInvoiceRows.reduce(
    (s, i) => s + Math.max(0, (i.total_amount ?? 0) - (i.paid_amount ?? 0)), 0
  )

  // Gelen fatura hesaplamaları
  const buAyGelenToplam = monthAlisInvoiceRows.reduce((s, i) => s + (i.total_amount ?? 0), 0)
  const odenmemisGelenToplam = unpaidAlisInvoiceRows.reduce(
    (s, i) => s + Math.max(0, (i.total_amount ?? 0) - (i.paid_amount ?? 0)), 0
  )
  const gecikmisBorcToplam = overdueAlisInvoiceRows.reduce(
    (s, i) => s + Math.max(0, (i.total_amount ?? 0) - (i.paid_amount ?? 0)), 0
  )
  const buHaftaVadeliSayi = thisWeekAlisInvoiceRows.length

  // Aylık ciro trendi (son 6 ay)
  type MonthlyBar = { label: string; satis: number; alis: number }
  const monthlyMap = new Map<string, MonthlyBar>()
  for (let i = 5; i >= 0; i--) {
    const d = new Date(year, month - 1 - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthlyMap.set(key, { label: MONTHS_TR[d.getMonth()].slice(0, 3), satis: 0, alis: 0 })
  }
  for (const inv of yearlyInvoiceRows) {
    const key = inv.invoice_date.slice(0, 7)
    if (monthlyMap.has(key)) {
      const row = monthlyMap.get(key)!
      if (inv.invoice_type === 'satis') row.satis += inv.total_amount ?? 0
      else if (inv.invoice_type === 'alis') row.alis += inv.total_amount ?? 0
    }
  }
  const monthlyBars = Array.from(monthlyMap.values())
  const maxBar = Math.max(...monthlyBars.map(b => Math.max(b.satis, b.alis)), 1)

  const TAX_LABELS: Record<string, string> = {
    kdv: 'KDV', muhtasar: 'Muhtasar', gelir_vergisi: 'Gelir Vergisi',
    kurumlar_vergisi: 'Kurumlar Vergisi', sgk_bildirimi: 'SGK', damga_vergisi: 'Damga',
  }

  return (
    <div className="p-6 space-y-6">

      {/* Dönem Seçici */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            {MONTHS_TR[month - 1]} {year} — Mali Durum
          </h2>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            Bugün: {new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex gap-2">
          <form method="GET" className="flex gap-2 items-center">
            <select name="ay" defaultValue={month}
              className="border rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
              {MONTHS_TR.map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
            <select name="yil" defaultValue={year}
              className="border rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
              {[year - 1, year, year + 1].map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button type="submit"
              className="bg-[#C8102E] text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-[#a50d26]">
              Göster
            </button>
          </form>
        </div>
      </div>

      {/* KPI Kartları */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 border rounded-xl p-5">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Aylık Ciro (Fatura)</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(ciro)}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">Tahsilat: {formatCurrency(tahsilat)}</div>
        </div>
        <div className={`rounded-xl p-5 border ${alacak > 0 ? 'bg-orange-50 border-orange-200' : 'bg-white dark:bg-gray-800'}`}>
          <div className={`text-xs font-medium mb-1 ${alacak > 0 ? 'text-orange-600' : 'text-gray-500 dark:text-gray-400'}`}>Tahsil Edilmemiş</div>
          <div className={`text-2xl font-bold ${alacak > 0 ? 'text-orange-700' : 'text-gray-900 dark:text-gray-100'}`}>{formatCurrency(alacak)}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">Bu ay kesilen faturalardan</div>
        </div>
        <div className={`rounded-xl p-5 border ${overdueTotal > 0 ? 'bg-red-50 border-red-200' : 'bg-white dark:bg-gray-800'}`}>
          <div className={`text-xs font-medium mb-1 ${overdueTotal > 0 ? 'text-red-600' : 'text-gray-500 dark:text-gray-400'}`}>Gecikmiş Alacak</div>
          <div className={`text-2xl font-bold ${overdueTotal > 0 ? 'text-red-700' : 'text-gray-900 dark:text-gray-100'}`}>{formatCurrency(overdueTotal)}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">{overdueInvoiceRows.length} fatura gecikmiş</div>
        </div>
        <div className="bg-white dark:bg-gray-800 border rounded-xl p-5">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Toplam Gider</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(toplamGider)}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">Personel hariç nakit gider</div>
        </div>
        <div className="bg-white dark:bg-gray-800 border rounded-xl p-5">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Personel Maliyeti</div>
          <div className="text-2xl font-bold text-gray-700 dark:text-gray-300">{formatCurrency(personelMaliyet)}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">Net + SGK işveren</div>
        </div>
        <div className={`rounded-xl p-5 border ${netKar >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className={`text-xs font-medium mb-1 ${netKar >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {netKar >= 0 ? 'Net Kâr' : 'Net Zarar'}
          </div>
          <div className={`text-2xl font-bold ${netKar >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatCurrency(Math.abs(netKar))}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">Tahsilat − Gider − Personel</div>
        </div>
      </div>

      {/* Gelen Fatura Özeti */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Gelen Fatura Özeti</h3>
          <Link href="/cari-hesap/gelen-faturalar" className="text-xs text-[#C8102E] hover:underline font-medium">
            Tümünü gör →
          </Link>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-gray-800 border rounded-xl p-4">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Bu Ay Gelen Fatura</div>
            <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(buAyGelenToplam)}</div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{monthAlisInvoiceRows.length} fatura</div>
          </div>
          <div className={`rounded-xl p-4 border ${odenmemisGelenToplam > 0 ? 'bg-orange-50 border-orange-200' : 'bg-white dark:bg-gray-800'}`}>
            <div className={`text-xs font-medium mb-1 ${odenmemisGelenToplam > 0 ? 'text-orange-600' : 'text-gray-500 dark:text-gray-400'}`}>Ödenmemiş Borç</div>
            <div className={`text-xl font-bold ${odenmemisGelenToplam > 0 ? 'text-orange-700' : 'text-gray-900 dark:text-gray-100'}`}>{formatCurrency(odenmemisGelenToplam)}</div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">tüm ödenmemiş</div>
          </div>
          <div className={`rounded-xl p-4 border ${gecikmisBorcToplam > 0 ? 'bg-red-50 border-red-200' : 'bg-white dark:bg-gray-800'}`}>
            <div className={`text-xs font-medium mb-1 ${gecikmisBorcToplam > 0 ? 'text-red-600' : 'text-gray-500 dark:text-gray-400'}`}>Gecikmiş Borçlar</div>
            <div className={`text-xl font-bold ${gecikmisBorcToplam > 0 ? 'text-red-700' : 'text-gray-900 dark:text-gray-100'}`}>{formatCurrency(gecikmisBorcToplam)}</div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              <Link href="/cari-hesap/gecikis" className="hover:underline">Detay →</Link>
            </div>
          </div>
          <div className={`rounded-xl p-4 border ${buHaftaVadeliSayi > 0 ? 'bg-orange-50 border-orange-200' : 'bg-white dark:bg-gray-800'}`}>
            <div className={`text-xs font-medium mb-1 ${buHaftaVadeliSayi > 0 ? 'text-orange-600' : 'text-gray-500 dark:text-gray-400'}`}>Bu Hafta Vadeli</div>
            <div className={`text-xl font-bold ${buHaftaVadeliSayi > 0 ? 'text-orange-700' : 'text-gray-900 dark:text-gray-100'}`}>{buHaftaVadeliSayi}</div>
            <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">fatura vadesi dolacak</div>
          </div>
        </div>
      </div>

      {/* Grafik + Vadeler yan yana */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Son 6 Ay Trend */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Son 6 Ay — Ciro Trendi</h3>
            <div className="flex gap-3 text-xs text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-[#C8102E] inline-block" /> Satış</span>
              <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-gray-300 inline-block" /> Alış</span>
            </div>
          </div>
          <div className="flex items-end gap-3 h-32">
            {monthlyBars.map((bar, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex gap-0.5 items-end" style={{ height: '100px' }}>
                  <div
                    className="flex-1 bg-[#C8102E] rounded-t-sm opacity-80 transition-all"
                    style={{ height: `${(bar.satis / maxBar) * 100}%`, minHeight: bar.satis > 0 ? '2px' : '0' }}
                    title={formatCurrency(bar.satis)}
                  />
                  <div
                    className="flex-1 bg-gray-300 rounded-t-sm transition-all"
                    style={{ height: `${(bar.alis / maxBar) * 100}%`, minHeight: bar.alis > 0 ? '2px' : '0' }}
                    title={formatCurrency(bar.alis)}
                  />
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-500">{bar.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Yaklaşan Vadeler */}
        <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 dark:bg-gray-700 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">30 Gün İçinde Vadeler</h3>
          </div>
          <div className="divide-y max-h-48 overflow-y-auto">
            {(upcomingTax ?? []).length === 0 && upcomingInvoiceRows.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">Yaklaşan vade yok</div>
            ) : null}
            {(upcomingTax ?? []).map((t, i) => (
              <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-gray-800 dark:text-gray-200">{TAX_LABELS[t.tax_type] ?? t.tax_type}</div>
                  <div className="text-xs text-gray-400 dark:text-gray-500">{formatTRDate(t.due_date)}</div>
                </div>
                <span className="text-xs font-medium text-purple-600 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-full">
                  Vergi
                </span>
              </div>
            ))}
            {upcomingInvoiceRows.map(inv => {
              const remaining = (inv.total_amount ?? 0) - (inv.paid_amount ?? 0)
              const c = inv.customers as any
              return (
                <Link key={inv.id} href={`/cari-hesap/faturalar/${inv.id}`}
                  className="px-4 py-2.5 flex items-center justify-between hover:bg-gray-50 transition-colors">
                  <div>
                    <div className="text-xs font-medium text-gray-800 dark:text-gray-200">{c?.full_name ?? '—'}</div>
                    <div className="text-xs text-gray-400 dark:text-gray-500">{formatTRDate(inv.due_date)} · {inv.invoice_number}</div>
                  </div>
                  <span className="text-xs font-semibold text-orange-700">{formatCurrency(remaining)}</span>
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      {/* Gecikmiş Alacaklar + Son İşlemler */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Gecikmiş Alacaklar */}
        {overdueInvoiceRows.length > 0 && (
          <div className="bg-white dark:bg-gray-800 border border-red-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-red-100 bg-red-50 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-red-800">
                Gecikmiş Alacaklar
                <span className="ml-2 bg-red-600 text-white text-xs px-2 py-0.5 rounded-full">{overdueInvoiceRows.length}</span>
              </h3>
              <Link href="/cari-hesap/faturalar" className="text-xs text-red-600 hover:underline font-medium">
                Tümünü gör →
              </Link>
            </div>
            <div className="divide-y">
              {overdueInvoiceRows.map(inv => {
                const remaining = (inv.total_amount ?? 0) - (inv.paid_amount ?? 0)
                const daysOver = Math.floor((Date.now() - new Date(inv.due_date!).getTime()) / 86400000)
                const c = inv.customers as any
                return (
                  <Link key={inv.id} href={`/cari-hesap/faturalar/${inv.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-red-50 transition-colors">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{c?.full_name ?? '—'}</div>
                      <div className="text-xs text-gray-400 dark:text-gray-500">{inv.invoice_number} · {daysOver} gün gecikmiş</div>
                    </div>
                    <div className="text-sm font-bold text-red-600">{formatCurrency(remaining)}</div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* Son İşlemler */}
        <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50 dark:bg-gray-700 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Son İşlemler</h3>
            <Link href="/cari-hesap/gelir-gider" className="text-xs text-[#C8102E] hover:underline font-medium">
              Tümü →
            </Link>
          </div>
          {(recentTransactions ?? []).length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">Henüz işlem yok</div>
          ) : (
            <div className="divide-y">
              {(recentTransactions ?? []).map(t => {
                const cat = t.expense_categories as any
                return (
                  <div key={t.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate max-w-[200px]">{t.description}</div>
                      <div className="text-xs text-gray-400 dark:text-gray-500">
                        {cat?.name} · {formatTRDate(t.transaction_date)}
                      </div>
                    </div>
                    <div className={`text-sm font-semibold ${t.direction === 'gelir' ? 'text-green-600' : 'text-red-600'}`}>
                      {t.direction === 'gelir' ? '+' : '-'}{formatCurrency(t.net_amount)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <div className="px-4 py-3 border-t bg-gray-50 dark:bg-gray-700">
            <Link href="/cari-hesap/gelir-gider/new"
              className="block text-center text-sm text-[#C8102E] font-medium hover:underline">
              + Yeni Gelir / Gider Ekle
            </Link>
          </div>
        </div>

      </div>
    </div>
  )
}
