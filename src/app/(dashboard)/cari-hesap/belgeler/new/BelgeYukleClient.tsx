'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

type Customer = { id: string; full_name: string }
type Invoice  = { id: string; invoice_number: string; customer_id: string | null; total_amount: number; paid_amount: number }

export default function BelgeYukleClient({
  customers,
  invoices,
  defaultCustomerId,
  defaultInvoiceId,
}: {
  customers: Customer[]
  invoices: Invoice[]
  defaultCustomerId?: string | null
  defaultInvoiceId?: string | null
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [documentType, setDocumentType] = useState('dekont')
  const [customerId, setCustomerId] = useState(defaultCustomerId ?? '')
  const [invoiceId, setInvoiceId] = useState(defaultInvoiceId ?? '')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Müşteri seçilince fatura listesini filtrele
  const filteredInvoices = customerId
    ? invoices.filter(inv => inv.customer_id === customerId && (inv.total_amount - inv.paid_amount) > 0)
    : invoices.filter(inv => (inv.total_amount - inv.paid_amount) > 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) { setError('Lütfen bir dosya seçin'); return }
    setLoading(true)
    setError('')

    const fd = new FormData()
    fd.append('file', file)
    fd.append('document_type', documentType)
    if (customerId) fd.append('customer_id', customerId)
    if (invoiceId)  fd.append('invoice_id', invoiceId)
    if (amount)     fd.append('amount', amount)
    if (notes)      fd.append('notes', notes)

    try {
      const res = await fetch('/api/documents/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Yükleme başarısız'); return }
      // Başarılı: işlem sayfasına yönlendir
      router.push(`/cari-hesap/belgeler/${data.id}`)
    } catch {
      setError('Beklenmeyen hata oluştu')
    } finally {
      setLoading(false)
    }
  }

  const formatCur = (n: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n)

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Dosya seç */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Dosya *</label>
        <div
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            file ? 'border-[#C8102E] bg-red-50' : 'border-gray-300 dark:border-gray-600 hover:border-[#C8102E] hover:bg-gray-50'
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <div>
              <div className="text-sm font-medium text-[#C8102E]">{file.name}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{Math.round(file.size / 1024)} KB · Değiştirmek için tıkla</div>
            </div>
          ) : (
            <div>
              <div className="text-3xl mb-2 text-gray-300">📎</div>
              <div className="text-sm text-gray-600 dark:text-gray-300 font-medium">Dosya seçmek için tıkla</div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">PDF, JPG, PNG, WEBP — Maks. 10 MB</div>
            </div>
          )}
        </div>
      </div>

      {/* Tip */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Belge Türü *</label>
        <div className="flex gap-2">
          {[
            { value: 'dekont', label: 'Dekont / EFT Makbuzu' },
            { value: 'fatura_pdf', label: 'Fatura PDF' },
            { value: 'diger', label: 'Diğer' },
          ].map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setDocumentType(opt.value)}
              className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                documentType === opt.value
                  ? 'bg-[#C8102E] text-white border-[#C8102E]'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-gray-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Müşteri */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Müşteri</label>
          <select
            value={customerId}
            onChange={e => { setCustomerId(e.target.value); setInvoiceId('') }}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]/20 focus:border-[#C8102E]"
          >
            <option value="">— Seçiniz —</option>
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.full_name}</option>
            ))}
          </select>
        </div>

        {/* İlgili Fatura */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
            İlgili Fatura
            {documentType === 'dekont' && <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">(dekontu faturaya bağla)</span>}
          </label>
          <select
            value={invoiceId}
            onChange={e => setInvoiceId(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]/20 focus:border-[#C8102E]"
          >
            <option value="">— Seçiniz —</option>
            {filteredInvoices.map(inv => (
              <option key={inv.id} value={inv.id}>
                {inv.invoice_number} — Kalan: {formatCur(inv.total_amount - inv.paid_amount)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tutar */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
          Tutarı
          {documentType === 'dekont' && <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">(dekonttaki ödeme tutarı)</span>}
        </label>
        <div className="relative">
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0,00"
            className="w-full border rounded-lg px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]/20 focus:border-[#C8102E]"
          />
          <span className="absolute right-3 top-2 text-sm text-gray-400 dark:text-gray-500">₺</span>
        </div>
      </div>

      {/* Not */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Not</label>
        <input
          type="text"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="İsteğe bağlı not..."
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]/20 focus:border-[#C8102E]"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={loading || !file}
          className="flex-1 bg-[#C8102E] text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[#a50d26] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Yükleniyor...' : 'Yükle ve İşleme Geç'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2.5 border rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50"
        >
          İptal
        </button>
      </div>
    </form>
  )
}
