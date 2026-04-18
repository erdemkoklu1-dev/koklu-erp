'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { formatCurrency } from '@/lib/finance/formatters'

export default function OdemeEklePage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const supabase = createClient()

  const [invoice, setInvoice] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    method: 'havale_eft',
    reference_no: '',
    notes: '',
  })

  useEffect(() => {
    supabase.from('invoices').select('*, customers(full_name)').eq('id', id).single()
      .then(({ data }: { data: any }) => {
        setInvoice(data)
        if (data) {
          const kalan = (data.total_amount ?? 0) - (data.paid_amount ?? 0)
          setForm(p => ({ ...p, amount: kalan > 0 ? String(kalan.toFixed(2)) : '' }))
        }
      })
  }, [id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return  // Double tıklamayı engelle
    if (!form.amount || parseFloat(form.amount) <= 0) { setError('Geçerli bir tutar girin.'); return }
    setLoading(true); setError('')

    const { error: payErr } = await supabase.from('payments').insert([{
      invoice_id: id,
      direction: 'tahsilat',
      method: form.method,
      amount: parseFloat(form.amount),
      payment_date: form.payment_date,
      reference_no: form.reference_no || null,
      notes: form.notes || null,
    }])

    if (payErr) {
      setError(payErr.message); setLoading(false); return
    }
    router.push(`/cari-hesap/faturalar/${id}`)
  }

  if (!invoice) return <div className="p-6 text-gray-400 text-sm">Yükleniyor...</div>

  const kalan = (invoice.total_amount ?? 0) - (invoice.paid_amount ?? 0)
  const customer = invoice.customers as any

  return (
    <div className="p-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-5">
        <Link href={`/cari-hesap/faturalar/${id}`} className="text-sm text-gray-500 hover:text-gray-700">← Fatura Detayı</Link>
        <span className="text-gray-300">/</span>
        <h2 className="text-base font-semibold text-gray-900">Ödeme Ekle</h2>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5">
        <div className="text-sm font-semibold text-blue-800">{invoice.invoice_number}</div>
        <div className="text-xs text-blue-600 mt-0.5">{customer?.full_name}</div>
        <div className="flex gap-4 mt-2 text-sm">
          <span className="text-blue-700">Toplam: <strong>{formatCurrency(invoice.total_amount)}</strong></span>
          <span className={`${kalan > 0 ? 'text-orange-700' : 'text-green-700'}`}>
            Kalan: <strong>{formatCurrency(kalan)}</strong>
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border rounded-xl p-5 space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-700">Tutar (₺) <span className="text-red-500">*</span></label>
          <input type="number" step="0.01" min="0.01" value={form.amount}
            onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
            placeholder="0,00" />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700">Ödeme Tarihi</label>
          <input type="date" value={form.payment_date}
            onChange={e => setForm(p => ({ ...p, payment_date: e.target.value }))}
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700">Ödeme Yöntemi</label>
          <select value={form.method} onChange={e => setForm(p => ({ ...p, method: e.target.value }))}
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white">
            <option value="nakit">Nakit</option>
            <option value="havale_eft">Havale / EFT</option>
            <option value="kredi_karti">Kredi Kartı</option>
            <option value="cek">Çek</option>
            <option value="senet">Senet</option>
            <option value="diger">Diğer</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700">Referans No</label>
          <input value={form.reference_no}
            onChange={e => setForm(p => ({ ...p, reference_no: e.target.value }))}
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
            placeholder="Banka referans no, çek no..." />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700">Not</label>
          <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2}
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading}
            className="flex-1 bg-green-600 text-white py-2.5 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50">
            {loading ? 'Kaydediliyor...' : 'Ödemeyi Kaydet'}
          </button>
          <Link href={`/cari-hesap/faturalar/${id}`}
            className="px-6 py-2.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 text-center">
            İptal
          </Link>
        </div>
      </form>
    </div>
  )
}
