'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { calculateInvoiceTotals } from '@/lib/finance/calculations'
import { formatCurrency } from '@/lib/finance/formatters'

type LineItem = { description: string; quantity: string; unit: string; unit_price: string; kdv_rate: string }
const emptyLine = (): LineItem => ({ description: '', quantity: '1', unit: 'adet', unit_price: '', kdv_rate: '20' })

type BrokerLine = { broker_id: string; broker_name: string; commission_rate: string; commission_amount: string }

const KDV_RATES = ['0', '10', '20']
const UNITS = ['adet', 'saat', 'kg', 'm', 'set', 'paket']

export default function NewFaturaPage() {
  const router = useRouter()
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [customers, setCustomers] = useState<any[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null)

  // PDF parse state
  const [parseLoading, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [showParseSection, setShowParseSection] = useState(false)
  const [customerNotFound, setCustomerNotFound] = useState(false)

  // Aracı state
  const [allBrokers, setAllBrokers] = useState<any[]>([])
  const [brokerLines, setBrokerLines] = useState<BrokerLine[]>([])
  const [brokerSearch, setBrokerSearch] = useState('')
  const [showBrokerDropdown, setShowBrokerDropdown] = useState(false)

  // Ön Kayıt state
  const [onKayitlar, setOnKayitlar] = useState<any[]>([])
  const [selectedOnKayitIds, setSelectedOnKayitIds] = useState<Set<string>>(new Set())
  const [onKayitEklendi, setOnKayitEklendi] = useState<Set<string>>(new Set())

  const [form, setForm] = useState({
    invoice_type: 'satis',
    customer_id: '',
    supplier_name: '',
    supplier_tax_no: '',
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: '',
    kdv_rate: '20',
    stopaj_rate: '0',
    description: '',
    notes: '',
  })
  const [items, setItems] = useState<LineItem[]>([emptyLine()])

  useEffect(() => {
    supabase.from('customers').select('id, full_name, tax_number').eq('is_active', true).order('full_name')
      .then(({ data }: { data: any }) => setCustomers(data ?? []))
    supabase.from('brokers').select('id, full_name, company_name').eq('is_active', true).order('full_name')
      .then(({ data }: { data: any }) => setAllBrokers(data ?? []))
  }, [])

  useEffect(() => {
    if (!selectedCustomer) { setOnKayitlar([]); setSelectedOnKayitIds(new Set()); setOnKayitEklendi(new Set()); return }
    supabase
      .from('on_kayitlar')
      .select('id, kayit_tarihi, aciklama, miktar, birim, birim_fiyat, toplam_tutar')
      .eq('customer_id', selectedCustomer.id)
      .eq('durum', 'beklemede')
      .order('kayit_tarihi', { ascending: false })
      .then(({ data }: { data: any }) => {
        setOnKayitlar(data ?? [])
        setSelectedOnKayitIds(new Set())
        setOnKayitEklendi(new Set())
      })
  }, [selectedCustomer])

  const filteredCustomers = customers.filter(c =>
    c.full_name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    (c.tax_number ?? '').includes(customerSearch)
  )

  const filteredBrokers = allBrokers.filter(b =>
    !brokerLines.some(l => l.broker_id === b.id) &&
    (b.full_name.toLowerCase().includes(brokerSearch.toLowerCase()) ||
     (b.company_name ?? '').toLowerCase().includes(brokerSearch.toLowerCase()))
  )

  function addBroker(broker: any) {
    setBrokerLines(prev => [...prev, {
      broker_id: broker.id,
      broker_name: broker.company_name ? `${broker.full_name} (${broker.company_name})` : broker.full_name,
      commission_rate: '',
      commission_amount: '',
    }])
    setBrokerSearch('')
    setShowBrokerDropdown(false)
  }

  function updateBrokerLine(idx: number, field: 'commission_rate' | 'commission_amount', value: string) {
    setBrokerLines(prev => prev.map((line, i) => {
      if (i !== idx) return line
      const updated = { ...line, [field]: value }
      if (field === 'commission_rate') {
        const rate = parseFloat(value) || 0
        updated.commission_amount = rate > 0
          ? String(parseFloat((totals.total_amount * rate / 100).toFixed(2)))
          : ''
      }
      return updated
    }))
  }

  function removeBrokerLine(idx: number) {
    setBrokerLines(prev => prev.filter((_, i) => i !== idx))
  }

  function updateItem(idx: number, field: keyof LineItem, value: string) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  function importOnKayitlar() {
    const selected = onKayitlar.filter(k => selectedOnKayitIds.has(k.id))
    if (selected.length === 0) return
    const newItems: LineItem[] = selected.map(k => ({
      description: k.aciklama,
      quantity: String(k.miktar),
      unit: k.birim === 'is' ? 'adet' : (UNITS.includes(k.birim) ? k.birim : 'adet'),
      unit_price: String(k.birim_fiyat),
      kdv_rate: '20',
    }))
    setItems(prev => {
      // Boş tek satır varsa kaldır
      const filtered = prev.filter(i => i.description.trim() || i.unit_price.trim())
      return filtered.length > 0 ? [...filtered, ...newItems] : newItems
    })
    setOnKayitEklendi(prev => { const n = new Set(prev); selectedOnKayitIds.forEach(id => n.add(id)); return n })
    setSelectedOnKayitIds(new Set())
  }

  function incrementQty(idx: number, delta: number) {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item
      const cur = parseFloat(item.quantity) || 0
      const next = Math.max(0.001, cur + delta)
      // Tam sayıysa tam sayı olarak göster
      return { ...item, quantity: Number.isInteger(next) ? String(next) : String(parseFloat(next.toFixed(3))) }
    }))
  }

  const parsedItems = items.map(i => ({
    quantity: parseFloat(i.quantity) || 0,
    unit_price: parseFloat(i.unit_price) || 0,
    kdv_rate: parseFloat(i.kdv_rate) || 0,
  }))
  const totals = calculateInvoiceTotals(parsedItems, parseFloat(form.stopaj_rate) || 0)

  // PDF'den fatura oku
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
    return new File([blob], f.name.replace(/\.pdf$/i, '.png'), { type: 'image/png' })
  }

  async function handleParseFatura(f: File) {
    setParsing(true)
    setParseError('')
    try {
      const uploadFile = f.type === 'application/pdf' ? await pdfToImageFile(f) : f
      const fd = new FormData()
      fd.append('file', uploadFile)

      const res = await fetch('/api/parse-fatura', { method: 'POST', body: fd })
      const data = await res.json()

      if (!res.ok) {
        setParseError(data.error ?? 'Fatura okunamadı')
        return
      }

      // Müşteri bilgilerini doldur
      setCustomerNotFound(false)
      if (data.customer?.full_name) {
        const parsedName = data.customer.full_name.toLowerCase().trim()
        const parsedTax  = (data.customer.tax_number ?? '').trim()
        // Önce vergi no ile, sonra tam ad, sonra kısmi içerme ile eşleştir
        const found = customers.find(c =>
          (parsedTax && c.tax_number === parsedTax) ||
          c.full_name.toLowerCase().trim() === parsedName ||
          c.full_name.toLowerCase().includes(parsedName) ||
          parsedName.includes(c.full_name.toLowerCase().trim())
        )
        if (found) {
          setSelectedCustomer(found)
          setForm(p => ({ ...p, customer_id: found.id }))
        } else {
          setCustomerSearch(data.customer.full_name)
          setShowDropdown(true)
          setCustomerNotFound(true)
        }
      }

      // Fatura tarihleri
      if (data.invoice?.invoice_date) {
        setForm(p => ({ ...p, invoice_date: data.invoice.invoice_date }))
      }
      if (data.invoice?.due_date) {
        setForm(p => ({ ...p, due_date: data.invoice.due_date }))
      }
      if (data.invoice?.kdv_rate != null) {
        setForm(p => ({ ...p, kdv_rate: String(data.invoice.kdv_rate) }))
      }
      if (data.invoice?.stopaj_rate) {
        setForm(p => ({ ...p, stopaj_rate: String(data.invoice.stopaj_rate) }))
      }

      // Tedarikçi (alış faturası için)
      if (data.supplier?.name) {
        setForm(p => ({
          ...p,
          supplier_name: data.supplier.name,
          supplier_tax_no: data.supplier.tax_no ?? '',
        }))
      }

      // Kalemler
      if (data.items && data.items.length > 0) {
        const parsedLines: LineItem[] = data.items.map((item: any) => ({
          description: item.description ?? '',
          quantity: String(item.quantity ?? 1),
          unit: item.unit ?? 'adet',
          unit_price: String(item.unit_price ?? ''),
          kdv_rate: String(item.kdv_rate ?? 20),
        }))
        setItems(parsedLines)
      }

      setShowParseSection(false)
    } catch (e: any) {
      setParseError(e.message ?? 'Beklenmeyen hata')
    } finally {
      setParsing(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.invoice_type === 'satis' && !form.customer_id) {
      setError('Satış faturası için müşteri seçimi zorunludur.'); return
    }
    if (!form.invoice_date) { setError('Fatura tarihi zorunludur.'); return }
    if (items.every(i => !i.description.trim())) { setError('En az bir kalem ekleyin.'); return }
    setLoading(true); setError('')

    try {
      const validItems = items
        .filter(i => i.description.trim() && parseFloat(i.quantity) > 0)
        .map((item, idx) => ({
          line_order: idx + 1,
          description: item.description,
          quantity: parseFloat(item.quantity) || 1,
          unit: item.unit,
          unit_price: parseFloat(item.unit_price) || 0,
          kdv_rate: parseFloat(item.kdv_rate) || 20,
        }))

      const year = new Date(form.invoice_date).getFullYear()

      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice: {
            prefix: 'KE',
            year,
            invoice_type: form.invoice_type,
            customer_id: form.customer_id || null,
            supplier_name: form.supplier_name || null,
            supplier_tax_no: form.supplier_tax_no || null,
            invoice_date: form.invoice_date,
            due_date: form.due_date || null,
            subtotal: totals.subtotal,
            kdv_rate: parseFloat(form.kdv_rate) || 20,
            kdv_amount: totals.kdv_amount,
            stopaj_rate: parseFloat(form.stopaj_rate) || 0,
            stopaj_amount: totals.stopaj_amount,
            total_amount: totals.total_amount,
            description: form.description || null,
            notes: form.notes || null,
          },
          items: validItems,
          brokers: brokerLines
            .filter(b => b.broker_id)
            .map(b => ({
              broker_id: b.broker_id,
              commission_rate: parseFloat(b.commission_rate) || 0,
              commission_amount: parseFloat(b.commission_amount) || 0,
            })),
        }),
      })

      let data: any
      try {
        data = await res.json()
      } catch {
        throw new Error(`Sunucu cevabı okunamadı (HTTP ${res.status})`)
      }

      if (!res.ok) throw new Error(data?.error ?? `Fatura kaydedilemedi (HTTP ${res.status})`)
      if (!data?.id) throw new Error('Fatura oluşturuldu ancak ID alınamadı. Faturalar listesini kontrol edin.')

      // Eklenen ön kayıtları faturalandı olarak işaretle
      if (onKayitEklendi.size > 0) {
        await supabase
          .from('on_kayitlar')
          .update({ durum: 'faturalanmadi', invoice_id: data.id, updated_at: new Date().toISOString() })
          .in('id', Array.from(onKayitEklendi))
      }

      router.push(`/cari-hesap/faturalar/${data.id}`)
    } catch (e: any) {
      setError(e.message)
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/cari-hesap/faturalar" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700">← Faturalar</Link>
          <span className="text-gray-300">/</span>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Yeni Fatura</h2>
        </div>
        <button
          type="button"
          onClick={() => setShowParseSection(v => !v)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
            showParseSection
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white dark:bg-gray-800 text-blue-600 border-blue-200 hover:bg-blue-50'
          }`}
        >
          <span>📄</span>
          PDF'den Oku
        </button>
      </div>

      {/* PDF Parse Bölümü */}
      {showParseSection && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-blue-800 mb-1">Fatura PDF / Görselden Otomatik Doldur</h3>
            <p className="text-xs text-blue-600">
              Fatura görselini yükleyin — AI müşteri, kalemler ve tutarları otomatik dolduracak. Elle düzenleyebilirsiniz.
            </p>
          </div>

          {parseLoading ? (
            <div className="flex items-center gap-3 py-4">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <span className="text-sm text-blue-700">Fatura analiz ediliyor...</span>
            </div>
          ) : (
            <div className="flex gap-3">
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) handleParseFatura(f)
                  e.target.value = ''
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                Dosya Seç ve Analiz Et
              </button>
              <button
                type="button"
                onClick={() => setShowParseSection(false)}
                className="px-4 py-2 border border-blue-200 text-blue-600 rounded-lg text-sm hover:bg-blue-100"
              >
                İptal
              </button>
            </div>
          )}

          {parseError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              {parseError}
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Genel Bilgiler */}
        <div className="bg-white dark:bg-gray-800 border rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 pb-2 border-b">Fatura Bilgileri</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Fatura Tipi</label>
              <select value={form.invoice_type}
                onChange={e => setForm(p => ({ ...p, invoice_type: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white dark:bg-gray-800">
                <option value="satis">Satış Faturası</option>
                <option value="alis">Alış Faturası</option>
                <option value="iade_satis">İade (Satış)</option>
                <option value="iade_alis">İade (Alış)</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Fatura Tarihi <span className="text-red-500">*</span></label>
              <input type="date" value={form.invoice_date}
                onChange={e => setForm(p => ({ ...p, invoice_date: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Vade Tarihi</label>
              <input type="date" value={form.due_date}
                onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Açıklama</label>
              <input value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                placeholder="Yangın söndürücü bakım hizmeti..." />
            </div>
          </div>

          {/* Müşteri / Tedarikçi */}
          {(form.invoice_type === 'satis' || form.invoice_type === 'iade_satis') ? (
            <div className="relative">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Müşteri <span className="text-red-500">*</span>
              </label>
              {customerNotFound && !selectedCustomer && (
                <div className="mt-1 mb-1 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-xs text-orange-700">
                  Müşteri sistemde bulunamadı. Lütfen aşağıdaki listeden seçin veya önce{' '}
                  <a href="/customers/new" target="_blank" className="underline font-medium">yeni müşteri ekleyin</a>.
                </div>
              )}
              {selectedCustomer ? (
                <div className="mt-1 flex items-center justify-between border rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-700">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedCustomer.full_name}</span>
                  <button type="button"
                    onClick={() => { setSelectedCustomer(null); setForm(p => ({ ...p, customer_id: '' })); setCustomerSearch(''); setCustomerNotFound(false) }}
                    className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600">Değiştir</button>
                </div>
              ) : (
                <div className="relative mt-1">
                  <input
                    value={customerSearch}
                    onChange={e => { setCustomerSearch(e.target.value); setShowDropdown(true); setCustomerNotFound(false) }}
                    onFocus={() => setShowDropdown(true)}
                    onBlur={() => setShowDropdown(false)}
                    placeholder="Müşteri adı veya vergi no..."
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] ${customerNotFound ? 'border-orange-400' : ''}`}
                  />
                  {showDropdown && filteredCustomers.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filteredCustomers.slice(0, 15).map(c => (
                        <button key={c.id} type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                          onMouseDown={e => {
                            e.preventDefault()
                            setSelectedCustomer(c)
                            setForm(p => ({ ...p, customer_id: c.id }))
                            setCustomerSearch('')
                            setShowDropdown(false)
                          }}>
                          <span className="font-medium">{c.full_name}</span>
                          {c.tax_number && <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">{c.tax_number}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Tedarikçi Adı</label>
                <input value={form.supplier_name}
                  onChange={e => setForm(p => ({ ...p, supplier_name: e.target.value }))}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                  placeholder="Tedarikçi firma adı" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Vergi No</label>
                <input value={form.supplier_tax_no}
                  onChange={e => setForm(p => ({ ...p, supplier_tax_no: e.target.value }))}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
              </div>
            </div>
          )}
        </div>

        {/* Ön Kayıtlar — müşteri seçilince göster */}
        {selectedCustomer && form.invoice_type === 'satis' && onKayitlar.length > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-orange-200 bg-orange-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-orange-900">Faturalanmamış Ön Kayıtlar</h3>
                <p className="text-xs text-orange-700 mt-0.5">
                  {selectedCustomer.full_name} adlı müşterinin {onKayitlar.length} adet faturalanmamış kaydı var.
                  Seçtiklerinizi fatura kalemine ekleyebilirsiniz.
                </p>
              </div>
              {selectedOnKayitIds.size > 0 && (
                <button type="button" onClick={importOnKayitlar}
                  className="bg-orange-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-800 whitespace-nowrap">
                  {selectedOnKayitIds.size} Kalemi Ekle
                </button>
              )}
            </div>
            <div className="divide-y divide-orange-100">
              {onKayitlar.map(k => {
                const isSelected = selectedOnKayitIds.has(k.id)
                const isAdded = onKayitEklendi.has(k.id)
                return (
                  <label key={k.id}
                    className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors ${
                      isAdded ? 'opacity-40 cursor-not-allowed' : 'hover:bg-orange-100'
                    }`}>
                    <input
                      type="checkbox"
                      disabled={isAdded}
                      checked={isSelected}
                      onChange={e => {
                        setSelectedOnKayitIds(prev => {
                          const n = new Set(prev)
                          if (e.target.checked) n.add(k.id)
                          else n.delete(k.id)
                          return n
                        })
                      }}
                      className="w-4 h-4 accent-orange-600 flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{k.aciklama}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {k.kayit_tarihi} · {k.miktar} {k.birim}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-orange-800 whitespace-nowrap">
                      {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(k.toplam_tutar)}
                    </div>
                    {isAdded && <span className="text-xs text-green-700 font-medium whitespace-nowrap">Eklendi ✓</span>}
                  </label>
                )
              })}
            </div>
          </div>
        )}

        {/* Kalemler */}
        <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50 dark:bg-gray-700 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Fatura Kalemleri</h3>
            <button type="button" onClick={() => setItems(p => [...p, emptyLine()])}
              className="text-sm bg-[#C8102E] text-white px-3 py-1.5 rounded-lg hover:bg-[#a50d26]">
              + Kalem Ekle
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700 border-b">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Açıklama</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 w-32">Miktar</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 w-20">Birim</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 w-28">Birim Fiyat</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 w-20">KDV %</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 w-28">Satır Top.</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item, idx) => {
                  const qty = parseFloat(item.quantity) || 0
                  const price = parseFloat(item.unit_price) || 0
                  const lineTotal = qty * price
                  return (
                    <tr key={idx}>
                      <td className="px-3 py-2">
                        <input value={item.description}
                          onChange={e => updateItem(idx, 'description', e.target.value)}
                          className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                          placeholder="Hizmet / ürün açıklaması" />
                      </td>
                      <td className="px-3 py-2">
                        {/* +/- butonlarıyla miktar — browser native spinner'ı kullanmıyoruz */}
                        <div className="flex items-center border rounded overflow-hidden">
                          <button
                            type="button"
                            onMouseDown={e => { e.preventDefault(); incrementQty(idx, -1) }}
                            className="px-2 py-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 text-sm font-bold select-none"
                          >−</button>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={item.quantity}
                            onChange={e => updateItem(idx, 'quantity', e.target.value)}
                            className="w-14 text-center py-1.5 text-sm focus:outline-none border-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <button
                            type="button"
                            onMouseDown={e => { e.preventDefault(); incrementQty(idx, 1) }}
                            className="px-2 py-1.5 text-gray-500 dark:text-gray-400 hover:bg-gray-100 text-sm font-bold select-none"
                          >+</button>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <select value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)}
                          className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E] bg-white dark:bg-gray-800">
                          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" step="0.01" value={item.unit_price}
                          onChange={e => updateItem(idx, 'unit_price', e.target.value)}
                          className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                          placeholder="0,00" />
                      </td>
                      <td className="px-3 py-2">
                        <select value={item.kdv_rate} onChange={e => updateItem(idx, 'kdv_rate', e.target.value)}
                          className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E] bg-white dark:bg-gray-800">
                          {KDV_RATES.map(r => <option key={r} value={r}>%{r}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-sm font-medium text-right text-gray-900 dark:text-gray-100">
                        {formatCurrency(lineTotal)}
                      </td>
                      <td className="px-2 py-2">
                        {items.length > 1 && (
                          <button type="button" onClick={() => setItems(p => p.filter((_, i) => i !== idx))}
                            className="text-red-400 hover:text-red-600 text-xs">✕</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Özet */}
          <div className="border-t bg-gray-50 dark:bg-gray-700 px-5 py-4">
            <div className="flex justify-end">
              <div className="w-72 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-300">Ara Toplam (KDV Hariç)</span>
                  <span className="font-medium">{formatCurrency(totals.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-300">KDV</span>
                  <span className="font-medium">{formatCurrency(totals.kdv_amount)}</span>
                </div>
                {totals.stopaj_amount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-300">Stopaj ({form.stopaj_rate}%)</span>
                    <span className="font-medium text-red-600">-{formatCurrency(totals.stopaj_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold border-t pt-1.5">
                  <span>Genel Toplam</span>
                  <span className="text-[#C8102E]">{formatCurrency(totals.total_amount)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Ek Ayarlar */}
        <div className="bg-white dark:bg-gray-800 border rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 pb-2 border-b">Ek Ayarlar</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Stopaj Oranı (%)</label>
              <input type="number" min="0" max="100" step="0.1" value={form.stopaj_rate}
                onChange={e => setForm(p => ({ ...p, stopaj_rate: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Notlar</label>
              <textarea value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                placeholder="Özel notlar..." />
            </div>
          </div>
        </div>

        {/* Aracı / Komisyon Bölümü */}
        <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50 dark:bg-gray-700 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Aracılar</h3>
          </div>
          <div className="p-5 space-y-3">
            {brokerLines.map((line, idx) => (
              <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">{line.broker_name}</div>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Oran %</label>
                  <input
                    type="number" min="0" max="100" step="0.1"
                    value={line.commission_rate}
                    onChange={e => updateBrokerLine(idx, 'commission_rate', e.target.value)}
                    className="w-20 border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                    placeholder="0" />
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Tutar ₺</label>
                  <input
                    type="number" min="0" step="0.01"
                    value={line.commission_amount}
                    onChange={e => updateBrokerLine(idx, 'commission_amount', e.target.value)}
                    className="w-28 border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                    placeholder="0,00" />
                </div>
                <button type="button" onClick={() => removeBrokerLine(idx)}
                  className="text-red-400 hover:text-red-600 text-xs px-1">✕</button>
              </div>
            ))}

            {/* Aracı ekle */}
            <div className="relative">
              <input
                value={brokerSearch}
                onChange={e => { setBrokerSearch(e.target.value); setShowBrokerDropdown(true) }}
                onFocus={() => setShowBrokerDropdown(true)}
                onBlur={() => setTimeout(() => setShowBrokerDropdown(false), 150)}
                placeholder="+ Aracı ekle..."
                className="w-full border border-dashed rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] text-gray-500 dark:text-gray-400"
              />
              {showBrokerDropdown && filteredBrokers.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {filteredBrokers.slice(0, 15).map(b => (
                    <button key={b.id} type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                      onMouseDown={e => { e.preventDefault(); addBroker(b) }}>
                      <span className="font-medium">{b.full_name}</span>
                      {b.company_name && <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">{b.company_name}</span>}
                    </button>
                  ))}
                </div>
              )}
              {showBrokerDropdown && filteredBrokers.length === 0 && brokerSearch && (
                <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border rounded-lg shadow-lg px-3 py-3 text-sm text-gray-400 dark:text-gray-500">
                  Aracı bulunamadı.{' '}
                  <Link href="/araclar/new" className="text-[#C8102E] hover:underline" target="_blank">Yeni aracı ekle →</Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-3 pb-6">
          <button type="submit" disabled={loading}
            className="flex-1 bg-[#C8102E] text-white py-3 rounded-lg font-semibold hover:bg-[#a50d26] disabled:opacity-50 transition-colors">
            {loading ? 'Kaydediliyor...' : 'Faturayı Kaydet'}
          </button>
          <Link href="/cari-hesap/faturalar"
            className="px-8 py-3 border rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 text-center">
            İptal
          </Link>
        </div>
      </form>
    </div>
  )
}
