'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const STATUS_OPTIONS = ['SAĞLAM', 'HASARLI', 'DEĞİŞTİRİLDİ', 'YOK']

export default function EditServiceFormPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const supabase = createClient()
  const [id, setId] = useState('')
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    technician_name: '',
    service_date: '',
    control_number: '' as any,
    general_notes: '',
    customer_note: '',
    next_service_date: '',
  })
  const [items, setItems] = useState<any[]>([])
  const [customerName, setCustomerName] = useState('')

  useEffect(() => {
    async function load() {
      const { id: resolvedId } = await params
      setId(resolvedId)
      const { data: sf } = await supabase
        .from('service_forms')
        .select('*, customers(full_name)')
        .eq('id', resolvedId)
        .single()
      if (sf) {
        setCustomerName((sf.customers as any)?.full_name ?? '')
        setForm({
          technician_name: sf.technician_name ?? '',
          service_date: sf.service_date ?? '',
          control_number: sf.control_number ?? '',
          general_notes: sf.general_notes ?? '',
          customer_note: sf.customer_note ?? '',
          next_service_date: sf.next_service_date ?? '',
        })
      }
      const { data: its } = await supabase
        .from('service_form_items')
        .select('*')
        .eq('service_form_id', resolvedId)
        .order('created_at')
      setItems(its ?? [])
      setFetching(false)
    }
    load()
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  function updateItem(itemId: string, field: string, value: any) {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, [field]: value } : i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')

    const { error: formErr } = await supabase
      .from('service_forms')
      .update({
        technician_name: form.technician_name || null,
        service_date: form.service_date,
        control_number: form.control_number || null,
        general_notes: form.general_notes || null,
        customer_note: form.customer_note || null,
        next_service_date: form.next_service_date || null,
      })
      .eq('id', id)

    if (formErr) { setError('Hata: ' + formErr.message); setLoading(false); return }

    // Cihaz satırlarını güncelle
    for (const item of items) {
      await supabase.from('service_form_items').update({
        device_name: item.device_name,
        quantity: item.quantity,
        body_status: item.body_status,
        valve_status: item.valve_status,
        hose_status: item.hose_status,
        gauge_status: item.gauge_status,
        notes: item.notes,
      }).eq('id', item.id)
    }

    router.push(`/service-forms/${id}`)
  }

  if (fetching) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-400 text-sm">Yükleniyor...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4 flex items-center gap-3 sticky top-0 z-10">
        <div className="w-8 h-8 bg-[#C8102E] rounded-lg flex items-center justify-center text-white font-bold text-sm">K</div>
        <Link href={`/service-forms/${id}`} className="text-gray-500 text-sm hover:text-gray-700">← Forma Dön</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-lg font-bold text-gray-900">Servis Formu Düzenle</h1>
        <span className="text-sm text-gray-400 ml-2">— {customerName}</span>
      </div>

      <form onSubmit={handleSubmit} className="p-4 max-w-4xl mx-auto space-y-4">

        {/* Form bilgileri */}
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm font-semibold text-gray-700 mb-3">Form Bilgileri</div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Teknisyen</label>
              <input name="technician_name" value={form.technician_name} onChange={handleChange}
                placeholder="Ad Soyad"
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Servis Tarihi</label>
              <input type="date" name="service_date" value={form.service_date} onChange={handleChange}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Servis Türü</label>
              <select name="control_number" value={form.control_number} onChange={handleChange}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
                <option value="">Dolum / Genel</option>
                <option value="1">1. Kontrol</option>
                <option value="2">2. Kontrol</option>
                <option value="3">3. Kontrol</option>
              </select>
            </div>
          </div>
        </div>

        {/* Cihaz satırları */}
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b">
            <div className="text-sm font-semibold text-gray-700">Bakım / Kontrol Sonuçları</div>
          </div>
          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 border-b text-xs font-semibold text-gray-500">
            <div className="col-span-3">CİHAZ</div>
            <div className="col-span-1 text-center">ADET</div>
            <div className="col-span-1 text-center">GÖVDE</div>
            <div className="col-span-1 text-center">VANA</div>
            <div className="col-span-1 text-center">HORTUM</div>
            <div className="col-span-1 text-center">SAAT</div>
            <div className="col-span-4">NOT</div>
          </div>
          <div className="divide-y">
            {items.map(item => (
              <div key={item.id} className="grid grid-cols-12 gap-2 px-4 py-2 items-center">
                <div className="col-span-3">
                  <input value={item.device_name} onChange={e => updateItem(item.id, 'device_name', e.target.value)}
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />
                </div>
                <div className="col-span-1">
                  <input type="number" min="1" value={item.quantity}
                    onChange={e => updateItem(item.id, 'quantity', parseInt(e.target.value) || 1)}
                    className="w-full border rounded px-2 py-1.5 text-sm text-center font-bold focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />
                </div>
                {(['body_status', 'valve_status', 'hose_status', 'gauge_status'] as const).map(field => (
                  <div key={field} className="col-span-1">
                    <select value={item[field]} onChange={e => updateItem(item.id, field, e.target.value)}
                      className={`w-full border rounded px-1 py-1.5 text-xs focus:outline-none ${
                        item[field] === 'SAĞLAM' ? 'bg-green-50 text-green-700 border-green-200' :
                        item[field] === 'HASARLI' ? 'bg-red-50 text-red-700 border-red-200' :
                        'bg-yellow-50 text-yellow-700 border-yellow-200'
                      }`}>
                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                ))}
                <div className="col-span-4">
                  <input value={item.notes ?? ''} onChange={e => updateItem(item.id, 'notes', e.target.value)}
                    placeholder="Not..."
                    className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Notlar */}
        <div className="bg-white border rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Genel Notlar</label>
              <textarea name="general_notes" value={form.general_notes} onChange={handleChange} rows={2}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Müşteriye Not</label>
              <textarea name="customer_note" value={form.customer_note} onChange={handleChange} rows={2}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Sonraki Servis Tarihi</label>
            <input type="date" name="next_service_date" value={form.next_service_date} onChange={handleChange}
              className="mt-1 w-48 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
          </div>
        </div>

        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</div>}

        <div className="flex gap-3 pb-6">
          <button type="submit" disabled={loading}
            className="flex-1 bg-[#C8102E] text-white py-3 rounded-lg font-semibold hover:bg-[#a50d26] disabled:opacity-50 transition-colors">
            {loading ? 'Kaydediliyor...' : '💾 Güncelle'}
          </button>
          <Link href={`/service-forms/${id}`}
            className="px-8 py-3 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors text-center">
            İptal
          </Link>
        </div>
      </form>
    </div>
  )
}