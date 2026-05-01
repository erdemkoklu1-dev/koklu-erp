import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { formatCurrency } from '@/lib/finance/formatters'
import SabitGiderlerClient from './SabitGiderlerClient'

export default async function SabitGiderlerPage() {
  const supabase = createServiceClient()

  const [{ data: expenses }, { data: categories }] = await Promise.all([
    supabase.from('fixed_expenses')
      .select('*, expense_categories(name)')
      .eq('is_active', true)
      .order('day_of_month'),
    supabase.from('expense_categories')
      .select('id, name').eq('direction', 'gider').eq('is_active', true).order('sort_order'),
  ])

  const PERIOD_LABELS: Record<string, string> = {
    aylik: 'Aylık', ucaylik: '3 Aylık', altiaylik: '6 Aylık', yillik: 'Yıllık',
  }

  // Aylık toplam maliyet hesabı
  const monthlyTotal = (expenses ?? []).reduce((s, e) => {
    const mult = { aylik: 1, ucaylik: 1 / 3, altiaylik: 1 / 6, yillik: 1 / 12 }[e.period as string] ?? 1
    return s + (e.amount ?? 0) * mult
  }, 0)

  return (
    <div className="p-6 space-y-4">

      {/* Üst bar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Sabit Giderler</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Abonelik ve periyodik ödemelerinizi buradan yönetin</p>
        </div>
        <SabitGiderlerClient categories={categories ?? []} mode="add-button" />
      </div>

      {/* Özet */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-gray-800 border rounded-xl p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400">Aktif Gider</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{expenses?.length ?? 0}</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="text-xs text-red-600">Aylık Toplam Maliyet</div>
          <div className="text-2xl font-bold text-red-700">{formatCurrency(monthlyTotal)}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 border rounded-xl p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400">Yıllık Toplam Maliyet</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatCurrency(monthlyTotal * 12)}</div>
        </div>
      </div>

      {/* Liste */}
      <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
        {(expenses ?? []).length === 0 ? (
          <div className="px-4 py-12 text-center text-gray-400 dark:text-gray-500 text-sm">
            Henüz sabit gider eklenmemiş.
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Gider Adı</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Kategori</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Periyot</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Her Ayın</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Tutar</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">KDV</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Aylık Karş.</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {(expenses ?? []).map(e => {
                const cat = e.expense_categories as any
                const mult = { aylik: 1, ucaylik: 1 / 3, altiaylik: 1 / 6, yillik: 1 / 12 }[e.period as string] ?? 1
                const monthly = (e.amount ?? 0) * mult
                const kdvAmount = (e.amount ?? 0) * ((e.kdv_rate ?? 0) / 100)
                return (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{e.name}</div>
                      {e.notes && <div className="text-xs text-gray-400 dark:text-gray-500">{e.notes}</div>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{cat?.name ?? '-'}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                        {PERIOD_LABELS[e.period] ?? e.period}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{e.day_of_month}. günü</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 text-right">{formatCurrency(e.amount)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 text-right">
                      {e.kdv_rate > 0 ? `%${e.kdv_rate} (${formatCurrency(kdvAmount)})` : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-red-600 text-right">{formatCurrency(monthly)}</td>
                    <td className="px-4 py-3 text-right">
                      <SabitGiderlerClient expense={e} categories={categories ?? []} mode="edit-button" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t bg-gray-50 dark:bg-gray-700">
              <tr>
                <td colSpan={6} className="px-4 py-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Aylık Toplam</td>
                <td className="px-4 py-3 text-sm font-bold text-red-700 text-right">{formatCurrency(monthlyTotal)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}
