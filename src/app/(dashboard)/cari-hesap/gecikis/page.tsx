// NOT: Vade tarihi NULL olan faturalar için önce şu migration'ı Supabase'de çalıştırın:
//   UPDATE public.invoices SET due_date = invoice_date
//   WHERE due_date IS NULL AND invoice_date IS NOT NULL AND invoice_type = 'alis';

import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { formatCurrency, formatTRDate, INVOICE_STATUS_CONFIG } from '@/lib/finance/formatters'
import { Suspense } from 'react'
import GrupFilter from './GrupFilter'
import PrintButton from '@/components/PrintButton'
import { applyTenantScope, getCurrentTenantAccessFromSession } from '@/lib/auth/tenant-scope'

export default async function GecikisPage({
  searchParams,
}: {
  searchParams: Promise<{ grupla?: string }>
}) {
  const { grupla } = await searchParams
  const supabase = createServiceClient()
  const tenantAccess = await getCurrentTenantAccessFromSession()
  const today = new Date().toISOString().split('T')[0]

  // Tüm ödenmemiş alış faturalarını çek (due_date filtresi olmadan)
  // due_date NULL olanlar için fatura tarihi esas alınır
  const { data: allInvoices } = await applyTenantScope(supabase
    .from('invoices')
    .select('id, invoice_number, supplier_name, invoice_date, due_date, total_amount, paid_amount, status')
    .eq('invoice_type', 'alis')
    .in('status', ['taslak', 'kesildi', 'gonderildi', 'kismi_odendi'])
    .order('invoice_date', { ascending: true }), tenantAccess)

  // Gecikmiş filtresi: vade tarihi yoksa fatura tarihi esas alınır
  const rows = (allInvoices ?? []).filter(inv => {
    const kalan = (inv.total_amount ?? 0) - (inv.paid_amount ?? 0)
    if (kalan <= 0) return false
    const effectiveDue = inv.due_date ?? inv.invoice_date
    if (!effectiveDue) return false
    return effectiveDue < today
  })

  // Her satır için efektif vade tarihi
  function effectiveDue(inv: (typeof rows)[number]): string {
    return inv.due_date ?? inv.invoice_date ?? ''
  }

  // Gecikme günü hesabı: bugün - efektif vade
  function gecikmeGun(inv: (typeof rows)[number]): number {
    const due = effectiveDue(inv)
    if (!due) return 0
    return Math.floor((Date.now() - new Date(due).getTime()) / 86400000)
  }

  // Gecikme süreline göre sırala (en uzun önce)
  rows.sort((a, b) => gecikmeGun(b) - gecikmeGun(a))

  const toplamGecikme = rows.reduce(
    (s, inv) => s + Math.max(0, (inv.total_amount ?? 0) - (inv.paid_amount ?? 0)),
    0
  )
  const enUzunGecikme = rows.length > 0 ? gecikmeGun(rows[0]) : 0

  // Tedarikçiye göre gruplama
  type InvRow = (typeof rows)[number]
  type SupGroup = {
    name: string
    invoices: InvRow[]
    total: number
    maxDaysLate: number
  }
  const supMap = new Map<string, SupGroup>()
  for (const inv of rows) {
    const key = inv.supplier_name ?? 'Bilinmeyen'
    const daysLate = gecikmeGun(inv)
    const kalan = (inv.total_amount ?? 0) - (inv.paid_amount ?? 0)
    const cur: SupGroup = supMap.get(key) ?? { name: key, invoices: [], total: 0, maxDaysLate: 0 }
    cur.invoices.push(inv)
    cur.total += kalan
    cur.maxDaysLate = Math.max(cur.maxDaysLate, daysLate)
    supMap.set(key, cur)
  }
  const groups = Array.from(supMap.values()).sort((a, b) => b.total - a.total)

  const printDate = new Date().toLocaleString('tr-TR')

  return (
    <div className="p-6 space-y-5">

      {/* Print header */}
      <div className="print-header hidden">
        <div>KÖKLÜ YANGIN SÖNDÜRME CİHAZLARI</div>
        <div style={{ fontWeight: 'normal', fontSize: '12px', marginTop: '4px' }}>Gecikmiş Faturalar · {printDate}</div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Gecikmiş Faturalar</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Vadesi geçmiş ve tam ödenmeyen tüm gelen faturalar</p>
        </div>
        <div className="flex items-center gap-2 no-print">
          <Suspense fallback={null}>
            <GrupFilter />
          </Suspense>
          <PrintButton />
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="text-xs text-red-600 mb-0.5">Toplam Gecikmiş Borç</div>
          <div className="text-xl font-bold text-red-700">{formatCurrency(toplamGecikme)}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{rows.length} fatura</div>
        </div>
        <div className="bg-white dark:bg-gray-800 border rounded-xl p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Tedarikçi Sayısı</div>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{supMap.size}</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">gecikmiş borç olan</div>
        </div>
        <div className="bg-white dark:bg-gray-800 border rounded-xl p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">En Uzun Gecikme</div>
          <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{enUzunGecikme} gün</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">en eski vadeli fatura</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 border rounded-xl px-4 py-12 text-center text-sm text-gray-400 dark:text-gray-500">
          Gecikmiş fatura yok
        </div>
      ) : grupla ? (
        /* Gruplanmış görünüm */
        <div className="space-y-4">
          {groups.map(group => (
            <div key={group.name} className="bg-white dark:bg-gray-800 border border-red-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-red-100 bg-red-50 flex items-center justify-between">
                <div>
                  <Link
                    href={`/cari-hesap/tedarikciler/${encodeURIComponent(group.name)}`}
                    className="text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-[#C8102E] hover:underline"
                  >
                    {group.name}
                  </Link>
                  <span className="ml-2 text-xs text-red-500">
                    max {group.maxDaysLate} gün gecikmiş
                  </span>
                </div>
                <div className="text-sm font-bold text-red-600">{formatCurrency(group.total)}</div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-gray-50 dark:bg-gray-700">
                    <tr>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Fatura No</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Fatura Tarihi</th>
                      <th className="text-left px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Vade Tarihi</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Tutar</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Kalan</th>
                      <th className="text-right px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Gecikme</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {group.invoices.map(inv => {
                      const kalan = (inv.total_amount ?? 0) - (inv.paid_amount ?? 0)
                      const daysLate = gecikmeGun(inv)
                      const due = effectiveDue(inv)
                      return (
                        <tr key={inv.id} className="hover:bg-red-50/30">
                          <td className="px-4 py-2.5">
                            <Link href={`/cari-hesap/faturalar/${inv.id}`} className="font-mono text-xs text-[#C8102E] hover:underline">
                              {inv.invoice_number}
                            </Link>
                          </td>
                          <td className="px-4 py-2.5 text-gray-600 dark:text-gray-300 text-xs">{formatTRDate(inv.invoice_date)}</td>
                          <td className="px-4 py-2.5 text-red-600 font-medium text-xs">
                            {formatTRDate(due)}
                            {!inv.due_date && <span className="ml-1 text-gray-400 dark:text-gray-500">(fatura tarihi)</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-800 dark:text-gray-200 font-medium">{formatCurrency(inv.total_amount)}</td>
                          <td className="px-4 py-2.5 text-right text-red-600 font-semibold">{formatCurrency(kalan)}</td>
                          <td className="px-4 py-2.5 text-right">
                            <span className="text-xs bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full font-medium">
                              {daysLate} gün
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <Link href={`/cari-hesap/faturalar/${inv.id}`} className="text-xs text-green-600 hover:underline font-medium">
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
          ))}
        </div>
      ) : (
        /* Düz liste */
        <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Tedarikçi</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Fatura No</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Fatura Tarihi</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Vade Tarihi</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Tutar</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Kalan</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Gecikme</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Durum</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map(inv => {
                  const kalan = (inv.total_amount ?? 0) - (inv.paid_amount ?? 0)
                  const daysLate = gecikmeGun(inv)
                  const due = effectiveDue(inv)
                  const statusConf = INVOICE_STATUS_CONFIG[inv.status ?? '']
                  return (
                    <tr key={inv.id} className="hover:bg-red-50/30">
                      <td className="px-4 py-3">
                        <Link
                          href={`/cari-hesap/tedarikciler/${encodeURIComponent(inv.supplier_name ?? '')}`}
                          className="font-medium text-gray-900 dark:text-gray-100 hover:text-[#C8102E] hover:underline"
                        >
                          {inv.supplier_name ?? '—'}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/cari-hesap/faturalar/${inv.id}`} className="font-mono text-xs text-[#C8102E] hover:underline">
                          {inv.invoice_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-sm">{formatTRDate(inv.invoice_date)}</td>
                      <td className="px-4 py-3">
                        <span className="text-red-600 font-medium text-sm">{formatTRDate(due)}</span>
                        {!inv.due_date && (
                          <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">(fatura tarihi)</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800 dark:text-gray-200">{formatCurrency(inv.total_amount)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-red-600">{formatCurrency(kalan)}</td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-xs border px-2 py-0.5 rounded-full font-medium ${
                          daysLate > 30
                            ? 'bg-red-100 text-red-700 border-red-200'
                            : 'bg-orange-100 text-orange-700 border-orange-200'
                        }`}>
                          {daysLate} gün
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {statusConf && (
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${statusConf.className}`}>
                            {statusConf.label}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/cari-hesap/faturalar/${inv.id}`} className="text-xs text-[#C8102E] hover:underline font-medium">
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
      )}
    </div>
  )
}
