'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { applyKdv } from '@/lib/finance/calculations'
import { formatCurrency } from '@/lib/finance/formatters'
import { Suspense } from 'react'

function NewIslemForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [categories, setCategories] = useState<any[]>([])

  const [form, setForm] = useState({
    direction: searchParams.get('direction') ?? 'gider',
    category_id: '',
    transaction_date: new Date().toISOString().split('T')[0],
    amount: '',
    kdv_included: false,
    kdv_rate: '0',
    description: '',
    payment_method: 'nakit',
    reference_no: '',
    notes: '',
  })

  useEffect(() => {
    supabase.from('expense_categories').select('id, name, direction')
      .eq('is_active', true).order('sort_order')
      .then(({ data }: { data: any }) => setCategories(data ?? []))
  }, [])

  const filteredCats = categories.filter(c => c.direction === form.direction)

  const netAmount = parseFloat(form.amount) || 0
  const { kdv_amount, gross_amount } = applyKdv(
    form.kdv_included ? netAmount / (1 + (parseFloat(form.kdv_rate) || 0) / 100) : netAmount,
    parseFloat(form.kdv_rate) || 0
  )
  const displayAmount = form.kdv_included ? netAmount : gross_amount

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.category_id) { setError('Kategori seçin.'); return }
    if (!form.amount || parseFloat(form.amount) <= 0) { setError('Geçerli bir tutar girin.'); return }
    if (!form.description.trim()) { setError('Açıklama zorunludur.'); return }
    setLoading(true); setError('')

    const kdvRate = parseFloat(form.kdv_rate) || 0
    const rawAmount = parseFloat(form.amount) || 0
    let net: number, kdv: number

    if (form.kdv_included) {
      net = rawAmount / (1 + kdvRate / 100)
      kdv = rawAmount - net
    } else {
      net = rawAmount
      kdv = rawAmount * (kdvRate / 100)
    }

    const { error: err } = await supabase.from('transactions').insert([{
      direction: form.direction,
      category_id: form.category_id,
      transaction_date: form.transaction_date,
      amount: rawAmount,
      kdv_included: form.kdv_included,
      kdv_rate: kdvRate,
      kdv_amount: Math.round(kdv * 100) / 100,
      net_amount: Math.round(net * 100) / 100,
      description: form.description,
      payment_method: form.payment_method,
      reference_no: form.reference_no || null,
      notes: form.notes || null,
    }])

    if (err) { setError(err.message); setLoading(false); return }
    router.push('/cari-hesap/gelir-gider')
  }

  return (
    <div className="p-6 max-w-xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/cari-hesap/gelir-gider" className="text-sm text-gray-500 hover:text-gray-700">← Gelir / Gider</Link>
        <span className="text-gray-300">/</span>
        <h2 className="text-base font-semibold text-gray-900">Yeni İşlem</h2>
      </div>

      <form onSubmit={handleSubmit} className="bg-white border rounded-xl p-5 space-y-4">

        {/* Tip seçimi */}
        <div className="flex gap-2">
          {(['gelir', 'gider'] as const).map(d => (
            <button key={d} type="button"
              onClick={() => setForm(p => ({ ...p, direction: d, category_id: '' }))}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
                form.direction === d
                  ? d === 'gelir' ? 'bg-green-600 text-white border-green-600' : 'bg-red-600 text-white border-red-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}>
              {d === 'gelir' ? '+ Gelir' : '− Gider'}
            </button>
          ))}
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Kategori <span className="text-red-500">*</span></label>
          <select value={form.category_id} onChange={e => setForm(p => ({ ...p, category_id: e.target.value }))}
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white">
            <option value="">— Kategori seçin</option>
            {filteredCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Açıklama <span className="text-red-500">*</span></label>
          <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
            placeholder="İşlem açıklaması..." />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Tarih</label>
            <input type="date" value={form.transaction_date}
              onChange={e => setForm(p => ({ ...p, transaction_date: e.target.value }))}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Ödeme Yöntemi</label>
            <select value={form.payment_method} onChange={e => setForm(p => ({ ...p, payment_method: e.target.value }))}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white">
              <option value="nakit">Nakit</option>
              <option value="havale_eft">Havale / EFT</option>
              <option value="kredi_karti">Kredi Kartı</option>
              <option value="cek">Çek</option>
              <option value="senet">Senet</option>
              <option value="diger">Diğer</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Tutar (₺) <span className="text-red-500">*</span></label>
            <input type="number" step="0.01" min="0.01" value={form.amount}
              onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
              placeholder="0,00" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">KDV Oranı (%)</label>
            <select value={form.kdv_rate} onChange={e => setForm(p => ({ ...p, kdv_rate: e.target.value }))}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white">
              <option value="0">KDV Yok</option>
              <option value="10">%10</option>
              <option value="20">%20</option>
            </select>
          </div>
        </div>

        {parseFloat(form.kdv_rate) > 0 && (
          <div className="flex items-center gap-2">
            <input type="checkbox" id="kdv_inc" checked={form.kdv_included}
              onChange={e => setForm(p => ({ ...p, kdv_included: e.target.checked }))}
              className="rounded border-gray-300 text-[#C8102E]" />
            <label htmlFor="kdv_inc" className="text-sm text-gray-700">Girilen tutar KDV dahil</label>
            {form.amount && parseFloat(form.amount) > 0 && (
              <span className="ml-auto text-xs text-gray-400">
                KDV: {formatCurrency(kdv_amount)} · Net: {formatCurrency(Math.round((parseFloat(form.amount) / (1 + (parseFloat(form.kdv_rate) / 100))) * 100) / 100)}
              </span>
            )}
          </div>
        )}

        <div>
          <label className="text-sm font-medium text-gray-700">Referans No</label>
          <input value={form.reference_no} onChange={e => setForm(p => ({ ...p, reference_no: e.target.value }))}
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
            placeholder="Makbuz, fatura veya banka ref no..." />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Notlar</label>
          <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2}
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading}
            className="flex-1 bg-[#C8102E] text-white py-2.5 rounded-lg font-semibold hover:bg-[#a50d26] disabled:opacity-50">
            {loading ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
          <Link href="/cari-hesap/gelir-gider"
            className="px-6 py-2.5 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 text-center">
            İptal
          </Link>
        </div>
      </form>
    </div>
  )
}

export default function NewIslemPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-400 text-sm">Yükleniyor...</div>}>
      <NewIslemForm />
    </Suspense>
  )
}
