'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

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

type ControlStatus = {
  num: number
  date: string | null
  done: boolean
  pending: boolean
}

type DeviceGroup = {
  key: string
  device_name: string
  quantity: number
  last_fill_date: string | null
  control1_date: string | null
  control2_date: string | null
  control3_date: string | null
  expiry_date: string | null
  control_status: string
  current_control: number
  next_control_date: string | null
  days_until_next: number | null
  controlStatuses: ControlStatus[]
  doneCount: number
}

const STATUS_OPTIONS = ['SAĞLAM', 'HASARLI', 'DEĞİŞTİRİLDİ', 'YOK']

function newItem(): FormItem {
  return {
    id: Math.random().toString(36).slice(2),
    device_name: '', serial_number: '', quantity: 1,
    body_status: 'SAĞLAM', valve_status: 'SAĞLAM',
    hose_status: 'SAĞLAM', gauge_status: 'SAĞLAM', notes: '',
  }
}

function analyzeControl(device: any) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const controls = [
    { num: 1, date: device.control1_date },
    { num: 2, date: device.control2_date },
    { num: 3, date: device.control3_date },
  ]

  const controlStatuses: ControlStatus[] = controls.map(c => {
    if (!c.date) return { num: c.num, date: null, done: false, pending: false }
    const d = new Date(c.date)
    d.setHours(0, 0, 0, 0)
    return { num: c.num, date: c.date, done: d <= today, pending: d > today }
  })

  const nextPending = controlStatuses.find(c => c.pending)
  const doneCount = controlStatuses.filter(c => c.done).length
  const nextDate = nextPending?.date ?? null
  let daysDiff: number | null = null
  if (nextDate) {
    daysDiff = Math.ceil((new Date(nextDate).getTime() - today.getTime()) / 86400000)
  }

  let status = 'ok'
  if (device.expiry_date && new Date(device.expiry_date) <= today) {
    status = 'expired'
  } else if (daysDiff !== null && daysDiff < 0) {
    status = 'overdue'
  } else if (daysDiff !== null && daysDiff <= 30) {
    status = 'urgent'
  } else if (daysDiff !== null && daysDiff <= 90) {
    status = 'soon'
  }

  return { status, current: doneCount + 1, next_date: nextDate, days: daysDiff, controlStatuses, doneCount }
}

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  ok:      { label: 'Geçerli',    color: 'text-green-700',  bg: 'bg-green-50 border-green-200'   },
  soon:    { label: 'Yaklaşıyor', color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200'     },
  urgent:  { label: 'Acil!',      color: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' },
  overdue: { label: 'Gecikmiş!',  color: 'text-red-700',    bg: 'bg-red-50 border-red-200'       },
  expired: { label: 'SKT Doldu!', color: 'text-red-700',    bg: 'bg-red-50 border-red-200'       },
}

export default function NewServiceFormPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const customerId = searchParams.get('customer_id')
  const supabase = createClient()

  const [customers, setCustomers] = useState<any[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [deviceGroups, setDeviceGroups] = useState<DeviceGroup[]>([])
  const searchRef = useRef<HTMLDivElement>(null)

  const [technicianName, setTechnicianName] = useState('')
  const [serviceDate, setServiceDate] = useState(new Date().toISOString().split('T')[0])
  const [controlNumber, setControlNumber] = useState<number | null>(null)
  const [generalNotes, setGeneralNotes] = useState('')
  const [customerNote, setCustomerNote] = useState('')
  const [nextServiceDate, setNextServiceDate] = useState('')
  const [items, setItems] = useState<FormItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const { data: cu } = await supabase
        .from('customers')
        .select('id,full_name,phone,authorized_person,authorized_phone')
        .eq('is_active', true)
        .order('full_name')
      setCustomers(cu ?? [])
      if (customerId && cu) {
        const found = cu.find((c: any) => c.id === customerId)
        if (found) { setSelectedCustomer(found); setCustomerSearch(found.full_name); loadDevices(customerId) }
      }
    }
    load()
  }, [])

  async function loadDevices(cid: string) {
    const { data } = await supabase
      .from('devices')
      .select('*, device_types(name)')
      .eq('customer_id', cid)
      .eq('is_active', true)
    if (!data) return

    const groups: Record<string, any> = {}
    for (const d of data) {
      const name = d.custom_device_name ?? d.device_types?.name ?? 'Cihaz'
      const cap = d.capacity ? ` ${d.capacity} Kg` : ''
      const key = `${name}${cap}`
      if (!groups[key]) groups[key] = { ...d, device_name: key, quantity: 0 }
      groups[key].quantity += (d.quantity || 1)
    }

    const result: DeviceGroup[] = Object.values(groups).map((g: any) => {
      const analysis = analyzeControl(g)
      return {
        key: g.device_name,
        device_name: g.device_name,
        quantity: g.quantity,
        last_fill_date: g.last_fill_date,
        control1_date: g.control1_date,
        control2_date: g.control2_date,
        control3_date: g.control3_date,
        expiry_date: g.expiry_date,
        control_status: analysis.status,
        current_control: analysis.current,
        next_control_date: analysis.next_date,
        days_until_next: analysis.days,
        controlStatuses: analysis.controlStatuses,
        doneCount: analysis.doneCount,
      }
    })
    setDeviceGroups(result)

    const controls = result.map(r => r.current_control)
    if (controls.length > 0) {
      const most = controls.sort((a, b) =>
        controls.filter(v => v === b).length - controls.filter(v => v === a).length
      )[0]
      setControlNumber(most)
    }
  }

  function addGroupToForm(group: DeviceGroup) {
    const existing = items.find(i => i.device_name === group.device_name)
    if (existing) {
      setItems(prev => prev.map(i =>
        i.device_name === group.device_name ? { ...i, quantity: group.quantity } : i
      ))
    } else {
      setItems(prev => [...prev, { ...newItem(), device_name: group.device_name, quantity: group.quantity }])
    }
  }

  function addAllToForm() {
    setItems(deviceGroups.map(g => ({ ...newItem(), device_name: g.device_name, quantity: g.quantity })))
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowDropdown(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function selectCustomer(c: any) {
    setSelectedCustomer(c); setCustomerSearch(c.full_name); setShowDropdown(false)
    setItems([]); loadDevices(c.id)
  }

  function updateItem(id: string, field: keyof FormItem, value: any) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i))
  }

  function removeItem(id: string) { setItems(prev => prev.filter(i => i.id !== id)) }

  const totalDevices = items.reduce((s, i) => s + i.quantity, 0)
  const saglam = items.filter(i =>
    i.body_status === 'SAĞLAM' && i.valve_status === 'SAĞLAM' &&
    i.hose_status === 'SAĞLAM' && i.gauge_status === 'SAĞLAM'
  ).length
  const hasarli = items.filter(i =>
    [i.body_status, i.valve_status, i.hose_status, i.gauge_status].includes('HASARLI')
  ).length
  const degistirilen = items.filter(i =>
    [i.body_status, i.valve_status, i.hose_status, i.gauge_status].includes('DEĞİŞTİRİLDİ')
  ).length

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedCustomer) { setError('Müşteri seçiniz.'); return }
    if (items.length === 0) { setError('En az bir cihaz ekleyiniz.'); return }
    setLoading(true); setError('')

    const formNumber = `SF-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`
    const { data: form, error: formErr } = await supabase
      .from('service_forms')
      .insert([{
        form_number: formNumber,
        customer_id: selectedCustomer.id,
        technician_name: technicianName || null,
        service_date: serviceDate,
        general_notes: generalNotes || null,
        customer_note: customerNote || null,
        next_service_date: nextServiceDate || null,
        control_number: controlNumber,
        status: 'completed',
      }])
      .select().single()

    if (formErr || !form) { setError('Form kaydedilemedi: ' + formErr?.message); setLoading(false); return }

    const { error: itemErr } = await supabase.from('service_form_items').insert(
      items.map(i => ({
        service_form_id: form.id,
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
    if (itemErr) { setError('Satırlar kaydedilemedi: ' + itemErr.message); setLoading(false); return }
    router.push(`/service-forms/${form.id}`)
  }

  const filteredCustomers = customers
    .filter(c => c.full_name.toLowerCase().includes(customerSearch.toLowerCase()))
    .slice(0, 10)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-700">
      <div className="bg-white dark:bg-gray-800 border-b px-6 py-4 flex items-center gap-3 sticky top-0 z-10">
        <div className="w-8 h-8 bg-[#C8102E] rounded-lg flex items-center justify-center text-white font-bold text-sm">K</div>
        <Link href="/service-forms" className="text-gray-500 dark:text-gray-400 text-sm hover:text-gray-700">← Servis Formları</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Yeni Servis Formu</h1>
        {totalDevices > 0 && (
          <span className="ml-auto text-sm text-gray-500 dark:text-gray-400">
            Toplam: <span className="font-bold text-gray-900 dark:text-gray-100">{totalDevices} cihaz</span>
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-4 max-w-4xl mx-auto space-y-4">

        {/* Müşteri + Teknisyen + Tarih */}
        <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Müşteri <span className="text-red-500">*</span></label>
              <div className="relative mt-1" ref={searchRef}>
                <input type="text" value={customerSearch}
                  onChange={e => { setCustomerSearch(e.target.value); setShowDropdown(true); setSelectedCustomer(null) }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="🔍 Müşteri ara..."
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                {showDropdown && customerSearch.length > 0 && (
                  <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border rounded-lg shadow-xl max-h-48 overflow-y-auto">
                    {filteredCustomers.length === 0
                      ? <div className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">Bulunamadı</div>
                      : filteredCustomers.map(c => (
                        <div key={c.id} onClick={() => selectCustomer(c)}
                          className="px-3 py-2 hover:bg-red-50 cursor-pointer border-b last:border-0">
                          <div className="text-sm font-medium">{c.full_name}</div>
                          {c.phone && <div className="text-xs text-gray-400 dark:text-gray-500">{c.phone}</div>}
                        </div>
                      ))}
                  </div>
                )}
                {selectedCustomer && (
                  <div className="mt-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
                    ✅ {selectedCustomer.full_name}
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Teknisyen</label>
              <input value={technicianName} onChange={e => setTechnicianName(e.target.value)}
                placeholder="Ad Soyad"
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Servis Tarihi</label>
              <input type="date" value={serviceDate} onChange={e => setServiceDate(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
          </div>

          {selectedCustomer && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="text-xs bg-blue-50 border border-blue-200 rounded px-3 py-2">
                <span className="font-semibold text-blue-900">Firma Yetkili:</span>{' '}
                <span className="text-blue-800">{selectedCustomer.authorized_person ?? '-'}</span>
              </div>
              <div className="text-xs bg-blue-50 border border-blue-200 rounded px-3 py-2">
                <span className="font-semibold text-blue-900">Yetkili Telefonu:</span>{' '}
                <span className="text-blue-800">{selectedCustomer.authorized_phone ?? '-'}</span>
              </div>
            </div>
          )}

          {/* Bakım periyot analizi */}
          {deviceGroups.length > 0 && (
            <div className="mt-4 pt-4 border-t space-y-3">
              <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Bakım Periyot Durumu</div>

              <div className="space-y-2">
                {deviceGroups.map(g => {
                  const cfg = statusConfig[g.control_status] ?? statusConfig.ok
                  return (
                    <div key={g.key} className={`rounded-lg px-3 py-2.5 border ${cfg.bg}`}>
                      {/* Başlık satırı */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{g.device_name}</span>
                          <span className="text-xs bg-white dark:bg-gray-800 border rounded-full px-2 py-0.5 text-gray-600 dark:text-gray-300 font-medium">
                            {g.quantity} adet
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {g.days_until_next !== null && (
                            <span className={`text-xs font-bold ${cfg.color}`}>
                              {g.days_until_next < 0
                                ? `${Math.abs(g.days_until_next)} gün gecikmiş`
                                : `${g.days_until_next} gün kaldı`}
                            </span>
                          )}
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium bg-white dark:bg-gray-800 ${cfg.color}`}>
                            {cfg.label}
                          </span>
                        </div>
                      </div>

                      {/* Kontrol zinciri */}
                      <div className="flex items-center gap-1.5 flex-wrap text-xs">
                        <span className="text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded px-1.5 py-0.5 border">
                          📅 Dolum: {g.last_fill_date ?? '-'}
                        </span>
                        <span className="text-gray-400 dark:text-gray-500">→</span>

                        {g.controlStatuses.map(c => (
                          <span key={c.num} className={`flex items-center gap-1 px-2 py-0.5 rounded-full border font-medium ${
                            c.done
                              ? 'bg-green-100 border-green-300 text-green-800'
                              : c.pending
                              ? 'bg-white dark:bg-gray-800 border-blue-300 text-blue-700'
                              : 'bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-400 dark:text-gray-500'
                          }`}>
                            {c.done ? '✅' : c.pending ? '⏳' : '⬜'}
                            {' '}{c.num}.Kontrol
                            {c.date && (
                              <span className="opacity-60 ml-0.5">{c.date}</span>
                            )}
                          </span>
                        ))}

                        <span className="text-gray-400 dark:text-gray-500">→</span>
                        <span className={`px-2 py-0.5 rounded-full border font-medium ${
                          g.expiry_date && new Date(g.expiry_date) < new Date()
                            ? 'bg-red-100 border-red-300 text-red-800'
                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400'
                        }`}>
                          🏁 SKT: {g.expiry_date ?? '-'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Bu servis hangi kontrol */}
              <div className="flex items-center gap-3 pt-1">
                <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">BU SERVİS:</div>
                <div className="flex gap-2">
                  {[1, 2, 3].map(n => (
                    <button key={n} type="button" onClick={() => setControlNumber(n)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                        controlNumber === n
                          ? 'bg-[#C8102E] text-white border-[#C8102E]'
                          : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-[#C8102E]'
                      }`}>
                      {n}. Kontrol
                    </button>
                  ))}
                  <button type="button" onClick={() => setControlNumber(null)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      controlNumber === null
                        ? 'bg-gray-800 text-white border-gray-800'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600'
                    }`}>
                    Dolum / Genel
                  </button>
                </div>
              </div>

              {/* Forma ekle butonları */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-semibold text-gray-500 dark:text-gray-400">FORMA EKLE</div>
                  <button type="button" onClick={addAllToForm}
                    className="text-xs bg-gray-800 text-white px-3 py-1 rounded-lg hover:bg-gray-700">
                    Tümünü Ekle
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {deviceGroups.map(g => (
                    <button key={g.key} type="button" onClick={() => addGroupToForm(g)}
                      className={`flex items-center gap-1.5 text-sm border rounded-lg px-3 py-1.5 transition-colors ${
                        items.find(i => i.device_name === g.device_name)
                          ? 'bg-red-50 border-[#C8102E] text-[#C8102E]'
                          : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-[#C8102E]'
                      }`}>
                      {items.find(i => i.device_name === g.device_name) ? '✓' : '+'} {g.device_name}
                      <span className="bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full px-1.5 text-xs font-bold">{g.quantity}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bakım kontrol tablosu */}
        <div className="bg-white dark:bg-gray-800 border rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-700 dark:text-gray-300">Bakım / Kontrol Sonuçları</div>
            <button type="button" onClick={() => setItems(prev => [...prev, newItem()])}
              className="text-sm border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50">
              + Manuel Ekle
            </button>
          </div>

          {items.length === 0 ? (
            <div className="px-4 py-10 text-center text-gray-400 dark:text-gray-500 text-sm">
              Yukarıdan cihaz seçin veya manuel satır ekleyin.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-700 border-b text-xs font-semibold text-gray-500 dark:text-gray-400">
                <div className="col-span-3">CİHAZ</div>
                <div className="col-span-1 text-center">ADET</div>
                <div className="col-span-1 text-center">GÖVDE</div>
                <div className="col-span-1 text-center">VANA</div>
                <div className="col-span-1 text-center">HORTUM</div>
                <div className="col-span-1 text-center">SAAT</div>
                <div className="col-span-3">NOT</div>
                <div className="col-span-1"></div>
              </div>
              <div className="divide-y">
                {items.map(item => (
                  <div key={item.id} className="grid grid-cols-12 gap-2 px-4 py-2 items-center">
                    <div className="col-span-3">
                      <input value={item.device_name} onChange={e => updateItem(item.id, 'device_name', e.target.value)}
                        placeholder="Cihaz adı..."
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
                    <div className="col-span-3">
                      <input value={item.notes} onChange={e => updateItem(item.id, 'notes', e.target.value)}
                        placeholder="Not..."
                        className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />
                    </div>
                    <div className="col-span-1 text-center">
                      <button type="button" onClick={() => removeItem(item.id)}
                        className="text-red-400 hover:text-red-600 text-xl font-bold">×</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 border-t flex items-center gap-4 text-sm">
                <span className="text-gray-500 dark:text-gray-400">Toplam: <span className="font-bold text-gray-800 dark:text-gray-200">{totalDevices} cihaz</span></span>
                <span className="text-green-600">✅ Sağlam: <span className="font-bold">{saglam}</span></span>
                {hasarli > 0 && <span className="text-red-600">⚠️ Hasarlı: <span className="font-bold">{hasarli}</span></span>}
                {degistirilen > 0 && <span className="text-yellow-600">🔄 Değiştirilen: <span className="font-bold">{degistirilen}</span></span>}
              </div>
            </>
          )}
        </div>

        {/* Notlar + Sonraki servis */}
        <div className="bg-white dark:bg-gray-800 border rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Genel Notlar</label>
              <textarea value={generalNotes} onChange={e => setGeneralNotes(e.target.value)} rows={2}
                placeholder="Teknisyen notu, gözlemler..."
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Müşteriye Not</label>
              <textarea value={customerNote} onChange={e => setCustomerNote(e.target.value)} rows={2}
                placeholder="Müşteriye iletilecek bilgi..."
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Sonraki Servis Tarihi</label>
            <input type="date" value={nextServiceDate} onChange={e => setNextServiceDate(e.target.value)}
              className="mt-1 w-48 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
          </div>
        </div>

        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</div>}

        <div className="flex gap-3 pb-6">
          <button type="submit" disabled={loading}
            className="flex-1 bg-[#C8102E] text-white py-3 rounded-lg font-semibold hover:bg-[#a50d26] disabled:opacity-50 transition-colors">
            {loading ? 'Kaydediliyor...' : '💾 Formu Kaydet'}
          </button>
          <Link href="/service-forms"
            className="px-8 py-3 border rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 transition-colors text-center">
            İptal
          </Link>
        </div>
      </form>
    </div>
  )
}