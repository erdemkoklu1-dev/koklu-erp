'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

type DeviceRow = {
  id: string
  device_type_id: string
  custom_name: string
  useCustomName: boolean
  brand: string
  capacity: string
  quantity: number
  serial_number: string
  location_detail: string
  invoice_date: string
  fill_date: string
  warranty_years: number
  expiry_date: string
  control1_date: string
  control2_date: string
  control3_date: string
  end_date: string
  notes: string
}

type Urun = {
  id: string
  ad: string
  kategori: string
  kapasite: string | null
  tip: string | null
}

function addMonths(dateStr: string, months: number): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  d.setMonth(d.getMonth() + months)
  return d.toISOString().split('T')[0]
}

function calcDates(fillDate: string, warrantyYears: number) {
  if (!fillDate) return { control1_date: '', control2_date: '', control3_date: '', end_date: '', expiry_date: '' }
  
  if (warrantyYears === 2) {
    // 2 yıl: 6. ay, 12. ay, 18. ay kontrol → 24. ay SKT
    return {
      control1_date: addMonths(fillDate, 6),
      control2_date: addMonths(fillDate, 12),
      control3_date: addMonths(fillDate, 18),
      end_date: addMonths(fillDate, 24),
      expiry_date: addMonths(fillDate, 24),
    }
  } else {
    // 4 yıl: 12. ay, 24. ay, 36. ay kontrol → 48. ay SKT
    return {
      control1_date: addMonths(fillDate, 12),
      control2_date: addMonths(fillDate, 24),
      control3_date: addMonths(fillDate, 36),
      end_date: addMonths(fillDate, 48),
      expiry_date: addMonths(fillDate, 48),
    }
  }
}
function newRow(): DeviceRow {
  return {
    id: Math.random().toString(36).slice(2),
    device_type_id: '', custom_name: '', useCustomName: false,
    brand: 'KÖKLÜ', capacity: '', quantity: 1,
    serial_number: '', location_detail: '',
    invoice_date: '', fill_date: '', warranty_years: 2,
    expiry_date: '', control1_date: '', control2_date: '', control3_date: '', end_date: '',
    notes: '',
  }
}

export default function NewDevicePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const customerId = searchParams.get('customer_id')
  const supabase = createClient()
  const [deviceTypes, setDeviceTypes] = useState<any[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [urunler, setUrunler] = useState<Urun[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [rows, setRows] = useState<DeviceRow[]>([newRow()])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  // urun autocomplete per-row: rowId -> search text, open state
  const [urunSearch, setUrunSearch] = useState<Record<string, string>>({})
  const [urunAcOpen, setUrunAcOpen] = useState<Record<string, boolean>>({})
  const searchRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function load() {
      const [{ data: dt }, { data: cu }, { data: ur }] = await Promise.all([
        supabase.from('device_types').select('*').order('name'),
        supabase.from('customers').select('id,full_name,phone').eq('is_active', true).order('full_name'),
        supabase.from('urunler').select('id,ad,kategori,kapasite,tip').eq('aktif', true).order('ad'),
      ])
      setDeviceTypes(dt ?? [])
      setCustomers(cu ?? [])
      setUrunler(ur ?? [])
      if (customerId && cu) {
        const found = cu.find((c: any) => c.id === customerId)
        if (found) { setSelectedCustomer(found); setCustomerSearch(found.full_name) }
      }
    }
    load()
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowDropdown(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filteredCustomers = customers.filter(c =>
    c.full_name.toLowerCase().includes(customerSearch.toLowerCase())
  ).slice(0, 10)

  function updateRow(id: string, field: keyof DeviceRow, value: any) {
    setRows(prev => prev.map(r => {
      if (r.id !== id) return r
      const updated = { ...r, [field]: value }
      // fill_date veya warranty_years değişince tarihleri otomatik hesapla
      if (field === 'fill_date' || field === 'warranty_years') {
        const fd = field === 'fill_date' ? value : r.fill_date
        const wy = field === 'warranty_years' ? value : r.warranty_years
        const calc = calcDates(fd, Number(wy))
        return { ...updated, ...calc }
      }
      return updated
    }))
  }

  function selectUrun(rowId: string, urun: Urun) {
    // Build a descriptive name from urun fields
    const name = urun.ad
    // Parse capacity number from kapasite string (e.g. "6 Kg" → "6")
    const capMatch = urun.kapasite ? urun.kapasite.match(/[\d.]+/) : null
    const cap = capMatch ? capMatch[0] : ''
    updateRow(rowId, 'custom_name', name)
    updateRow(rowId, 'useCustomName', true)
    if (cap) setRows(prev => prev.map(r => r.id === rowId ? { ...r, custom_name: name, useCustomName: true, capacity: cap } : r))
    else setRows(prev => prev.map(r => r.id === rowId ? { ...r, custom_name: name, useCustomName: true } : r))
    setUrunAcOpen(prev => ({ ...prev, [rowId]: false }))
    setUrunSearch(prev => ({ ...prev, [rowId]: '' }))
  }

  function addRow() { setRows(prev => [...prev, newRow()]) }
  function removeRow(id: string) { if (rows.length > 1) setRows(prev => prev.filter(r => r.id !== id)) }
  function duplicateRow(id: string) {
    const row = rows.find(r => r.id === id)
    if (!row) return
    const copy = { ...row, id: Math.random().toString(36).slice(2), serial_number: '' }
    const idx = rows.findIndex(r => r.id === id)
    const next = [...rows]; next.splice(idx + 1, 0, copy)
    setRows(next)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedCustomer) { setError('Lütfen müşteri seçin.'); return }
    const invalid = rows.find(r => !r.fill_date || !r.expiry_date)
    if (invalid) { setError('Tüm satırlarda Dolum Tarihi zorunludur.'); return }
    setLoading(true); setError('')

    const inserts: any[] = []
    for (const row of rows) {
      for (let i = 0; i < row.quantity; i++) {
        const qr = `KOKLU-${selectedCustomer.id.slice(0, 8)}-${Date.now()}-${i}`
        inserts.push({
          customer_id: selectedCustomer.id,
          device_type_id: row.useCustomName || !row.device_type_id ? null : row.device_type_id,
          custom_device_name: row.useCustomName ? row.custom_name : null,
          brand: row.brand,
          capacity: row.capacity ? parseFloat(row.capacity) : null,
          serial_number: row.quantity > 1 ? null : (row.serial_number || null),
          location_detail: row.location_detail || null,
          invoice_date: row.invoice_date || null,
          last_fill_date: row.fill_date || null,
          warranty_years: row.warranty_years,
          expiry_date: row.expiry_date || null,
          end_date: row.end_date || null,
          control1_date: row.control1_date || null,
          control2_date: row.control2_date || null,
          control3_date: row.control3_date || null,
          next_maintenance_date: row.control1_date || null,
          notes: row.notes || null,
          qr_code: qr,
        })
      }
    }

    const { error } = await supabase.from('devices').insert(inserts)
    if (error) { setError('Kayıt hatası: ' + error.message); setLoading(false) }
    else {
      setSuccess(`✅ ${inserts.length} cihaz başarıyla kaydedildi!`)
      setTimeout(() => {
        if (customerId) router.push(`/customers/${customerId}`)
        else router.push('/customers')
      }, 1500)
    }
  }

  const totalDevices = rows.reduce((s, r) => s + r.quantity, 0)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-700">
      <div className="bg-white dark:bg-gray-800 border-b px-6 py-4 flex items-center gap-3 sticky top-0 z-10">
        <div className="w-8 h-8 bg-[#C8102E] rounded-lg flex items-center justify-center text-white font-bold text-sm">K</div>
        <Link href={customerId ? `/customers/${customerId}` : '/customers'} className="text-gray-500 dark:text-gray-400 text-sm hover:text-gray-700">← Geri</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Cihaz Ekle</h1>
        <div className="ml-auto text-sm text-gray-500 dark:text-gray-400">Toplam: <span className="font-bold text-gray-900 dark:text-gray-100">{totalDevices} cihaz</span></div>
      </div>

      <form onSubmit={handleSubmit} className="p-4 max-w-6xl mx-auto space-y-4">

        {/* Müşteri arama */}
        <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
          <div className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Müşteri <span className="text-red-500">*</span></div>
          <div className="relative" ref={searchRef}>
            <input type="text" value={customerSearch}
              onChange={e => { setCustomerSearch(e.target.value); setShowDropdown(true); setSelectedCustomer(null) }}
              onFocus={() => setShowDropdown(true)}
              placeholder="🔍 Müşteri adı ile ara..."
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            {showDropdown && customerSearch.length > 0 && (
              <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border rounded-lg shadow-xl max-h-52 overflow-y-auto">
                {filteredCustomers.length === 0
                  ? <div className="px-3 py-3 text-sm text-gray-400 dark:text-gray-500 text-center">Sonuç bulunamadı</div>
                  : filteredCustomers.map(c => (
                    <div key={c.id} onClick={() => { setSelectedCustomer(c); setCustomerSearch(c.full_name); setShowDropdown(false) }}
                      className="px-3 py-2.5 hover:bg-red-50 cursor-pointer border-b last:border-0 flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{c.full_name}</div>
                        {c.phone && <div className="text-xs text-gray-400 dark:text-gray-500">{c.phone}</div>}
                      </div>
                      <div className="text-xs text-[#C8102E]">Seç →</div>
                    </div>
                  ))}
              </div>
            )}
          </div>
          {selectedCustomer && (
            <div className="mt-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 flex items-center gap-2">
              ✅ <span className="font-semibold">{selectedCustomer.full_name}</span>
            </div>
          )}
        </div>

        {/* Cihaz satırları */}
        <div className="bg-white dark:bg-gray-800 border rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">Cihaz Listesi</div>
            <button type="button" onClick={addRow}
              className="text-sm bg-[#C8102E] text-white px-3 py-1.5 rounded-lg hover:bg-[#a50d26] transition-colors">
              + Satır Ekle
            </button>
          </div>

          <div className="divide-y">
            {rows.map((row, idx) => (
              <div key={row.id} className="p-4 space-y-3">

                {/* Satır başlık */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 bg-[#C8102E] text-white rounded-full text-xs flex items-center justify-center font-bold">{idx + 1}</span>
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Cihaz Satırı</span>
                  </div>
                  <div className="flex gap-3 text-xs">
                    <button type="button" onClick={() => duplicateRow(row.id)} className="text-blue-600 hover:underline">Kopyala</button>
                    {rows.length > 1 && <button type="button" onClick={() => removeRow(row.id)} className="text-red-500 hover:underline">Sil</button>}
                  </div>
                </div>

                {/* Satır 1: Cihaz tipi, Marka, Kapasite, Adet, Konum */}
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-4">
                    <label className="text-xs text-gray-500 dark:text-gray-400">Cihaz Tipi <span className="text-red-500">*</span></label>
                    {!row.useCustomName ? (
                      <div className="flex gap-1 mt-1">
                        <select value={row.device_type_id} onChange={e => updateRow(row.id, 'device_type_id', e.target.value)}
                          className="flex-1 border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
                          <option value="">-- Tip Seçin --</option>
                          {deviceTypes.map(dt => <option key={dt.id} value={dt.id}>{dt.name}</option>)}
                        </select>
                        <button type="button" onClick={() => { updateRow(row.id, 'useCustomName', true); setUrunAcOpen(prev => ({ ...prev, [row.id]: true })) }}
                          title="Ürünlerden seç" className="px-2 border rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:bg-red-50 hover:border-[#C8102E] hover:text-[#C8102E]">🔍</button>
                        <button type="button" onClick={() => updateRow(row.id, 'useCustomName', true)}
                          title="Elle yaz" className="px-2 border rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50">✏️</button>
                      </div>
                    ) : (
                      <div className="relative mt-1">
                        <div className="flex gap-1">
                          <input value={row.custom_name} onChange={e => {
                              updateRow(row.id, 'custom_name', e.target.value)
                              setUrunSearch(prev => ({ ...prev, [row.id]: e.target.value }))
                              setUrunAcOpen(prev => ({ ...prev, [row.id]: true }))
                            }}
                            onFocus={() => setUrunAcOpen(prev => ({ ...prev, [row.id]: true }))}
                            onBlur={() => setTimeout(() => setUrunAcOpen(prev => ({ ...prev, [row.id]: false })), 150)}
                            placeholder="Ürün adını yazın veya ara..."
                            className="flex-1 border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                          <button type="button" onClick={() => updateRow(row.id, 'useCustomName', false)}
                            title="Device tipinden seç" className="px-2 border rounded-lg text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50">📋</button>
                        </div>
                        {urunAcOpen[row.id] && (
                          <div className="absolute z-30 left-0 right-8 mt-1 bg-white dark:bg-gray-800 border rounded-lg shadow-xl max-h-48 overflow-y-auto">
                            {urunler
                              .filter(u => {
                                const q = (urunSearch[row.id] ?? row.custom_name).toLowerCase()
                                return !q || u.ad.toLowerCase().includes(q)
                              })
                              .slice(0, 12)
                              .map(u => (
                                <div key={u.id}
                                  onMouseDown={e => { e.preventDefault(); selectUrun(row.id, u) }}
                                  className="px-3 py-2 hover:bg-red-50 cursor-pointer border-b last:border-0">
                                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{u.ad}</div>
                                  <div className="text-xs text-gray-400 dark:text-gray-500 flex gap-2">
                                    <span>{u.kategori === 'cihaz' ? '🔴 Cihaz' : u.kategori === 'dolum' ? '🔵 Dolum' : '🟡 Yedek Parça'}</span>
                                    {u.kapasite && <span>{u.kapasite}</span>}
                                    {u.tip && <span>{u.tip}</span>}
                                  </div>
                                </div>
                              ))}
                            {urunler.filter(u => {
                              const q = (urunSearch[row.id] ?? row.custom_name).toLowerCase()
                              return !q || u.ad.toLowerCase().includes(q)
                            }).length === 0 && (
                              <div className="px-3 py-3 text-xs text-gray-400 dark:text-gray-500 text-center">Ürün bulunamadı</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 dark:text-gray-400">Marka</label>
                    <input value={row.brand} onChange={e => updateRow(row.id, 'brand', e.target.value)}
                      className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                  </div>

                  <div className="col-span-1">
                    <label className="text-xs text-gray-500 dark:text-gray-400">Kap. (kg)</label>
                    <input type="number" step="0.5" value={row.capacity} onChange={e => updateRow(row.id, 'capacity', e.target.value)}
                      placeholder="6"
                      className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] text-center" />
                  </div>

                  <div className="col-span-1">
                    <label className="text-xs text-gray-500 dark:text-gray-400">Adet</label>
                    <input type="number" min="1" max="999" value={row.quantity}
                      onChange={e => updateRow(row.id, 'quantity', parseInt(e.target.value) || 1)}
                      className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] text-center font-bold text-[#C8102E]" />
                  </div>

                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 dark:text-gray-400">Seri No</label>
                    <input value={row.serial_number} onChange={e => updateRow(row.id, 'serial_number', e.target.value)}
                      placeholder={row.quantity > 1 ? '(Çoklu)' : 'SN-001'}
                      disabled={row.quantity > 1}
                      className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] disabled:bg-gray-50 disabled:text-gray-300" />
                  </div>

                  <div className="col-span-2">
                    <label className="text-xs text-gray-500 dark:text-gray-400">Ürün Yeri / Konum</label>
                    <input value={row.location_detail} onChange={e => updateRow(row.id, 'location_detail', e.target.value)}
                      placeholder="Kat, oda, koridor..."
                      className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                  </div>
                </div>

                {/* Satır 2: Garanti + Fatura + Dolum + Otomatik tarihler */}
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 space-y-2">
                  <div className="grid grid-cols-12 gap-2">
                    {/* Garanti süresi */}
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Garanti Süresi</label>
                      <div className="flex gap-1 mt-1">
                        {[2, 4].map(y => (
                          <button key={y} type="button"
                            onClick={() => updateRow(row.id, 'warranty_years', y)}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                              row.warranty_years === y
                                ? 'bg-[#C8102E] text-white border-[#C8102E]'
                                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-[#C8102E]'
                            }`}>
                            {y} Yıl
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Fatura tarihi */}
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500 dark:text-gray-400">Fatura Tarihi</label>
                      <input type="date" value={row.invoice_date} onChange={e => updateRow(row.id, 'invoice_date', e.target.value)}
                        className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                    </div>

                    {/* Dolum tarihi — tetikleyici */}
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">Dolum Tarihi <span className="text-red-500">*</span></label>
                      <input type="date" value={row.fill_date} onChange={e => updateRow(row.id, 'fill_date', e.target.value)}
                        className="mt-1 w-full border-2 border-gray-400 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                    </div>

                    {/* Otomatik hesaplanan tarihler */}
                    <div className="col-span-2">
                      <label className="text-xs text-blue-600">1. Kontrol (Otomatik)</label>
                      <input type="date" value={row.control1_date} onChange={e => updateRow(row.id, 'control1_date', e.target.value)}
                        className="mt-1 w-full border border-blue-200 bg-blue-50 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    </div>

                    <div className="col-span-2">
                      <label className="text-xs text-blue-600">2. Kontrol (Otomatik)</label>
                      <input type="date" value={row.control2_date} onChange={e => updateRow(row.id, 'control2_date', e.target.value)}
                        className="mt-1 w-full border border-blue-200 bg-blue-50 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    </div>

                    <div className="col-span-2">
                      <label className="text-xs text-blue-600">3. Kontrol (Otomatik)</label>
                      <input type="date" value={row.control3_date} onChange={e => updateRow(row.id, 'control3_date', e.target.value)}
                        placeholder={row.warranty_years === 2 ? '(2 Yılda yok)' : ''}
                        className="mt-1 w-full border border-blue-200 bg-blue-50 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-40"
                        disabled={false} />
                    </div>
                  </div>

                  {/* SKT + Bitiş */}
                  <div className="grid grid-cols-12 gap-2">
                    <div className="col-span-2 col-start-7">
                      <label className="text-xs font-semibold text-red-600">SKT / Bitiş (Otomatik) <span className="text-red-500">*</span></label>
                      <input type="date" value={row.expiry_date} onChange={e => updateRow(row.id, 'expiry_date', e.target.value)}
                        className="mt-1 w-full border-2 border-red-300 bg-red-50 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                    </div>
                    <div className="col-span-4">
                      <label className="text-xs text-gray-500 dark:text-gray-400">Notlar</label>
                      <input value={row.notes} onChange={e => updateRow(row.id, 'notes', e.target.value)}
                        placeholder="Ek bilgi..."
                        className="mt-1 w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                    </div>
                  </div>

                  {/* Dolum tarihi girilince özet göster */}
                  {row.fill_date && (
                    <div className="flex gap-2 flex-wrap mt-1">
                      <span className="text-xs bg-white dark:bg-gray-800 border rounded px-2 py-0.5 text-gray-600 dark:text-gray-300">
                        📅 Dolum: {row.fill_date}
                      </span>
                      {row.control1_date && <span className="text-xs bg-blue-50 border border-blue-200 rounded px-2 py-0.5 text-blue-700">1.K: {row.control1_date}</span>}
                      {row.control2_date && <span className="text-xs bg-blue-50 border border-blue-200 rounded px-2 py-0.5 text-blue-700">2.K: {row.control2_date}</span>}
                      {row.control3_date && <span className="text-xs bg-blue-50 border border-blue-200 rounded px-2 py-0.5 text-blue-700">3.K: {row.control3_date}</span>}
                      {row.expiry_date && <span className="text-xs bg-red-50 border border-red-200 rounded px-2 py-0.5 text-red-700 font-medium">SKT: {row.expiry_date}</span>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 border-t flex items-center justify-between">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              <span className="font-bold text-gray-900 dark:text-gray-100">{totalDevices}</span> cihaz
              · <span className="font-bold text-gray-900 dark:text-gray-100">{rows.length}</span> satır
            </div>
            <button type="button" onClick={addRow}
              className="text-sm text-[#C8102E] font-medium hover:underline">+ Satır Ekle</button>
          </div>
        </div>

        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</div>}
        {success && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3 font-semibold">{success}</div>}

        <div className="flex gap-3 pb-6">
          <button type="submit" disabled={loading}
            className="flex-1 bg-[#C8102E] text-white py-3 rounded-lg font-semibold hover:bg-[#a50d26] disabled:opacity-50 transition-colors">
            {loading ? 'Kaydediliyor...' : `💾 Kaydet (${totalDevices} cihaz)`}
          </button>
          <Link href={customerId ? `/customers/${customerId}` : '/customers'}
            className="px-8 py-3 border rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 transition-colors text-center">
            İptal
          </Link>
        </div>
      </form>
    </div>
  )
}