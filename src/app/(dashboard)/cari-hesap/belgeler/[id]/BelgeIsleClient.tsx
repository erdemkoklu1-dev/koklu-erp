'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Invoice = { id: string; invoice_number: string; total_amount: number; paid_amount: number }

export default function BelgeIsleClient({
  documentId,
  defaultInvoiceId,
  defaultAmount,
  invoices,
}: {
  documentId: string
  defaultInvoiceId: string | null
  defaultAmount: number | null
  invoices: Invoice[]
}) {
  const router = useRouter()
  const [invoiceId, setInvoiceId] = useState(defaultInvoiceId ?? '')
  const [amount, setAmount] = useState(defaultAmount?.toString() ?? '')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0])
  const [method, setMethod] = useState('havale_eft')
  const [referenceNo, setReferenceNo] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const selectedInvoice = invoices.find(inv => inv.id === invoiceId)
  const kalan = selectedInvoice ? selectedInvoice.total_amount - selectedInvoice.paid_amount : null

  const formatCur = (n: number) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(n)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!invoiceId) { setError('Lütfen bir fatura seçin'); return }
    if (!amount || parseFloat(amount) <= 0) { setError('Geçerli bir tutar girin'); return }
    setLoading(true)
    setError('')

    try {
      const res = await fetch(`/api/documents/${documentId}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoiceId,
          amount: parseFloat(amount),
          payment_date: paymentDate,
          method,
          reference_no: referenceNo || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'İşlem başarısız'); return }
      router.push(`/cari-hesap/faturalar/${invoiceId}`)
    } catch {
      setError('Beklenmeyen hata oluştu')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      {/* Fatura seç */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Hangi Faturaya Ödeme? *</label>
        <select
          value={invoiceId}
          onChange={e => {
            setInvoiceId(e.target.value)
            const inv = invoices.find(i => i.id === e.target.value)
            if (inv && !amount) setAmount((inv.total_amount - inv.paid_amount).toFixed(2))
          }}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]/20 focus:border-[#C8102E]"
        >
          <option value="">— Fatura seçin —</option>
          {invoices.map(inv => (
            <option key={inv.id} value={inv.id}>
              {inv.invoice_number} — Kalan: {formatCur(inv.total_amount - inv.paid_amount)}
            </option>
          ))}
        </select>
        {selectedInvoice && (
          <div className="text-xs text-gray-400 mt-1">
            Fatura toplamı: {formatCur(selectedInvoice.total_amount)} · Ödenen: {formatCur(selectedInvoice.paid_amount)} · Kalan: {formatCur(kalan!)}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Tutar */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Ödeme Tutarı *</label>
          <div className="relative">
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]/20 focus:border-[#C8102E]"
            />
            <span className="absolute right-3 top-2 text-sm text-gray-400">₺</span>
          </div>
          {kalan && amount && parseFloat(amount) > kalan && (
            <div className="text-xs text-orange-600 mt-1">Tutar kalan bakiyeyi ({formatCur(kalan)}) aşıyor</div>
          )}
        </div>

        {/* Tarih */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Ödeme Tarihi *</label>
          <input
            type="date"
            required
            value={paymentDate}
            onChange={e => setPaymentDate(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]/20 focus:border-[#C8102E]"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Ödeme yöntemi */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Ödeme Yöntemi</label>
          <select
            value={method}
            onChange={e => setMethod(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]/20 focus:border-[#C8102E]"
          >
            <option value="havale_eft">Havale / EFT</option>
            <option value="nakit">Nakit</option>
            <option value="kredi_karti">Kredi Kartı</option>
            <option value="cek">Çek</option>
            <option value="senet">Senet</option>
            <option value="diger">Diğer</option>
          </select>
        </div>

        {/* Referans No */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Referans / Dekont No</label>
          <input
            type="text"
            value={referenceNo}
            onChange={e => setReferenceNo(e.target.value)}
            placeholder="Opsiyonel"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]/20 focus:border-[#C8102E]"
          />
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
        >
          {loading ? 'İşleniyor...' : 'Ödemeyi Onayla ve Kaydet'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-4 py-2.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
        >
          İptal
        </button>
      </div>
    </form>
  )
}
