'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { TURKEY_PROVINCES } from '@/lib/turkey-provinces'
import SubeSelect from '@/components/SubeSelect'

type DeviceRow = {
  id?: string
  custom_device_name: string
  brand: string
  capacity: string
  quantity: number
  serial_number: string
  invoice_date: string
  last_fill_date: string
  expiry_date: string
  control1_date: string
  control2_date: string
  control3_date: string
  location_detail: string
  _deleted?: boolean
}

function addYears(dateStr: string | null, years: number): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    d.setFullYear(d.getFullYear() + years)
    return d.toISOString().split('T')[0]
  } catch { return '' }
}

function addMonths(dateStr: string | null, months: number): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    d.setMonth(d.getMonth() + months)
    return d.toISOString().split('T')[0]
  } catch { return '' }
}

function calcControlDates(invoiceDate: string, expiryDate: string): [string, string, string] {
  if (!invoiceDate || !expiryDate) return ['', '', '']
  const diffYears = (new Date(expiryDate).getTime() - new Date(invoiceDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  if (diffYears >= 3.5) {
    return [addYears(invoiceDate, 1), addYears(invoiceDate, 2), addYears(invoiceDate, 3)]
  }
  return [addMonths(invoiceDate, 6), addMonths(invoiceDate, 12), addMonths(invoiceDate, 18)]
}

function emptyDevice(): DeviceRow {
  return {
    custom_device_name: '', brand: '', capacity: '', quantity: 1, serial_number: '',
    invoice_date: '', last_fill_date: '', expiry_date: '',
    control1_date: '', control2_date: '', control3_date: '', location_detail: '',
  }
}

export default function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const supabase = createClient()
  const [id, setId] = useState('')
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState('')
  const [subeId, setSubeId] = useState<string | null>(null)
  const [form, setForm] = useState({
    full_name: '', type: 'company', tax_number: '',
    authorized_person: '', authorized_phone: '', phone: '', email: '', address: '', il: '', notes: '',
    iban: '', bank_name: '',
  })
  const [devices, setDevices] = useState<DeviceRow[]>([])

  useEffect(() => {
    async function load() {
      const { id: resolvedId } = await params
      setId(resolvedId)
      const res = await fetch(`/api/customers/${resolvedId}?record=1`)
      const record = await res.json()
      if (!res.ok || !record?.customer) {
        setError(record?.error ?? 'Müşteri bulunamadı veya bu kayda erişim yetkiniz yok.')
        setFetching(false)
        return
      }
      const customer = record.customer
      if (customer) {
        setForm({
          full_name: customer.full_name ?? '',
          type: customer.type ?? 'company',
          tax_number: customer.tax_number ?? '',
          authorized_person: customer.authorized_person ?? '',
          authorized_phone: customer.authorized_phone ?? '',
          phone: customer.phone ?? '',
          email: customer.email ?? '',
          address: customer.address ?? '',
          il: customer.il ?? '',
          notes: customer.notes ?? '',
          iban: customer.iban ?? '',
          bank_name: customer.bank_name ?? '',
        })
        setSubeId(customer.sube_id ?? null)
      }

      const devs = record.devices ?? []

      setDevices((devs ?? []).map((d: any) => ({
        id: d.id,
        custom_device_name: d.custom_device_name ?? '',
        brand: d.brand ?? '',
        capacity: d.capacity != null ? String(d.capacity) : '',
        quantity: d.quantity ?? 1,
        serial_number: d.serial_number ?? '',
        invoice_date: d.invoice_date ?? '',
        last_fill_date: d.last_fill_date ?? '',
        expiry_date: d.expiry_date ?? '',
        control1_date: d.control1_date ?? '',
        control2_date: d.control2_date ?? '',
        control3_date: d.control3_date ?? '',
        location_detail: d.location_detail ?? '',
      })))
      setFetching(false)
    }
    load()
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  function updateDevice(idx: number, field: keyof DeviceRow, value: any) {
    setDevices(prev => prev.map((d, i) => {
      if (i !== idx) return d
      const updated = { ...d, [field]: value }
      if (field === 'invoice_date') {
        updated.last_fill_date = value
        updated.expiry_date = addYears(value, 2)
        const [c1, c2, c3] = calcControlDates(value, updated.expiry_date)
        updated.control1_date = c1; updated.control2_date = c2; updated.control3_date = c3
      }
      if (field === 'expiry_date') {
        const [c1, c2, c3] = calcControlDates(updated.invoice_date, value)
        updated.control1_date = c1; updated.control2_date = c2; updated.control3_date = c3
      }
      return updated
    }))
  }

  function setWarranty4(idx: number) {
    setDevices(prev => prev.map((d, i) => {
      if (i !== idx) return d
      const expiry = addYears(d.invoice_date, 4)
      const [c1, c2, c3] = calcControlDates(d.invoice_date, expiry)
      return { ...d, expiry_date: expiry, control1_date: c1, control2_date: c2, control3_date: c3 }
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name.trim()) { setError('Müşteri adı zorunlu.'); return }
    setLoading(true); setError('')

    try {
      const { error: custErr } = await supabase.from('customers').update({
        ...form, sube_id: subeId || null, updated_at: new Date().toISOString()
      }).eq('id', id)
      if (custErr) throw new Error('Güncelleme hatası: ' + custErr.message)

      // Silinen cihazları pasif yap
      const deleted = devices.filter(d => d._deleted && d.id)
      for (const d of deleted) {
        await supabase.from('devices').update({ is_active: false }).eq('id', d.id!)
      }

      // Mevcut cihazları güncelle
      const updated = devices.filter(d => !d._deleted && d.id && d.custom_device_name.trim())
      for (const d of updated) {
        await supabase.from('devices').update({
          custom_device_name: d.custom_device_name,
          brand: d.brand || null,
          capacity: d.capacity ? parseFloat(d.capacity) || null : null,
          quantity: d.quantity || 1,
          serial_number: d.serial_number || null,
          invoice_date: d.invoice_date || null,
          last_fill_date: d.last_fill_date || null,
          expiry_date: d.expiry_date || null,
          control1_date: d.control1_date || null,
          control2_date: d.control2_date || null,
          control3_date: d.control3_date || null,
          location_detail: d.location_detail || null,
        }).eq('id', d.id!)
      }

      // Yeni cihazları ekle
      const newDevs = devices.filter(d => !d._deleted && !d.id && d.custom_device_name.trim())
      if (newDevs.length > 0) {
        const now = Date.now()
        const rows = newDevs.map((d, idx) => ({
          customer_id: id,
          custom_device_name: d.custom_device_name,
          brand: d.brand || null,
          capacity: d.capacity ? parseFloat(d.capacity) || null : null,
          quantity: d.quantity || 1,
          serial_number: d.serial_number || null,
          invoice_date: d.invoice_date || null,
          last_fill_date: d.last_fill_date || null,
          expiry_date: d.expiry_date || null,
          control1_date: d.control1_date || null,
          control2_date: d.control2_date || null,
          control3_date: d.control3_date || null,
          location_detail: d.location_detail || null,
          is_active: true,
          qr_code: `KOKLU-${id.slice(0, 8)}-${now}-${idx}`,
        }))
        const deviceRes = await fetch('/api/tenant-create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'devices', payload: rows }),
        })
        const deviceData = await deviceRes.json()
        if (!deviceRes.ok) throw new Error('Cihaz eklenemedi: ' + (deviceData?.error ?? `HTTP ${deviceRes.status}`))
      }

      router.push(`/customers/${id}`)
    } catch (e: any) {
      setError(e.message)
      setLoading(false)
    }
  }

  if (fetching) return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-700 flex items-center justify-center">
      <div className="text-gray-400 dark:text-gray-500 text-sm">Yükleniyor...</div>
    </div>
  )

  const activeDevices = devices.filter(d => !d._deleted)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-700">
      <div className="bg-white dark:bg-gray-800 border-b px-6 py-4 flex items-center gap-3 sticky top-0 z-10">
        <div className="w-8 h-8 bg-[#C8102E] rounded-lg flex items-center justify-center text-white font-bold text-sm">K</div>
        <Link href={`/customers/${id}`} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 text-sm">← Müşteri Detayı</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Müşteri Düzenle</h1>
      </div>

      <form onSubmit={handleSubmit} className="p-6 max-w-4xl mx-auto space-y-5">

        {/* Müşteri bilgileri */}
        <div className="bg-white dark:bg-gray-800 border rounded-lg p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Müşteri Bilgileri</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Müşteri Türü</label>
              <select name="type" value={form.type} onChange={handleChange}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
                <option value="company">Firma</option>
                <option value="individual">Bireysel</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {form.type === 'company' ? 'Firma Adı' : 'Ad Soyad'} <span className="text-red-500">*</span>
              </label>
              <input name="full_name" value={form.full_name} onChange={handleChange}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {form.type === 'company' ? 'Vergi Numarası' : 'TC Kimlik No'}
              </label>
              <input name="tax_number" value={form.tax_number} onChange={handleChange}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Telefon</label>
              <input name="phone" value={form.phone} onChange={handleChange}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Yetkili</label>
              <input name="authorized_person" value={form.authorized_person} onChange={handleChange}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Yetkili Telefonu</label>
              <input name="authorized_phone" value={form.authorized_phone} onChange={handleChange}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">E-posta</label>
              <input name="email" type="email" value={form.email} onChange={handleChange}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">İl</label>
              <select name="il" value={form.il} onChange={handleChange}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white dark:bg-gray-800">
                <option value="">— Seçiniz</option>
                {TURKEY_PROVINCES.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Adres</label>
              <input name="address" value={form.address} onChange={handleChange}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                placeholder="Mahalle, cadde, bina no..." />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Banka Adı</label>
              <input name="bank_name" value={form.bank_name} onChange={handleChange}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                placeholder="Ziraat Bankası" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">IBAN</label>
              <input name="iban" value={form.iban} onChange={handleChange}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                placeholder="TR00 0000 0000 0000 0000 0000 00" />
            </div>
            <div>
              <SubeSelect value={subeId} onChange={setSubeId} label="Şube" />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Notlar</label>
              <textarea name="notes" value={form.notes} onChange={handleChange} rows={2}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
          </div>
        </div>

        {/* Cihazlar */}
        <div className="bg-white dark:bg-gray-800 border rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b flex items-center justify-between bg-gray-50 dark:bg-gray-700">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Cihazlar ({activeDevices.length})</h2>
            <button type="button"
              onClick={() => setDevices(p => [...p, emptyDevice()])}
              className="text-sm bg-[#C8102E] text-white px-3 py-1.5 rounded-lg hover:bg-[#a50d26]">
              + Cihaz Ekle
            </button>
          </div>

          <div className="divide-y">
            {activeDevices.map((d, visIdx) => {
              let actualIdx = -1
              let count = 0
              for (let i = 0; i < devices.length; i++) {
                if (!devices[i]._deleted) {
                  if (count === visIdx) { actualIdx = i; break }
                  count++
                }
              }
              return (
                <div key={actualIdx} className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                      Cihaz {visIdx + 1}{!d.id && <span className="ml-1 text-green-600">(Yeni)</span>}
                    </span>
                    <div className="flex gap-2">
                      {d.invoice_date && (
                        <button type="button" onClick={() => setWarranty4(actualIdx)}
                          className="text-xs border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 px-2 py-1 rounded hover:bg-gray-50">
                          4 Yıl Garanti
                        </button>
                      )}
                      <button type="button"
                        onClick={() => setDevices(prev => prev.map((x, i) => i === actualIdx ? { ...x, _deleted: true } : x))}
                        className="text-xs text-red-400 hover:text-red-600">
                        Sil
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Cihaz Adı</label>
                      <input value={d.custom_device_name}
                        onChange={e => updateDevice(actualIdx, 'custom_device_name', e.target.value)}
                        placeholder="örn: Kuru Kimyevi Tozlu Yangın Söndürücü"
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Marka</label>
                      <input value={d.brand}
                        onChange={e => updateDevice(actualIdx, 'brand', e.target.value)}
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Kapasite</label>
                      <input value={d.capacity}
                        onChange={e => updateDevice(actualIdx, 'capacity', e.target.value)}
                        placeholder="örn: 6"
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Adet</label>
                      <input type="number" min="1" value={d.quantity}
                        onChange={e => updateDevice(actualIdx, 'quantity', parseInt(e.target.value) || 1)}
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Seri No</label>
                      <input value={d.serial_number}
                        onChange={e => updateDevice(actualIdx, 'serial_number', e.target.value)}
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Konum</label>
                      <input value={d.location_detail}
                        onChange={e => updateDevice(actualIdx, 'location_detail', e.target.value)}
                        placeholder="örn: Bodrum Kat"
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 pt-1 border-t">
                    <div>
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-300">Fatura / Dolum Tarihi</label>
                      <input type="date" value={d.invoice_date}
                        onChange={e => updateDevice(actualIdx, 'invoice_date', e.target.value)}
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-300">SKT</label>
                      <input type="date" value={d.expiry_date}
                        onChange={e => updateDevice(actualIdx, 'expiry_date', e.target.value)}
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-300">1. Kontrol</label>
                      <input type="date" value={d.control1_date}
                        onChange={e => updateDevice(actualIdx, 'control1_date', e.target.value)}
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-300">2. Kontrol</label>
                      <input type="date" value={d.control2_date}
                        onChange={e => updateDevice(actualIdx, 'control2_date', e.target.value)}
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-300">3. Kontrol</label>
                      <input type="date" value={d.control3_date}
                        onChange={e => updateDevice(actualIdx, 'control3_date', e.target.value)}
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                    </div>
                  </div>
                </div>
              )
            })}
            {activeDevices.length === 0 && (
              <div className="px-5 py-8 text-center text-gray-400 dark:text-gray-500 text-sm">
                Henüz cihaz yok. + Cihaz Ekle butonuna basın.
              </div>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-3 pb-6">
          <button type="submit" disabled={loading}
            className="flex-1 bg-[#C8102E] text-white py-3 rounded-lg font-semibold hover:bg-[#a50d26] disabled:opacity-50 transition-colors">
            {loading ? 'Kaydediliyor...' : '💾 Güncelle'}
          </button>
          <Link href={`/customers/${id}`}
            className="px-8 py-3 border rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 transition-colors text-center">
            İptal
          </Link>
        </div>
      </form>
    </div>
  )
}
