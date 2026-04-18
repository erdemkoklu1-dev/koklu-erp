'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Props =
  | { mode: 'add-button'; categories: any[]; expense?: never }
  | { mode: 'edit-button'; categories: any[]; expense: any }

const PERIODS = [
  { value: 'aylik', label: 'Aylık' },
  { value: 'ucaylik', label: '3 Aylık' },
  { value: 'altiaylik', label: '6 Aylık' },
  { value: 'yillik', label: 'Yıllık' },
]

function empty() {
  return {
    category_id: '', name: '', amount: '', kdv_rate: '0',
    period: 'aylik', day_of_month: '1',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '', notes: '',
  }
}

export default function SabitGiderlerClient({ mode, categories, expense }: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState(
    expense ? {
      category_id: expense.category_id ?? '',
      name: expense.name ?? '',
      amount: String(expense.amount ?? ''),
      kdv_rate: String(expense.kdv_rate ?? '0'),
      period: expense.period ?? 'aylik',
      day_of_month: String(expense.day_of_month ?? '1'),
      start_date: expense.start_date ?? new Date().toISOString().split('T')[0],
      end_date: expense.end_date ?? '',
      notes: expense.notes ?? '',
    } : empty()
  )
  const router = useRouter()

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.category_id) { setError('Kategori seçin.'); return }
    if (!form.name.trim()) { setError('Gider adı zorunludur.'); return }
    if (!form.amount || parseFloat(form.amount) <= 0) { setError('Tutar zorunludur.'); return }
    setLoading(true); setError('')

    const payload = {
      category_id: form.category_id,
      name: form.name,
      amount: parseFloat(form.amount),
      kdv_rate: parseFloat(form.kdv_rate) || 0,
      period: form.period,
      day_of_month: parseInt(form.day_of_month) || 1,
      start_date: form.start_date,
      end_date: form.end_date || null,
      notes: form.notes || null,
      is_active: true,
    }

    let res: Response
    if (mode === 'edit-button' && expense) {
      res = await fetch('/api/sabit-gider', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: expense.id, ...payload }),
      })
    } else {
      res = await fetch('/api/sabit-gider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    }

    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Kayıt hatası'); setLoading(false); return }
    setOpen(false); router.refresh()
  }

  async function handleDelete() {
    if (!expense) return
    if (!confirm('Bu sabit gideri silmek istediğinizden emin misiniz?')) return
    await fetch('/api/sabit-gider', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: expense.id }),
    })
    router.refresh()
  }

  return (
    <>
      {mode === 'add-button' ? (
        <button onClick={() => setOpen(true)}
          className="bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26]">
          + Sabit Gider Ekle
        </button>
      ) : (
        <div className="flex gap-1">
          <button onClick={() => setOpen(true)}
            className="text-xs text-gray-400 hover:text-[#C8102E] px-2 py-1 border rounded hover:border-[#C8102E]">
            Düzenle
          </button>
          <button onClick={handleDelete}
            className="text-xs text-red-400 hover:text-red-600 px-2 py-1 border border-transparent hover:border-red-200 rounded">
            Sil
          </button>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">
                {mode === 'edit-button' ? 'Sabit Gider Düzenle' : 'Yeni Sabit Gider'}
              </h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700">Kategori</label>
                <select value={form.category_id} onChange={e => setForm(p => ({ ...p, category_id: e.target.value }))}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white">
                  <option value="">— Seçin</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Gider Adı</label>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                  placeholder="örn: Ofis Kirası" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Tutar (₺)</label>
                  <input type="number" step="0.01" min="0.01" value={form.amount}
                    onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Periyot</label>
                  <select value={form.period} onChange={e => setForm(p => ({ ...p, period: e.target.value }))}
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white">
                    {PERIODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Ayın Kaçında?</label>
                  <input type="number" min="1" max="28" value={form.day_of_month}
                    onChange={e => setForm(p => ({ ...p, day_of_month: e.target.value }))}
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Başlangıç</label>
                  <input type="date" value={form.start_date}
                    onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))}
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Bitiş (opsiyonel)</label>
                  <input type="date" value={form.end_date}
                    onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))}
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Not</label>
                <input value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                  placeholder="Opsiyonel not..." />
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={loading}
                  className="flex-1 bg-[#C8102E] text-white py-2 rounded-lg font-medium hover:bg-[#a50d26] disabled:opacity-50">
                  {loading ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
                <button type="button" onClick={() => setOpen(false)}
                  className="px-5 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                  İptal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
