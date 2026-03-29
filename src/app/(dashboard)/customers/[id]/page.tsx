import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: customer } = await supabase
    .from('customers').select('*').eq('id', id).single()
  if (!customer) notFound()

  const { data: devices } = await supabase
    .from('devices')
    .select('*, device_types(name)')
    .eq('customer_id', id)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  function statusColor(expiry: string | null) {
    if (!expiry) return 'gray'
    const days = Math.floor((new Date(expiry).getTime() - Date.now()) / 86400000)
    if (days < 0) return 'red'
    if (days < 90) return 'orange'
    return 'green'
  }

  function statusLabel(expiry: string | null) {
    if (!expiry) return '-'
    const days = Math.floor((new Date(expiry).getTime() - Date.now()) / 86400000)
    if (days < 0) return '⚠️ Süresi Dolmuş'
    if (days < 90) return `⚡ ${days} gün kaldı`
    return `✅ ${days} gün`
  }

  const colorMap: Record<string, string> = {
    red: 'bg-red-50 text-red-700 border-red-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    gray: 'bg-gray-50 text-gray-600 border-gray-200',
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Üst bar */}
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#C8102E] rounded-lg flex items-center justify-center text-white font-bold text-sm">K</div>
          <Link href="/customers" className="text-gray-500 hover:text-gray-700 text-sm">← Müşteriler</Link>
          <span className="text-gray-300">/</span>
          <h1 className="text-lg font-bold text-gray-900">{customer.full_name}</h1>
        </div>
        <Link href={`/customers/${id}/edit`}
  className="border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50 transition-colors">
  ✏️ Düzenle
</Link>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${customer.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {customer.is_active ? 'Aktif' : 'Pasif'}
        </span>
      </div>

      <div className="p-6 max-w-5xl mx-auto space-y-5">

        {/* Bilgi kartı */}
        <div className="bg-white border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3 pb-2 border-b">Genel Bilgiler</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-gray-400 mb-1">Müşteri Türü</div>
              <div className="text-sm font-medium">{customer.type === 'company' ? 'Firma' : 'Bireysel'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Vergi / TC No</div>
              <div className="text-sm font-medium">{customer.tax_number ?? '-'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Telefon</div>
              <div className="text-sm font-medium">{customer.phone ?? '-'}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">E-posta</div>
              <div className="text-sm font-medium">{customer.email ?? '-'}</div>
            </div>
            <div className="col-span-2">
              <div className="text-xs text-gray-400 mb-1">Adres</div>
              <div className="text-sm font-medium">{customer.address ?? '-'}</div>
            </div>
          </div>
        </div>

        {/* İstatistik kartları */}
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-white border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{devices?.length ?? 0}</div>
            <div className="text-xs text-gray-500 mt-1">🧯 Toplam Cihaz</div>
          </div>
          <div className="bg-white border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-red-600">
              {devices?.filter(d => d.expiry_date && Math.floor((new Date(d.expiry_date).getTime() - Date.now()) / 86400000) < 0).length ?? 0}
            </div>
            <div className="text-xs text-gray-500 mt-1">⚠️ SKT Dolmuş</div>
          </div>
          <div className="bg-white border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-orange-500">
              {devices?.filter(d => {
                const days = d.expiry_date ? Math.floor((new Date(d.expiry_date).getTime() - Date.now()) / 86400000) : 999
                return days >= 0 && days < 90
              }).length ?? 0}
            </div>
            <div className="text-xs text-gray-500 mt-1">⚡ 90 Gün İçinde</div>
          </div>
          <div className="bg-white border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-green-600">
              {devices?.filter(d => d.expiry_date && Math.floor((new Date(d.expiry_date).getTime() - Date.now()) / 86400000) >= 90).length ?? 0}
            </div>
            <div className="text-xs text-gray-500 mt-1">✅ Geçerli</div>
          </div>
        </div>

        {/* Cihazlar tablosu */}
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b flex items-center justify-between bg-gray-50">
            <h2 className="text-sm font-semibold text-gray-900">Cihazlar ({devices?.length ?? 0})</h2>
            <Link href={`/devices/new?customer_id=${id}`}
              className="bg-[#C8102E] text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#a50d26] transition-colors">
              + Cihaz Ekle
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Cihaz</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Marka</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Kap.</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Dolum</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">1.Kontrol</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">2.Kontrol</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">3.Kontrol</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">SKT</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Durum</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Konum</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {devices && devices.length > 0 ? devices.map((device) => (
                  <tr key={device.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 text-sm font-medium text-gray-900">
                      {device.custom_device_name ?? device.device_types?.name ?? '-'}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-gray-600">{device.brand ?? '-'}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-600">{device.capacity ? `${device.capacity} kg` : '-'}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-600">{device.last_fill_date ?? '-'}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-600">{device.control1_date ?? '-'}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-600">{device.control2_date ?? '-'}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-600">{device.control3_date ?? '-'}</td>
                    <td className="px-4 py-2.5 text-sm text-gray-600">{device.expiry_date ?? '-'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${colorMap[statusColor(device.expiry_date)]}`}>
                        {statusLabel(device.expiry_date)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-sm text-gray-500">{device.location_detail ?? '-'}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-gray-400 text-sm">
                      Henüz cihaz eklenmemiş.{' '}
                      <Link href={`/devices/new?customer_id=${id}`} className="text-[#C8102E] hover:underline">Cihaz ekle →</Link>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Son servisler */}
        <div className="bg-white border rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-900">Son Servisler</h2>
            <button className="border border-[#C8102E] text-[#C8102E] px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-red-50 transition-colors">
              + Servis Formu
            </button>
          </div>
          <div className="text-center py-6 text-gray-400 text-sm">
            Bu müşteriye ait servis kaydı bulunmuyor.
          </div>
        </div>

      </div>
    </div>
  )
}