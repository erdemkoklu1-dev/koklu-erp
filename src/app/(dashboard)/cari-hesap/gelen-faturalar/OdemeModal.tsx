'use client'
import { useState } from 'react'
import { formatCurrency } from '@/lib/finance/formatters'

type Props = {
  invoiceId: string
  invoiceNumber: string
  supplierName: string | null
  kalan: number
  onSuccess: () => void
  onClose: () => void
}

export default function OdemeModal({ invoiceId, invoiceNumber, supplierName, kalan, onSuccess, onClose }: Props) {
  const today = new Date().toISOString().split('T')[0]

  const [form, setForm] = useState({
    payment_date: today,
    amount: String(kalan.toFixed(2)),
    method: 'havale_eft',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amt = parseFloat(form.amount)
    if (!amt || amt <= 0) { setError('Geçerli bir tutar girin.'); return }
    setLoading(true); setError('')

    const res = await fetch('/api/odeme-kaydet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invoice_id: invoiceId,
        amount: amt,
        payment_date: form.payment_date,
        method: form.method,
      }),
    })

    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Kayıt hatası'); setLoading(false); return }

    setLoading(false)
    onSuccess()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-green-600 px-5 py-4">
          <div className="text-white font-semibold text-sm">{supplierName ?? 'Tedarikçi'}</div>
          <div className="text-green-100 text-xs font-mono mt-0.5">{invoiceNumber}</div>
          <div className="text-green-50 text-xs mt-1">
            Kalan borç: <strong>{formatCurrency(kalan)}</strong>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-600">Ödeme Tarihi</label>
            <input
              type="date"
              value={form.payment_date}
              onChange={e => setForm(p => ({ ...p, payment_date: e.target.value }))}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">Tutar (₺) <span className="text-red-500">*</span></label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={form.amount}
              onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            {parseFloat(form.amount) < kalan && parseFloat(form.amount) > 0 && (
              <p className="text-xs text-orange-500 mt-1">Kısmi ödeme — kalan: {formatCurrency(kalan - parseFloat(form.amount))}</p>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">Ödeme Yöntemi</label>
            <select
              value={form.method}
              onChange={e => setForm(p => ({ ...p, method: e.target.value }))}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
            >
              <option value="nakit">Nakit</option>
              <option value="havale_eft">Havale / EFT</option>
              <option value="kredi_karti">Kredi Kartı</option>
              <option value="cek">Çek</option>
              <option value="senet">Senet</option>
            </select>
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-green-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
            >
              {loading ? 'Kaydediliyor...' : 'Ödemeyi Kaydet'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              İptal
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
