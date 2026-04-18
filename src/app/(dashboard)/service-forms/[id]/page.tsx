import DeleteButton from './DeleteButton'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export default async function ServiceFormDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: form } = await supabase
    .from('service_forms')
    .select('*, customers(full_name, phone, address, tax_number)')
    .eq('id', id)
    .single()

  if (!form) notFound()

  const { data: items } = await supabase
    .from('service_form_items')
    .select('*')
    .eq('service_form_id', id)

  const customer = form.customers as any
  const totalDevices = items?.reduce((s: number, i: any) => s + i.quantity, 0) ?? 0
  const saglam = items?.filter((i: any) =>
    i.body_status === 'SAĞLAM' && i.valve_status === 'SAĞLAM' &&
    i.hose_status === 'SAĞLAM' && i.gauge_status === 'SAĞLAM'
  ).reduce((s: number, i: any) => s + (i.quantity ?? 1), 0) ?? 0
  const hasarli = items?.filter((i: any) =>
    [i.body_status, i.valve_status, i.hose_status, i.gauge_status].includes('HASARLI')
  ).reduce((s: number, i: any) => s + (i.quantity ?? 1), 0) ?? 0
  const controlLabels: Record<number, string> = { 1: '1. Kontrol', 2: '2. Kontrol', 3: '3. Kontrol' }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#C8102E] rounded-lg flex items-center justify-center text-white font-bold text-sm">K</div>
          <Link href="/service-forms" className="text-gray-500 text-sm hover:text-gray-700">← Servis Formları</Link>
          <span className="text-gray-300">/</span>
          <h1 className="text-lg font-bold text-gray-900">{form.form_number}</h1>
          {form.control_number && (
            <span className="bg-[#C8102E] text-white text-xs px-2 py-0.5 rounded-full font-medium">
              {controlLabels[form.control_number] ?? 'Dolum/Genel'}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Link href={`/service-forms/${id}/edit`}
            className="border border-gray-300 text-gray-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
            ✏️ Düzenle
          </Link>
          <DeleteButton formId={id} />
          <Link href={`/service-forms/${id}/pdf-bakim`}
            className="border border-[#C8102E] text-[#C8102E] px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors">
            📄 Bakım PDF
          </Link>
          <Link href={`/service-forms/${id}/pdf-takip`}
            className="bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26] transition-colors">
            📋 Takip PDF
          </Link>
        </div>
      </div>

      <div className="p-6 max-w-4xl mx-auto space-y-5">
        <div className="bg-white border rounded-lg p-5">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-gray-400 mb-1">Müşteri</div>
              <div className="text-sm font-semibold text-gray-900">{customer?.full_name}</div>
              {customer?.phone && <div className="text-xs text-gray-500 mt-0.5">{customer.phone}</div>}
              {customer?.address && <div className="text-xs text-gray-500 mt-0.5">{customer.address}</div>}
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Teknisyen</div>
              <div className="text-sm font-medium text-gray-900">{form.technician_name ?? '-'}</div>
              <div className="text-xs text-gray-400 mt-1">Servis Tarihi</div>
              <div className="text-sm font-medium text-gray-900">{form.service_date}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Form No</div>
              <div className="text-sm font-mono font-bold text-[#C8102E]">{form.form_number}</div>
              <div className="text-xs text-gray-400 mt-1">Servis Türü</div>
              <div className="text-sm font-medium text-gray-900">
                {form.control_number ? controlLabels[form.control_number] : 'Dolum / Genel Bakım'}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div className="bg-white border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{totalDevices}</div>
            <div className="text-xs text-gray-500 mt-1">🧯 Toplam Cihaz</div>
          </div>
          <div className="bg-white border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{saglam}</div>
            <div className="text-xs text-gray-500 mt-1">✅ Tümü Sağlam</div>
          </div>
          <div className="bg-white border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{hasarli}</div>
            <div className="text-xs text-gray-500 mt-1">⚠️ Hasarlı Satır</div>
          </div>
          <div className="bg-white border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{items?.length ?? 0}</div>
            <div className="text-xs text-gray-500 mt-1">📋 Cihaz Tipi</div>
          </div>
        </div>

        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="px-5 py-3 bg-gray-50 border-b">
            <div className="text-sm font-semibold text-gray-900">
              Bakım / Kontrol Sonuçları ({items?.length ?? 0} satır, {totalDevices} cihaz)
            </div>
          </div>
          {items && items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">CİHAZ</th>
                    <th className="text-center px-4 py-2 text-xs font-semibold text-gray-500">ADET</th>
                    <th className="text-center px-4 py-2 text-xs font-semibold text-gray-500">GÖVDE</th>
                    <th className="text-center px-4 py-2 text-xs font-semibold text-gray-500">VANA</th>
                    <th className="text-center px-4 py-2 text-xs font-semibold text-gray-500">HORTUM</th>
                    <th className="text-center px-4 py-2 text-xs font-semibold text-gray-500">SAAT</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">NOT</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((item: any) => {
                    const allOk = item.body_status === 'SAĞLAM' && item.valve_status === 'SAĞLAM' &&
                      item.hose_status === 'SAĞLAM' && item.gauge_status === 'SAĞLAM'
                    return (
                      <tr key={item.id} className={`hover:bg-gray-50 ${!allOk ? 'bg-red-50' : ''}`}>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.device_name}</td>
                        <td className="px-4 py-3 text-sm text-center font-bold text-gray-700">{item.quantity}</td>
                        {(['body_status', 'valve_status', 'hose_status', 'gauge_status'] as const).map(field => (
                          <td key={field} className="px-4 py-3 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                              item[field] === 'SAĞLAM' ? 'bg-green-50 text-green-700 border border-green-200' :
                              item[field] === 'HASARLI' ? 'bg-red-50 text-red-700 border border-red-200' :
                              item[field] === 'DEĞİŞTİRİLDİ' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                              'bg-gray-50 text-gray-500 border border-gray-200'
                            }`}>
                              {item[field]}
                            </span>
                          </td>
                        ))}
                        <td className="px-4 py-3 text-sm text-gray-500">{item.notes ?? '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-4 py-10 text-center text-gray-400 text-sm">
              Bu forma henüz cihaz eklenmemiş.
            </div>
          )}
        </div>

        {(form.general_notes || form.customer_note || form.next_service_date) && (
          <div className="bg-white border rounded-lg p-5 space-y-3">
            {form.general_notes && (
              <div>
                <div className="text-xs text-gray-400 mb-1">Genel Notlar</div>
                <div className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{form.general_notes}</div>
              </div>
            )}
            {form.customer_note && (
              <div>
                <div className="text-xs text-gray-400 mb-1">Müşteriye Not</div>
                <div className="text-sm text-gray-700 bg-blue-50 border border-blue-100 rounded-lg p-3">{form.customer_note}</div>
              </div>
            )}
            {form.next_service_date && (
              <div>
                <div className="text-xs text-gray-400 mb-1">Sonraki Servis Tarihi</div>
                <div className="text-sm font-medium text-[#C8102E]">📅 {form.next_service_date}</div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-3 pb-6">
          <Link href={`/service-forms/${id}/pdf-bakim`}
            className="flex-1 border border-[#C8102E] text-[#C8102E] py-3 rounded-lg font-medium hover:bg-red-50 transition-colors text-center text-sm">
            📄 Bakım Formu PDF İndir
          </Link>
          <Link href={`/service-forms/${id}/pdf-takip`}
            className="flex-1 bg-[#C8102E] text-white py-3 rounded-lg font-medium hover:bg-[#a50d26] transition-colors text-center text-sm">
            📋 Müşteri Takip Formu PDF İndir
          </Link>
        </div>
      </div>
    </div>
  )
}