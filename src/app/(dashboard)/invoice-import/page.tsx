'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type DeviceRow = {
  device_name: string
  brand: string
  capacity: string
  quantity: number
  serial_number: string
  invoice_date: string
  expiry_date: string
  last_fill_date: string
  control1_date: string
  control2_date: string
  control3_date: string
}

type CustomerData = {
  full_name: string
  type: 'individual' | 'company'
  tax_number: string
  phone: string
  email: string
  address: string
}

type ParsedData = {
  customer: CustomerData
  devices: DeviceRow[]
}

type Step = 'upload' | 'processing' | 'review' | 'saving' | 'done'

function addYears(dateStr: string | null, years: number): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    d.setFullYear(d.getFullYear() + years)
    return d.toISOString().split('T')[0]
  } catch {
    return ''
  }
}

function addMonths(dateStr: string | null, months: number): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    d.setMonth(d.getMonth() + months)
    return d.toISOString().split('T')[0]
  } catch {
    return ''
  }
}

// 2 yıl garanti → 6'şar aylık (6, 12, 18 ay); 4 yıl garanti → yıllık (1, 2, 3 yıl)
function calcControlDates(invoiceDate: string, expiryDate: string): [string, string, string] {
  if (!invoiceDate || !expiryDate) return ['', '', '']
  const inv = new Date(invoiceDate).getTime()
  const exp = new Date(expiryDate).getTime()
  const diffYears = (exp - inv) / (365.25 * 24 * 60 * 60 * 1000)
  if (diffYears >= 3.5) {
    return [addYears(invoiceDate, 1), addYears(invoiceDate, 2), addYears(invoiceDate, 3)]
  }
  return [addMonths(invoiceDate, 6), addMonths(invoiceDate, 12), addMonths(invoiceDate, 18)]
}

export default function InvoiceImportPage() {
  const router = useRouter()
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('upload')
  const [error, setError] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [parsed, setParsed] = useState<ParsedData | null>(null)
  const [customer, setCustomer] = useState<CustomerData>({
    full_name: '', type: 'company', tax_number: '', phone: '', email: '', address: '',
  })
  const [devices, setDevices] = useState<DeviceRow[]>([])
  const [savedCustomerId, setSavedCustomerId] = useState<string | null>(null)

  function handleFileSelect(f: File) {
    setFile(f)
    setError('')
    if (f.type.startsWith('image/')) {
      setPreview(URL.createObjectURL(f))
    } else if (f.type === 'application/pdf') {
      const reader = new FileReader()
      reader.onload = async (e) => {
        try {
          const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf')
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
          const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(e.target!.result as ArrayBuffer) }).promise
          const page = await pdf.getPage(1)
          const viewport = page.getViewport({ scale: 1.5 })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise
          setPreview(canvas.toDataURL('image/png'))
        } catch {
          setPreview(null)
        }
      }
      reader.readAsArrayBuffer(f)
    } else {
      setPreview(null)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) handleFileSelect(f)
  }

  async function pdfToImageFile(f: File): Promise<File> {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf')
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
    const bytes = await f.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise
    const page = await pdf.getPage(1)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    await page.render({ canvasContext: canvas.getContext('2d')!, viewport }).promise
    const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/png'))
    return new File([blob], f.name.replace('.pdf', '.png'), { type: 'image/png' })
  }

  async function handleUpload() {
    if (!file) return
    setStep('processing')
    setError('')

    try {
      const uploadFile = file.type === 'application/pdf' ? await pdfToImageFile(file) : file
      const fd = new FormData()
      fd.append('file', uploadFile)

      const res = await fetch('/api/parse-invoice', { method: 'POST', body: fd })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Hata oluştu')
        setStep('upload')
        return
      }

      setParsed(data)
      const c = data.customer ?? {}
      setCustomer({
        full_name: c.full_name ?? '',
        type: c.type === 'individual' ? 'individual' : 'company',
        tax_number: c.tax_number ?? '',
        phone: c.phone ?? '',
        email: c.email ?? '',
        address: c.address ?? '',
      })

      const devs: DeviceRow[] = (data.devices ?? []).map((d: any) => {
        const invoiceDate = d.invoice_date ?? ''
        const expiryDate = addYears(invoiceDate, 2)
        const [c1, c2, c3] = calcControlDates(invoiceDate, expiryDate)
        return {
          device_name: d.device_name ?? '',
          brand: d.brand ?? '',
          capacity: d.capacity ?? '',
          quantity: d.quantity ?? 1,
          serial_number: d.serial_number ?? '',
          invoice_date: invoiceDate,
          expiry_date: expiryDate,
          last_fill_date: invoiceDate,
          control1_date: c1,
          control2_date: c2,
          control3_date: c3,
        }
      })
      setDevices(devs.length > 0 ? devs : [emptyDevice()])
      setStep('review')
    } catch (e: any) {
      setError(e.message ?? 'Beklenmeyen hata')
      setStep('upload')
    }
  }

  function emptyDevice(): DeviceRow {
    return {
      device_name: '', brand: '', capacity: '', quantity: 1, serial_number: '',
      invoice_date: '', expiry_date: '', last_fill_date: '',
      control1_date: '', control2_date: '', control3_date: '',
    }
  }

  function updateDevice(idx: number, field: keyof DeviceRow, value: any) {
    setDevices(prev => prev.map((d, i) => {
      if (i !== idx) return d
      const updated = { ...d, [field]: value }
      if (field === 'invoice_date') {
        updated.last_fill_date = value
        updated.expiry_date = addYears(value, 2)
        const [c1, c2, c3] = calcControlDates(value, updated.expiry_date)
        updated.control1_date = c1
        updated.control2_date = c2
        updated.control3_date = c3
      }
      if (field === 'expiry_date') {
        const [c1, c2, c3] = calcControlDates(updated.invoice_date, value)
        updated.control1_date = c1
        updated.control2_date = c2
        updated.control3_date = c3
      }
      return updated
    }))
  }

  async function handleSave() {
    if (!customer.full_name.trim()) {
      setError('Müşteri adı zorunludur')
      return
    }
    setStep('saving')
    setError('')

    try {
      // Check if customer already exists by tax_number
      let customerId: string | null = null

      if (customer.tax_number) {
        const { data: existing } = await supabase
          .from('customers')
          .select('id')
          .eq('tax_number', customer.tax_number)
          .single()
        if (existing) customerId = existing.id
      }

      if (!customerId) {
        const { data: newCustomer, error: custErr } = await supabase
          .from('customers')
          .insert({
            full_name: customer.full_name,
            type: customer.type,
            tax_number: customer.tax_number || null,
            phone: customer.phone || null,
            email: customer.email || null,
            address: customer.address || null,
            is_active: true,
          })
          .select('id')
          .single()

        if (custErr) throw new Error('Müşteri kaydedilemedi: ' + custErr.message)
        customerId = newCustomer.id
      }

      // Insert devices
      const validDevices = devices.filter(d => d.device_name.trim())
      if (validDevices.length > 0) {
        const now = Date.now()
        const rows = validDevices.map((d, idx) => ({
          customer_id: customerId,
          custom_device_name: d.device_name,
          brand: d.brand || null,
          capacity: d.capacity ? parseFloat(d.capacity) || null : null,
          quantity: d.quantity || 1,
          serial_number: d.quantity > 1 ? null : (d.serial_number || null),
          invoice_date: d.invoice_date || null,
          last_fill_date: d.last_fill_date || d.invoice_date || null,
          expiry_date: d.expiry_date || null,
          control1_date: d.control1_date || null,
          control2_date: d.control2_date || null,
          control3_date: d.control3_date || null,
          is_active: true,
          qr_code: `KOKLU-${customerId!.slice(0, 8)}-${now}-${idx}`,
        }))

        const { error: devErr } = await supabase.from('devices').insert(rows)
        if (devErr) throw new Error('Cihazlar kaydedilemedi: ' + devErr.message)
      }

      setSavedCustomerId(customerId)
      setStep('done')
    } catch (e: any) {
      setError(e.message)
      setStep('review')
    }
  }

  if (step === 'processing') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-[#C8102E] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-700 font-medium">Fatura analiz ediliyor...</p>
          <p className="text-sm text-gray-400">Claude AI faturanızı okuyor, lütfen bekleyin</p>
        </div>
      </div>
    )
  }

  if (step === 'saving') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-[#C8102E] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-700 font-medium">Kaydediliyor...</p>
        </div>
      </div>
    )
  }

  if (step === 'done') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white border rounded-xl p-10 text-center space-y-4 max-w-md w-full mx-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900">Başarıyla Kaydedildi!</h2>
          <p className="text-sm text-gray-500">Müşteri ve cihazlar sisteme eklendi.</p>
          <div className="flex gap-3 pt-2">
            {savedCustomerId && (
              <Link
                href={`/customers/${savedCustomerId}`}
                className="flex-1 bg-[#C8102E] text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-[#a50d26] text-center"
              >
                Müşteriyi Görüntüle
              </Link>
            )}
            <button
              onClick={() => {
                setStep('upload')
                setFile(null)
                setPreview(null)
                setParsed(null)
                setError('')
              }}
              className="flex-1 border rounded-lg py-2.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              Yeni Fatura
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'review') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b px-6 py-4 flex items-center gap-3 sticky top-0 z-10">
          <button onClick={() => setStep('upload')} className="text-gray-500 text-sm hover:text-gray-700">
            ← Geri
          </button>
          <span className="text-gray-300">/</span>
          <h1 className="text-lg font-bold text-gray-900">Fatura Verilerini Gözden Geçir</h1>
        </div>

        <div className="p-4 max-w-4xl mx-auto space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</div>
          )}

          {/* Customer */}
          <div className="bg-white border rounded-lg p-4 space-y-3">
            <div className="text-sm font-semibold text-gray-700">Müşteri Bilgileri</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Ad Soyad / Firma Adı *</label>
                <input
                  value={customer.full_name}
                  onChange={e => setCustomer(p => ({ ...p, full_name: e.target.value }))}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Tür</label>
                <select
                  value={customer.type}
                  onChange={e => setCustomer(p => ({ ...p, type: e.target.value as any }))}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                >
                  <option value="company">Firma</option>
                  <option value="individual">Bireysel</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Vergi / TC No</label>
                <input
                  value={customer.tax_number}
                  onChange={e => setCustomer(p => ({ ...p, tax_number: e.target.value }))}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Telefon</label>
                <input
                  value={customer.phone}
                  onChange={e => setCustomer(p => ({ ...p, phone: e.target.value }))}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">E-posta</label>
                <input
                  value={customer.email}
                  onChange={e => setCustomer(p => ({ ...p, email: e.target.value }))}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Adres</label>
                <input
                  value={customer.address}
                  onChange={e => setCustomer(p => ({ ...p, address: e.target.value }))}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                />
              </div>
            </div>
          </div>

          {/* Devices */}
          <div className="bg-white border rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
              <div className="text-sm font-semibold text-gray-700">Cihazlar</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setDevices(p => p.map(d => {
                    const expiry = addYears(d.invoice_date, 4)
                    const [c1, c2, c3] = calcControlDates(d.invoice_date, expiry)
                    return { ...d, expiry_date: expiry, control1_date: c1, control2_date: c2, control3_date: c3 }
                  }))}
                  className="text-sm border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50"
                >
                  4 Yıl Garanti
                </button>
                <button
                  onClick={() => setDevices(p => [...p, emptyDevice()])}
                  className="text-sm bg-[#C8102E] text-white px-3 py-1.5 rounded-lg hover:bg-[#a50d26]"
                >
                  + Cihaz Ekle
                </button>
              </div>
            </div>

            <div className="divide-y">
              {devices.map((d, idx) => (
                <div key={idx} className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-500">Cihaz {idx + 1}</span>
                    {devices.length > 1 && (
                      <button
                        onClick={() => setDevices(p => p.filter((_, i) => i !== idx))}
                        className="text-red-400 hover:text-red-600 text-sm"
                      >
                        Kaldır
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs font-medium text-gray-600">Cihaz Adı</label>
                      <input
                        value={d.device_name}
                        onChange={e => updateDevice(idx, 'device_name', e.target.value)}
                        placeholder="örn: Kuru Kimyevi Tozlu Yangın Söndürücü"
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">Adet</label>
                      <input
                        type="number"
                        min="1"
                        value={d.quantity}
                        onChange={e => updateDevice(idx, 'quantity', parseInt(e.target.value) || 1)}
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">Marka</label>
                      <input
                        value={d.brand}
                        onChange={e => updateDevice(idx, 'brand', e.target.value)}
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">Kapasite</label>
                      <input
                        value={d.capacity}
                        onChange={e => updateDevice(idx, 'capacity', e.target.value)}
                        placeholder="örn: 6 kg"
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">Seri No</label>
                      <input
                        value={d.serial_number}
                        onChange={e => updateDevice(idx, 'serial_number', e.target.value)}
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">Fatura Tarihi</label>
                      <input
                        type="date"
                        value={d.invoice_date}
                        onChange={e => updateDevice(idx, 'invoice_date', e.target.value)}
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-600">SKT (2 yıl sonra)</label>
                      <input
                        type="date"
                        value={d.expiry_date}
                        onChange={e => updateDevice(idx, 'expiry_date', e.target.value)}
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pb-6">
            <button
              onClick={handleSave}
              className="flex-1 bg-[#C8102E] text-white py-3 rounded-lg font-semibold hover:bg-[#a50d26] transition-colors"
            >
              Kaydet
            </button>
            <button
              onClick={() => setStep('upload')}
              className="px-8 py-3 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              İptal
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Upload step
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4 flex items-center gap-3">
        <Link href="/dashboard" className="text-gray-500 text-sm hover:text-gray-700">
          ← Dashboard
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-lg font-bold text-gray-900">Müşteri İçe Aktar</h1>
      </div>

      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-700">
          Fatura yükleyin — AI müşteri ve cihaz bilgilerini otomatik okuyacak. (JPG, PNG, WebP veya PDF)
        </div>

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center cursor-pointer hover:border-[#C8102E] hover:bg-red-50 transition-colors"
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,application/pdf"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f) }}
          />
          {file ? (
            <div className="space-y-2">
              {preview && (
                <img src={preview} alt="Fatura önizleme" className="max-h-48 mx-auto rounded-lg object-contain" />
              )}
              <p className="text-sm font-medium text-gray-700">{file.name}</p>
              <p className="text-xs text-gray-400">{(file.size / 1024).toFixed(0)} KB</p>
              <p className="text-xs text-[#C8102E]">Değiştirmek için tıklayın</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gray-700">Fatura yüklemek için tıklayın veya sürükleyin</p>
              <p className="text-xs text-gray-400">JPG, PNG, WebP veya PDF — maks. 10 MB</p>
            </div>
          )}
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</div>
        )}

        <button
          onClick={handleUpload}
          disabled={!file}
          className="w-full bg-[#C8102E] text-white py-3 rounded-lg font-semibold hover:bg-[#a50d26] disabled:opacity-40 transition-colors"
        >
          Analiz Et ve Devam Et
        </button>
      </div>
    </div>
  )
}
