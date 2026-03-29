import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function CustomersPage() {
  const supabase = await createClient()
  const { data: customers } = await supabase
    .from('customers')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Üst bar */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#C8102E] rounded-lg flex items-center justify-center text-white font-bold text-sm">K</div>
          <h1 className="text-lg font-bold text-gray-900">Müşteri Yönetimi</h1>
        </div>
        <Link href="/customers/new"
          className="bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26] transition-colors">
          + Yeni Müşteri
        </Link>
      </div>

      <div className="p-6">
        {/* İstatistik kartları */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white border rounded-lg p-4">
            <div className="text-sm text-gray-500">Toplam Müşteri</div>
            <div className="text-2xl font-bold text-gray-900">{customers?.length ?? 0}</div>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <div className="text-sm text-gray-500">Aktif</div>
            <div className="text-2xl font-bold text-green-600">{customers?.length ?? 0}</div>
          </div>
          <div className="bg-white border rounded-lg p-4">
            <div className="text-sm text-gray-500">Bu Ay Eklenen</div>
            <div className="text-2xl font-bold text-[#C8102E]">
              {customers?.filter(c => new Date(c.created_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length ?? 0}
            </div>
          </div>
        </div>

        {/* Müşteri tablosu */}
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Müşteri Adı</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Tür</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Telefon</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">E-posta</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Adres</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {customers && customers.length > 0 ? (
                customers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{customer.full_name}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                        customer.type === 'company'
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {customer.type === 'company' ? 'Firma' : 'Bireysel'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{customer.phone ?? '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{customer.email ?? '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{customer.address ?? '-'}</td>
                    <td className="px-4 py-3">
                      <Link href={`/customers/${customer.id}`}
                        className="text-[#C8102E] text-sm font-medium hover:underline">
                        Detay →
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                    Henüz müşteri eklenmemiş.{' '}
                    <Link href="/customers/new" className="text-[#C8102E] hover:underline">
                      İlk müşteriyi ekle →
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
