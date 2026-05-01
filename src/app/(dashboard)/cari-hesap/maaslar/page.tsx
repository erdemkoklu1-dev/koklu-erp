import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { formatCurrency, MONTHS_TR } from '@/lib/finance/formatters'
import MaaslarClient from './MaaslarClient'

export default async function MaaslarPage({
  searchParams,
}: {
  searchParams: Promise<{ yil?: string; ay?: string }>
}) {
  const { yil, ay } = await searchParams
  const supabase = createServiceClient()
  const today = new Date()
  const year = parseInt(yil ?? String(today.getFullYear()))
  const month = parseInt(ay ?? String(today.getMonth() + 1))

  const [{ data: employees }, { data: payments }] = await Promise.all([
    supabase.from('employees').select('*').order('full_name'),
    supabase.from('salary_payments')
      .select('*')
      .eq('payment_year', year)
      .eq('payment_month', month),
  ])

  const paymentMap = new Map<string, any>()
  for (const p of payments ?? []) {
    paymentMap.set(p.employee_id, p)
  }

  const aktifler = (employees ?? []).filter(e => e.status === 'aktif')
  const odenenler = (payments ?? []).length
  const toplamNet = (payments ?? []).reduce((s, p) => s + (p.net_amount ?? 0), 0)
  const toplamSGK = (payments ?? []).reduce((s, p) => s + (p.sgk_employer ?? 0), 0)
  const toplamMaliyet = toplamNet + toplamSGK

  return (
    <div className="p-6 space-y-4">

      {/* Üst bar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Maaş Yönetimi</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {MONTHS_TR[month - 1]} {year} — Çalışan: {aktifler.length} kişi
          </p>
        </div>
        <div className="flex gap-2">
          <form method="GET" className="flex gap-2">
            <select name="ay" defaultValue={month}
              className="border rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
              {MONTHS_TR.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
            <select name="yil" defaultValue={year}
              className="border rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
              {[year - 1, year, year + 1].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button type="submit"
              className="bg-[#C8102E] text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-[#a50d26]">
              Göster
            </button>
          </form>
          <MaaslarClient mode="add-employee" employees={[]} />
        </div>
      </div>

      {/* Dönem özeti */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-white dark:bg-gray-800 border rounded-xl p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400">Aktif Çalışan</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{aktifler.length}</div>
        </div>
        <div className={`rounded-xl p-4 border ${odenenler === aktifler.length && aktifler.length > 0 ? 'bg-green-50 border-green-200' : 'bg-orange-50 border-orange-200'}`}>
          <div className={`text-xs ${odenenler === aktifler.length && aktifler.length > 0 ? 'text-green-600' : 'text-orange-600'}`}>Ödeme Durumu</div>
          <div className={`text-2xl font-bold ${odenenler === aktifler.length && aktifler.length > 0 ? 'text-green-700' : 'text-orange-700'}`}>{odenenler}/{aktifler.length}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 border rounded-xl p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400">Toplam Net Maaş</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(toplamNet)}</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="text-xs text-red-600">Toplam Personel Maliyeti</div>
          <div className="text-2xl font-bold text-red-700">{formatCurrency(toplamMaliyet)}</div>
          <div className="text-xs text-red-400 mt-0.5">SGK işveren: {formatCurrency(toplamSGK)}</div>
        </div>
      </div>

      {/* Çalışan listesi */}
      <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50 dark:bg-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Çalışanlar — {MONTHS_TR[month - 1]} {year} Ödemeleri</h3>
        </div>
        {(employees ?? []).length === 0 ? (
          <div className="px-4 py-12 text-center text-gray-400 dark:text-gray-500 text-sm">
            Henüz çalışan eklenmemiş.
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Çalışan</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Ünvan</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Brüt</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">SGK İşçi</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Gelir Verg.</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Net</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">SGK İşveren</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Durum</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {(employees ?? []).map(emp => {
                const payment = paymentMap.get(emp.id)
                const isPaid = !!payment
                return (
                  <tr key={emp.id} className={`hover:bg-gray-50 ${emp.status !== 'aktif' ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <Link href={`/cari-hesap/maaslar/${emp.id}`}
                        className="text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-[#C8102E] hover:underline">
                        {emp.full_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{emp.title ?? '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 text-right font-medium">
                      {formatCurrency(payment?.gross_amount ?? emp.gross_salary)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-right">
                      {formatCurrency(payment?.sgk_employee ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-right">
                      {formatCurrency(payment?.income_tax ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-gray-900 dark:text-gray-100 text-right">
                      {formatCurrency(payment?.net_amount ?? emp.gross_salary)}
                    </td>
                    <td className="px-4 py-3 text-sm text-red-600 text-right font-medium">
                      {formatCurrency(payment?.sgk_employer ?? 0)}
                    </td>
                    <td className="px-4 py-3">
                      {isPaid ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                          Ödendi
                        </span>
                      ) : emp.status === 'aktif' ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200">
                          Bekliyor
                        </span>
                      ) : (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                          {emp.status === 'izinli' ? 'İzinli' : 'Ayrıldı'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!isPaid && emp.status === 'aktif' ? (
                        <MaaslarClient mode="pay-button" employee={emp} year={year} month={month} employees={[]} />
                      ) : isPaid ? (
                        <Link href={`/cari-hesap/maaslar/${emp.id}`}
                          className="text-xs text-gray-400 dark:text-gray-500 hover:text-[#C8102E]">
                          Detay →
                        </Link>
                      ) : null}
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
