'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

export default function EditIslemPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState('')
  const [categories, setCategories] = useState<any[]>([])
  const [form, setForm] = useState({
    direction: 'gider', category_id: '', transaction_date: '',
    amount: '', kdv_rate: '0', description: '', payment_method: 'nakit',
    reference_no: '', notes: '',
  })

  useEffect(() => {
    Promise.all([
      supabase.from('expense_categories').select('id, name, direction').eq('is_active', true).order('sort_order'),
      supabase.from('transactions').select('*').eq('id', id).single(),
    ]).then(([{ data: cats }, { data: txn }]) => {
      setCategories(cats ?? [])
      if (txn) {
        setForm({
          direction: txn.direction ?? 'gider',
          category_id: txn.category_id ?? '',
          transaction_date: txn.transaction_date ?? '',
          amount: String(txn.amount ?? ''),
          kdv_rate: String(txn.kdv_rate ?? '0'),
          description: txn.description ?? '',
          payment_method: txn.payment_method ?? 'nakit',
          reference_no: txn.reference_no ?? '',
          notes: txn.notes ?? '',
        })
      }
      setFetching(false)
    })
  }, [id])

  const filteredCats = categories.filter(c => c.direction === form.direction)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.category_id) { setError('Kategori seçin.'); return }
    if (!form.amount || parseFloat(form.amount) <= 0) { setError('Geçerli bir tutar girin.'); return }
    setLoading(true); setError('')

    const kdvRate = parseFloat(form.kdv_rate) || 0
    const rawAmount = parseFloat(form.amount) || 0
    const kdv = rawAmount * (kdvRate / 100)

    const { error: err } = await supabase.from('transactions').update({
      direction: form.direction,
      category_id: form.category_id,
      transaction_date: form.transaction_date,
      amount: rawAmount,
      kdv_rate: kdvRate,
      kdv_amount: Math.round(kdv * 100) / 100,
      net_amount: rawAmount,
      description: form.description,
      payment_method: form.payment_method,
      reference_no: form.reference_no || null,
      notes: form.notes || null,
    }).eq('id', id)

    if (err) { setError(err.message); setLoading(false); return }
    router.push('/cari-hesap/gelir-gider')
  }

  async function handleDelete() {
    if (!confirm('Bu işlemi silmek istediğinizden emin misiniz?')) return
    await supabase.from('transactions').delete().eq('id', id)
    router.push('/cari-hesap/gelir-gider')
  }

  if (fetching) return <div className="p-6 text-gray-400 dark:text-gray-500 text-sm">Yükleniyor...</div>

  return (
    <div className="p-6 max-w-xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/cari-hesap/gelir-gider" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700">← Gelir / Gider</Link>
          <span className="text-gray-300">/</span>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">İşlem Düzenle</h2>
        </div>
        <button onClick={handleDelete}
          className="text-sm text-red-500 hover:text-red-700 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50">
          Sil
        </button>
      </div>

      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 border rounded-xl p-5 space-y-4">
        <div className="flex gap-2">
          {(['gelir', 'gider'] as const).map(d => (
            <button key={d} type="button"
              onClick={() => setForm(p => ({ ...p, direction: d, category_id: '' }))}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border transition-colors ${
                form.direction === d
                  ? d === 'gelir' ? 'bg-green-600 text-white border-green-600' : 'bg-red-600 text-white border-red-600'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50'
              }`}>
              {d === 'gelir' ? '+ Gelir' : '− Gider'}
            </button>
          ))}
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Kategori</label>
          <select value={form.category_id} onChange={e => setForm(p => ({ ...p, category_id: e.target.value }))}
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white dark:bg-gray-800">
            <option value="">— Kategori seçin</option>
            {filteredCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Açıklama</label>
          <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Tarih</label>
            <input type="date" value={form.transaction_date}
              onChange={e => setForm(p => ({ ...p, transaction_date: e.target.value }))}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Ödeme Yöntemi</label>
            <select value={form.payment_method} onChange={e => setForm(p => ({ ...p, payment_method: e.target.value }))}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white dark:bg-gray-800">
              <option value="nakit">Nakit</option>
              <option value="havale_eft">Havale / EFT</option>
              <option value="kredi_karti">Kredi Kartı</option>
              <option value="cek">Çek</option>
              <option value="senet">Senet</option>
              <option value="diger">Diğer</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Tutar (₺)</label>
            <input type="number" step="0.01" min="0.01" value={form.amount}
              onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">KDV Oranı (%)</label>
            <select value={form.kdv_rate} onChange={e => setForm(p => ({ ...p, kdv_rate: e.target.value }))}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white dark:bg-gray-800">
              <option value="0">KDV Yok</option>
              <option value="10">%10</option>
              <option value="20">%20</option>
            </select>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Referans No</label>
          <input value={form.reference_no} onChange={e => setForm(p => ({ ...p, reference_no: e.target.value }))}
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Notlar</label>
          <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2}
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading}
            className="flex-1 bg-[#C8102E] text-white py-2.5 rounded-lg font-semibold hover:bg-[#a50d26] disabled:opacity-50">
            {loading ? 'Kaydediliyor...' : 'Güncelle'}
          </button>
          <Link href="/cari-hesap/gelir-gider"
            className="px-6 py-2.5 border rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 text-center">
            İptal
          </Link>
        </div>
      </form>
    </div>
  )
}
