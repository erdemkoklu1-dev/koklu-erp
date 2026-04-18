'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const STATUS_OPTIONS = ['SAĞLAM', 'HASARLI', 'DEĞİŞTİRİLDİ', 'YOK']

type FormItem = {
  id: string
  device_name: string
  serial_number: string
  quantity: number
  body_status: string
  valve_status: string
  hose_status: string
  gauge_status: string
  notes: string
}

type FormData = {
  technician_name: string
  service_date: string
  control_number: any
  general_notes: string
  customer_note: string
  next_service_date: string
}

function newItem(): FormItem {
  return {
    id: 'new-' + Math.random().toString(36).slice(2),
    device_name: '',
    serial_number: '',
    quantity: 1,
    body_status: 'SAĞLAM',
    valve_status: 'SAĞLAM',
    hose_status: 'SAĞLAM',
    gauge_status: 'SAĞLAM',
    notes: '',
  }
}

interface Props {
  id: string
  initialForm: FormData
  initialItems: FormItem[]
  customerName: string
}

export default function EditServiceFormClient({ id, initialForm, initialItems, customerName }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState<FormData>(initialForm)
  const [items, setItems] = useState<FormItem[]>(initialItems)

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  function updateItem(itemId: string, field: keyof FormItem, value: any) {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, [field]: value } : i))
  }

  function removeItem(itemId: string) {
    setItems(prev => prev.filter(i => i.id !== itemId))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    // 1. Form başlığını güncelle
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

    if (formErr) {
      setError('Form güncellenemedi: ' + formErr.message)
      setLoading(false)
      return
    }

    // 2. Mevcut tüm satırları sil, yeniden yaz
    const { error: delErr } = await supabase
      .from('service_form_items')
      .delete()
      .eq('service_form_id', id)

    if (delErr) {
      setError('Satırlar temizlenemedi: ' + delErr.message)
      setLoading(false)
      return
    }

    if (items.length > 0) {
      const { error: insErr } = await supabase
        .from('service_form_items')
        .insert(
          items.map(i => ({
            service_form_id: id,
            device_name: i.device_name,
            serial_number: i.serial_number || null,
            quantity: i.quantity,
            body_status: i.body_status,
            valve_status: i.valve_status,
            hose_status: i.hose_status,
            gauge_status: i.gauge_status,
            notes: i.notes || null,
          }))
        )
      if (insErr) {
        setError('Satırlar kaydedilemedi: ' + insErr.message)
        setLoading(false)
        return
      }
    }

    router.push(`/service-forms/${id}`)
    router.refresh()
  }

  const totalDevices = items.reduce((s, i) => s + i.quantity, 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4 flex items-center gap-3 sticky top-0 z-10">
        <Link href={`/service-forms/${id}`} className="text-gray-500 text-sm hover:text-gray-700">
          ← Forma Dön
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-lg font-bold text-gray-900">Servis Formu Düzenle</h1>
        {customerName && (
          <span className="text-sm text-gray-400 ml-1">— {customerName}</span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-4 max-w-5xl mx-auto space-y-4">

        {/* Form bilgileri */}
        <div className="bg-white border rounded-lg p-4">
          <div className="text-sm font-semibold text-gray-700 mb-3">Form Bilgileri</div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Teknisyen</label>
              <input
                name="technician_name"
                value={form.technician_name}
                onChange={handleChange}
                placeholder="Ad Soyad"
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Servis Tarihi</label>
              <input
                type="date"
                name="service_date"
                value={form.service_date}
                onChange={handleChange}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Servis Türü</label>
              <select
                name="control_number"
                value={form.control_number}
                onChange={handleChange}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
              >
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
          <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-700">
              Bakım / Kontrol Sonuçları
              {items.length > 0 && (
                <span className="ml-2 text-gray-400 font-normal text-xs">
                  {items.length} satır · {totalDevices} cihaz
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => setItems(prev => [...prev, newItem()])}
              className="text-sm bg-[#C8102E] text-white px-3 py-1.5 rounded-lg hover:bg-[#a50d26] transition-colors"
            >
              + Satır Ekle
            </button>
          </div>

          {items.length === 0 ? (
            <div className="px-4 py-10 text-center space-y-3">
              <p className="text-gray-400 text-sm">Bu formda henüz cihaz satırı yok.</p>
              <button
                type="button"
                onClick={() => setItems([newItem()])}
                className="text-sm text-[#C8102E] border border-[#C8102E] px-4 py-2 rounded-lg hover:bg-red-50 transition-colors"
              >
                + İlk Satırı Ekle
              </button>
            </div>
          ) : (
            <>
              {/* Başlık satırı */}
              <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase">
                <div className="col-span-3">Cihaz</div>
                <div className="col-span-1 text-center">Adet</div>
                <div className="col-span-2 text-center">Gövde</div>
                <div className="col-span-2 text-center">Vana</div>
                <div className="col-span-2 text-center">Hortum</div>
                <div className="col-span-1 text-center">Saat</div>
                <div className="col-span-1" />
              </div>

              <div className="divide-y">
                {items.map(item => (
                  <div key={item.id} className="px-4 py-2.5 space-y-2">
                    <div className="grid grid-cols-12 gap-2 items-center">
                      {/* Cihaz adı */}
                      <div className="col-span-3">
                        <input
                          value={item.device_name}
                          onChange={e => updateItem(item.id, 'device_name', e.target.value)}
                          placeholder="Cihaz adı..."
                          className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                        />
                      </div>

                      {/* Adet */}
                      <div className="col-span-1">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={e => updateItem(item.id, 'quantity', parseInt(e.target.value) || 1)}
                          className="w-full border rounded px-2 py-1.5 text-sm text-center font-bold focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                        />
                      </div>

                      {/* Durum seçiciler: gövde, vana, hortum, saat */}
                      {(
                        [
                          { field: 'body_status' as const,  span: 'col-span-2' },
                          { field: 'valve_status' as const, span: 'col-span-2' },
                          { field: 'hose_status' as const,  span: 'col-span-2' },
                          { field: 'gauge_status' as const, span: 'col-span-1' },
                        ]
                      ).map(({ field, span }) => (
                        <div key={field} className={span}>
                          <select
                            value={item[field]}
                            onChange={e => updateItem(item.id, field, e.target.value)}
                            className={`w-full border rounded px-1 py-1.5 text-xs focus:outline-none ${
                              item[field] === 'SAĞLAM'
                                ? 'bg-green-50 text-green-700 border-green-200'
                                : item[field] === 'HASARLI'
                                ? 'bg-red-50 text-red-700 border-red-200'
                                : item[field] === 'DEĞİŞTİRİLDİ'
                                ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                                : 'bg-gray-50 text-gray-500 border-gray-200'
                            }`}
                          >
                            {STATUS_OPTIONS.map(s => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </div>
                      ))}

                      {/* Sil */}
                      <div className="col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          className="text-red-400 hover:text-red-600 text-xl font-bold leading-none"
                          title="Satırı sil"
                        >
                          ×
                        </button>
                      </div>
                    </div>

                    {/* Not satırı */}
                    <input
                      value={item.notes}
                      onChange={e => updateItem(item.id, 'notes', e.target.value)}
                      placeholder="Not (isteğe bağlı)..."
                      className="w-full border rounded px-2 py-1.5 text-xs text-gray-600 bg-gray-50 focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                    />
                  </div>
                ))}
              </div>

              <div className="px-4 py-2.5 bg-gray-50 border-t flex items-center justify-between text-sm">
                <span className="text-gray-500">
                  Toplam: <span className="font-bold text-gray-900">{totalDevices}</span> cihaz
                </span>
                <button
                  type="button"
                  onClick={() => setItems(prev => [...prev, newItem()])}
                  className="text-xs text-[#C8102E] font-medium hover:underline"
                >
                  + Satır Ekle
                </button>
              </div>
            </>
          )}
        </div>

        {/* Notlar + sonraki servis */}
        <div className="bg-white border rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Genel Notlar</label>
              <textarea
                name="general_notes"
                value={form.general_notes}
                onChange={handleChange}
                rows={2}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Müşteriye Not</label>
              <textarea
                name="customer_note"
                value={form.customer_note}
                onChange={handleChange}
                rows={2}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Sonraki Servis Tarihi</label>
            <input
              type="date"
              name="next_service_date"
              value={form.next_service_date}
              onChange={handleChange}
              className="mt-1 w-48 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
            />
          </div>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        <div className="flex gap-3 pb-6">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-[#C8102E] text-white py-3 rounded-lg font-semibold hover:bg-[#a50d26] disabled:opacity-50 transition-colors"
          >
            {loading ? 'Kaydediliyor...' : '💾 Güncelle'}
          </button>
          <Link
            href={`/service-forms/${id}`}
            className="px-8 py-3 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors text-center"
          >
            İptal
          </Link>
        </div>
      </form>
    </div>
  )
}
