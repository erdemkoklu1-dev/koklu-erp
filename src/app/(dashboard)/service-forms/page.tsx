import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { formatTRDate } from '@/lib/finance/formatters'
import PrintButton from '@/components/PrintButton'
import { applyTenantScope, getCurrentTenantAccessFromSession } from '@/lib/auth/tenant-scope'

export default async function ServiceFormsPage() {
  const supabase = await createClient()
  const tenantAccess = await getCurrentTenantAccessFromSession()

  let formsQuery = supabase
    .from('service_forms')
    .select('*, customers(full_name)')
    .order('created_at', { ascending: false })
  formsQuery = applyTenantScope(formsQuery, tenantAccess)
  const { data: forms } = await formsQuery

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-700">
      {/* Print header */}
      <div className="print-header hidden">
        <div>KÖKLÜ YANGIN SÖNDÜRME CİHAZLARI</div>
        <div style={{ fontWeight: 'normal', fontSize: '12px', marginTop: '4px' }}>Servis Formları Listesi · {new Date().toLocaleString('tr-TR')}</div>
      </div>

      <div className="bg-white dark:bg-gray-800 border-b px-6 py-4 flex items-center justify-between no-print">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#C8102E] rounded-lg flex items-center justify-center text-white font-bold text-sm">K</div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Servis Formları</h1>
        </div>
        <div className="flex items-center gap-2">
          <PrintButton />
          <Link href="/service-forms/new"
            className="bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26] transition-colors">
            + Yeni Servis Formu
          </Link>
        </div>
      </div>

      <div className="p-6 max-w-5xl mx-auto">
        <div className="bg-white dark:bg-gray-800 border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">FORM NO</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">MÜŞTERİ</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">TEKNİSYEN</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">TARİH</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">DURUM</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">İŞLEM</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {forms && forms.length > 0 ? forms.map((form) => (
                <tr key={form.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono font-medium text-[#C8102E]">{form.form_number}</td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">{(form.customers as any)?.full_name ?? '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{form.technician_name ?? '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{formatTRDate(form.service_date)}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                      Tamamlandı
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/service-forms/${form.id}`} className="text-[#C8102E] text-sm font-medium hover:underline">
                      Detay →
                    </Link>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500 text-sm">
                    Henüz servis formu oluşturulmamış.{' '}
                    <Link href="/service-forms/new" className="text-[#C8102E] hover:underline">
                      İlk formu oluştur →
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
