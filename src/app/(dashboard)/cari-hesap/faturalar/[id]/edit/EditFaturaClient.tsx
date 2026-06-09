'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { calculateInvoiceTotals } from '@/lib/finance/calculations'
import { formatCurrency } from '@/lib/finance/formatters'
import { updateInvoiceAction } from './actions'
import { inferCityFromAddress, suggestBranchByCity } from '@/lib/branches/branch-inference'

type LineItem = {
  id?: string
  description: string; quantity: string; unit: string; unit_price: string; kdv_rate: string
  _deleted?: boolean
}

type BrokerLine = {
  id?: string
  broker_id: string
  broker_name: string
  commission_rate: string
  commission_amount: string
  _deleted?: boolean
}

type Props = {
  invoiceId: string
  invoice: any
  initialItems: any[]
  customers: Array<{ id: string; full_name: string; tax_number: string | null; phone?: string | null; email?: string | null; address?: string | null; il?: string | null; sube_id?: string | null }>
  allBrokers: { id: string; full_name: string; company_name: string | null }[]
  initialBrokers: any[]
  subeler: { id: string; ad: string; sehir?: string | null }[]
  kaynak?: string
}

const KDV_RATES = ['0', '10', '20']
const UNITS = ['adet', 'saat', 'kg', 'm', 'set', 'paket']

export default function EditFaturaClient({ invoiceId, invoice, initialItems, customers, allBrokers, initialBrokers, subeler, kaynak }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const initCustomer = invoice.customers as any ?? null
  const [selectedCustomer, setSelectedCustomer] = useState<any>(initCustomer)
  const [customerSearch, setCustomerSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const branchLocked = subeler.length === 1
  const [branchInfo, setBranchInfo] = useState(branchLocked ? `Tek şube yetkiniz olduğu için ${subeler[0]?.ad ?? 'şube'} seçildi.` : '')

  const [form, setForm] = useState({
    invoice_type: invoice.invoice_type ?? 'satis',
    customer_id: invoice.customer_id ?? '',
    customer_name: invoice.musteri_unvan ?? initCustomer?.full_name ?? '',
    tax_number: invoice.musteri_vergi_no ?? initCustomer?.tax_number ?? '',
    customer_phone: invoice.musteri_telefon ?? initCustomer?.phone ?? '',
    customer_email: invoice.musteri_email ?? initCustomer?.email ?? '',
    supplier_name: invoice.supplier_name ?? '',
    supplier_tax_no: invoice.supplier_tax_no ?? '',
    invoice_date: invoice.invoice_date ?? '',
    due_date: invoice.due_date ?? '',
    stopaj_rate: String(invoice.stopaj_rate ?? '0'),
    description: invoice.description ?? '',
    notes: invoice.notes ?? '',
    adres: (invoice as any).musteri_adres ?? (invoice as any).tedarikci_adres ?? initCustomer?.address ?? '',
    customer_city: (invoice as any).musteri_il ?? (invoice as any).tedarikci_il ?? initCustomer?.il ?? '',
    customer_district: (invoice as any).musteri_ilce ?? (invoice as any).tedarikci_ilce ?? '',
    sube_id: (invoice as any).sube_id ?? (branchLocked ? subeler[0]?.id ?? '' : ''),
  })

  const [items, setItems] = useState<LineItem[]>(
    initialItems.map(i => ({
      id: i.id,
      description: i.description ?? '',
      quantity: String(i.quantity ?? 1),
      unit: i.unit ?? 'adet',
      unit_price: String(i.unit_price ?? 0),
      kdv_rate: String(i.kdv_rate ?? 20),
    }))
  )

  const [brokerLines, setBrokerLines] = useState<BrokerLine[]>(
    initialBrokers.map((b: any) => ({
      id: b.id,
      broker_id: b.broker_id,
      broker_name: b.brokers?.company_name
        ? `${b.brokers.full_name} (${b.brokers.company_name})`
        : (b.brokers?.full_name ?? ''),
      commission_rate: String(b.commission_rate ?? 0),
      commission_amount: String(b.commission_amount ?? 0),
    }))
  )
  const [brokerSearch, setBrokerSearch] = useState('')
  const [showBrokerDropdown, setShowBrokerDropdown] = useState(false)

  const filteredCustomers = customers.filter(c =>
    c.full_name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    (c.tax_number ?? '').includes(customerSearch)
  )

  function updateItem(idx: number, field: keyof LineItem, value: string) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item))
  }

  function applyBranchSuggestion(address?: string | null, city?: string | null, customerBranchId?: string | null) {
    if (branchLocked) return
    if (customerBranchId && subeler.some(s => s.id === customerBranchId)) {
      const branch = subeler.find(s => s.id === customerBranchId)
      setForm(p => ({ ...p, sube_id: customerBranchId }))
      setBranchInfo(`Kayıtlı müşteri şubesine göre ${branch?.ad ?? 'şube'} seçildi.`)
      return
    }
    const inferredCity = city || inferCityFromAddress(address)
    const suggestion = suggestBranchByCity(inferredCity, subeler)
    setForm(p => ({ ...p, customer_city: inferredCity || p.customer_city, sube_id: suggestion.suggestedBranchId || p.sube_id }))
    setBranchInfo(suggestion.suggestedBranchName
      ? `Adres bilgisinden ${suggestion.city} tespit edildi. Şube ${suggestion.suggestedBranchName} olarak önerildi.`
      : suggestion.reason)
  }

  function pickCustomer(customer: any) {
    setSelectedCustomer(customer)
    setForm(p => ({
      ...p,
      customer_id: customer.id,
      customer_name: customer.full_name ?? '',
      tax_number: customer.tax_number ?? '',
      customer_phone: customer.phone ?? '',
      customer_email: customer.email ?? '',
      adres: customer.address ?? '',
      customer_city: customer.il ?? inferCityFromAddress(customer.address) ?? '',
      sube_id: branchLocked ? p.sube_id : (customer.sube_id ?? p.sube_id),
    }))
    setCustomerSearch('')
    setShowDropdown(false)
    applyBranchSuggestion(customer.address, customer.il, customer.sube_id)
  }

  const activeItems = items.filter(i => !i._deleted)
  const parsedItems = activeItems.map(i => ({
    quantity: parseFloat(i.quantity) || 0,
    unit_price: parseFloat(i.unit_price) || 0,
    kdv_rate: parseFloat(i.kdv_rate) || 0,
  }))
  const totals = calculateInvoiceTotals(parsedItems, parseFloat(form.stopaj_rate) || 0)

  const filteredBrokers = allBrokers.filter(b =>
    !brokerLines.some(l => l.broker_id === b.id && !l._deleted) &&
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.sube_id) { setError('Şube seçilmelidir.'); return }
    if (!form.invoice_date) { setError('Fatura tarihi zorunludur.'); return }
    setLoading(true); setError('')

    try {
      const invoiceData = {
        invoice_type: form.invoice_type,
        customer_id: form.customer_id || null,
        musteri_unvan: form.customer_name || customerSearch || null,
        musteri_vergi_no: form.tax_number || null,
        musteri_telefon: form.customer_phone || null,
        musteri_email: form.customer_email || null,
        musteri_adres: form.adres || null,
        musteri_il: form.customer_city || null,
        musteri_ilce: form.customer_district || null,
        supplier_name: form.supplier_name || null,
        supplier_tax_no: form.supplier_tax_no || null,
        tedarikci_adres: form.adres || null,
        tedarikci_il: form.customer_city || null,
        tedarikci_ilce: form.customer_district || null,
        invoice_date: form.invoice_date,
        due_date: form.due_date || null,
        subtotal: totals.subtotal,
        kdv_amount: totals.kdv_amount,
        stopaj_rate: parseFloat(form.stopaj_rate) || 0,
        stopaj_amount: totals.stopaj_amount,
        total_amount: totals.total_amount,
        description: form.description || null,
        notes: form.notes || null,
        sube_id: form.sube_id || null,
      }

      const deleted = items.filter(i => i._deleted && i.id)
      const updated = items.filter(i => !i._deleted && i.id)
      const newItems = items.filter(i => !i._deleted && !i.id && i.description.trim())

      const deletedBrokers = brokerLines.filter(b => b._deleted && b.id)
      const updatedBrokers = brokerLines.filter(b => !b._deleted && b.id)
      const newBrokers = brokerLines.filter(b => !b._deleted && !b.id && b.broker_id)

      const result = await updateInvoiceAction(
        invoiceId,
        invoiceData,
        deleted.map(i => i.id!),
        updated.map(i => ({
          id: i.id!,
          description: i.description,
          quantity: parseFloat(i.quantity) || 1,
          unit: i.unit,
          unit_price: parseFloat(i.unit_price) || 0,
          kdv_rate: parseFloat(i.kdv_rate) || 20,
        })),
        newItems.map((item, idx) => ({
          line_order: updated.length + idx + 1,
          description: item.description,
          quantity: parseFloat(item.quantity) || 1,
          unit: item.unit,
          unit_price: parseFloat(item.unit_price) || 0,
          kdv_rate: parseFloat(item.kdv_rate) || 20,
        })),
        deletedBrokers.map(b => b.id!),
        updatedBrokers.map(b => ({
          id: b.id!,
          commission_rate: parseFloat(b.commission_rate) || 0,
          commission_amount: parseFloat(b.commission_amount) || 0,
        })),
        newBrokers.map(b => ({
          broker_id: b.broker_id,
          commission_rate: parseFloat(b.commission_rate) || 0,
          commission_amount: parseFloat(b.commission_amount) || 0,
        }))
      )

      if (!result.success) {
        throw new Error(result.error)
      }

      router.push(`/cari-hesap/faturalar/${invoiceId}${kaynak ? `?kaynak=${kaynak}` : ''}`)
    } catch (e: any) {
      setError(e.message); setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href={`/cari-hesap/faturalar/${invoiceId}${kaynak ? `?kaynak=${kaynak}` : ''}`} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700">← Fatura Detayı</Link>
        <span className="text-gray-300">/</span>
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Fatura Düzenle</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-white dark:bg-gray-800 border rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 pb-2 border-b">Fatura Bilgileri</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Fatura Tipi</label>
              <select value={form.invoice_type} onChange={e => setForm(p => ({ ...p, invoice_type: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white dark:bg-gray-800">
                <option value="satis">Satış Faturası</option>
                <option value="alis">Alış Faturası</option>
                <option value="iade_satis">İade (Satış)</option>
                <option value="iade_alis">İade (Alış)</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Fatura Tarihi <span className="text-red-500">*</span></label>
              <input type="date" value={form.invoice_date} onChange={e => setForm(p => ({ ...p, invoice_date: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Vade Tarihi</label>
              <input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Açıklama</label>
              <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
          </div>

          {/* Şube */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Şube</label>
            <select value={form.sube_id} disabled={branchLocked} onChange={e => {
              setForm(p => ({ ...p, sube_id: e.target.value }))
              setBranchInfo('Şube manuel olarak değiştirildi.')
            }}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white dark:bg-gray-800 disabled:bg-gray-100 disabled:text-gray-500">
              <option value="">— Şube Seçin</option>
              {subeler.map(s => <option key={s.id} value={s.id}>{s.ad}</option>)}
            </select>
            {branchInfo && <p className="mt-1 text-xs text-blue-700">{branchInfo}</p>}
          </div>

          {/* Müşteri / Tedarikçi */}
          {(form.invoice_type === 'satis' || form.invoice_type === 'iade_satis') ? (
            <div className="relative">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Müşteri</label>
              {selectedCustomer ? (
                <div className="mt-1 flex items-center justify-between border rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-700">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedCustomer.full_name}</span>
                  <button type="button" onClick={() => { setSelectedCustomer(null); setForm(p => ({ ...p, customer_id: '' })); setCustomerSearch('') }}
                    className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600">Değiştir</button>
                </div>
              ) : (
                <div className="relative mt-1">
                  <input value={customerSearch} onChange={e => { setCustomerSearch(e.target.value); setShowDropdown(true) }}
                    onFocus={() => setShowDropdown(true)} onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                    placeholder="Müşteri ara..."
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                  {showDropdown && filteredCustomers.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filteredCustomers.slice(0, 15).map(c => (
                        <button key={c.id} type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer"
                          onMouseDown={e => { e.preventDefault(); pickCustomer(c) }}>
                          {c.full_name}
                          {c.tax_number && <span className="text-xs text-gray-400 ml-2">{c.tax_number}</span>}
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
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Firma / Tedarikçi Adı</label>
                <input value={form.supplier_name} onChange={e => setForm(p => ({ ...p, supplier_name: e.target.value }))}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Vergi No</label>
                <input value={form.supplier_tax_no} onChange={e => setForm(p => ({ ...p, supplier_tax_no: e.target.value }))}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
              </div>
            </div>
          )}
          {/* Adres */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {(form.invoice_type === 'satis' || form.invoice_type === 'iade_satis') ? 'Müşteri Adresi' : 'Tedarikçi Adresi'}
            </label>
            <textarea
              value={form.adres}
              onChange={e => {
                const address = e.target.value
                const city = inferCityFromAddress(address)
                setForm(p => ({ ...p, adres: address, customer_city: city || p.customer_city }))
                applyBranchSuggestion(address, city)
              }}
              rows={2}
              placeholder="Adres bilgisi..."
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Müşteri Adı / Ünvan</label>
              <input value={form.customer_name || customerSearch}
                onChange={e => {
                  setCustomerSearch(e.target.value)
                  setSelectedCustomer(null)
                  setForm(p => ({ ...p, customer_name: e.target.value, customer_id: '' }))
                }}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Vergi / TC No</label>
              <input value={form.tax_number} onChange={e => setForm(p => ({ ...p, tax_number: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Telefon</label>
              <input value={form.customer_phone} onChange={e => setForm(p => ({ ...p, customer_phone: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">E-posta</label>
              <input type="email" value={form.customer_email} onChange={e => setForm(p => ({ ...p, customer_email: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">İl</label>
              <input value={form.customer_city} onChange={e => {
                const city = e.target.value
                setForm(p => ({ ...p, customer_city: city }))
                applyBranchSuggestion(form.adres, city)
              }}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">İlçe</label>
              <input value={form.customer_district} onChange={e => setForm(p => ({ ...p, customer_district: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
          </div>
        </div>

        {/* Kalemler */}
        <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50 dark:bg-gray-700 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Fatura Kalemleri</h3>
            <button type="button"
              onClick={() => setItems(p => [...p, { description: '', quantity: '1', unit: 'adet', unit_price: '', kdv_rate: '20' }])}
              className="text-sm bg-[#C8102E] text-white px-3 py-1.5 rounded-lg hover:bg-[#a50d26]">
              + Kalem Ekle
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700 border-b">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Açıklama</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 w-20">Miktar</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 w-20">Birim</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 w-28">Birim Fiyat</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 w-20">KDV %</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 w-28">Toplam</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item, idx) => {
                  if (item._deleted) return null
                  const lineTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.unit_price) || 0)
                  return (
                    <tr key={idx}>
                      <td className="px-3 py-2">
                        <input value={item.description} onChange={e => updateItem(idx, 'description', e.target.value)}
                          className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" step="0.001" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)}
                          className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />
                      </td>
                      <td className="px-3 py-2">
                        <select value={item.unit} onChange={e => updateItem(idx, 'unit', e.target.value)}
                          className="w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-[#C8102E]">
                          {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" step="0.01" value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', e.target.value)}
                          className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />
                      </td>
                      <td className="px-3 py-2">
                        <select value={item.kdv_rate} onChange={e => updateItem(idx, 'kdv_rate', e.target.value)}
                          className="w-full border rounded px-2 py-1.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-[#C8102E]">
                          {KDV_RATES.map(r => <option key={r} value={r}>%{r}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-sm font-medium text-right">{formatCurrency(lineTotal)}</td>
                      <td className="px-2 py-2">
                        <button type="button"
                          onClick={() => item.id
                            ? setItems(p => p.map((x, i) => i === idx ? { ...x, _deleted: true } : x))
                            : setItems(p => p.filter((_, i) => i !== idx))}
                          className="text-red-400 hover:text-red-600 text-xs">✕</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t bg-gray-50 dark:bg-gray-700 px-5 py-4 flex justify-end">
            <div className="w-72 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">Ara Toplam</span>
                <span className="font-medium">{formatCurrency(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-300">KDV</span>
                <span className="font-medium">{formatCurrency(totals.kdv_amount)}</span>
              </div>
              <div className="flex justify-between text-base font-bold border-t pt-1.5">
                <span>Genel Toplam</span>
                <span className="text-[#C8102E]">{formatCurrency(totals.total_amount)}</span>
              </div>
            </div>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Notlar</label>
          <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2}
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
        </div>

        {/* Aracılar */}
        <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50 dark:bg-gray-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Aracılar</h3>
          </div>
          <div className="p-5 space-y-3">
            {brokerLines.map((line, idx) => {
              if (line._deleted) return null
              return (
                <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">{line.broker_name}</div>
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Oran %</label>
                    <input type="number" min="0" max="100" step="0.1"
                      value={line.commission_rate}
                      onChange={e => updateBrokerLine(idx, 'commission_rate', e.target.value)}
                      className="w-20 border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                      placeholder="0" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Tutar ₺</label>
                    <input type="number" min="0" step="0.01"
                      value={line.commission_amount}
                      onChange={e => updateBrokerLine(idx, 'commission_amount', e.target.value)}
                      className="w-28 border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                      placeholder="0,00" />
                  </div>
                  <button type="button"
                    onClick={() => setBrokerLines(prev => prev.map((b, i) => i === idx ? { ...b, _deleted: true } : b))}
                    className="text-red-400 hover:text-red-600 text-xs px-1">✕</button>
                </div>
              )
            })}

            <div className="relative">
              <input value={brokerSearch}
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
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-3 pb-6">
          <button type="submit" disabled={loading}
            className="flex-1 bg-[#C8102E] text-white py-3 rounded-lg font-semibold hover:bg-[#a50d26] disabled:opacity-50">
            {loading ? 'Kaydediliyor...' : 'Güncelle'}
          </button>
          <Link href={`/cari-hesap/faturalar/${invoiceId}${kaynak ? `?kaynak=${kaynak}` : ''}`}
            className="px-8 py-3 border rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 text-center">
            İptal
          </Link>
        </div>
      </form>
    </div>
  )
}
