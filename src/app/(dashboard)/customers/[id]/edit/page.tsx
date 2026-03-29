'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const supabase = createClient()
  const [id, setId] = useState('')
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    full_name: '', type: 'company', tax_number: '',
    phone: '', email: '', address: '', notes: '',
  })

  useEffect(() => {
    async function load() {
      const { id: resolvedId } = await params
      setId(resolvedId)
      const { data } = await supabase.from('customers').select('*').eq('id', resolvedId).single()
      if (data) setForm({
        full_name: data.full_name ?? '',
        type: data.type ?? 'company',
        tax_number: data.tax_number ?? '',
        phone: data.phone ?? '',
        email: data.email ?? '',
        address: data.address ?? '',
        notes: data.notes ?? '',
      })
      setFetching(false)
    }
    load()
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name.trim()) { setError('Müşteri adı zorunlu.'); return }
    setLoading(true); setError('')
    const { error } = await supabase.from('customers').update({
      ...form, updated_at: new Date().toISOString()
    }).eq('id', id)
    if (error) { setError('Güncelleme hatası: ' + error.message); setLoading(false) }
    else router.push(`/customers/${id}`)
  }

  if (fetching) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-400 text-sm">Yükleniyor...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 bg-[#C8102E] rounded-lg flex items-center justify-center text-white font-bold text-sm">K</div>
        <Link href={`/customers/${id}`} className="text-gray-500 hover:text-gray-700 text-sm">← Müşteri Detayı</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-lg font-bold text-gray-900">Müşteri Düzenle</h1>
      </div>

      <div className="p-6 max-w-2xl mx-auto">
        <form onSubmit={handleSubmit} className="bg-white border rounded-lg p-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Müşteri Türü</label>
            <select name="type" value={form.type} onChange={handleChange}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
              <option value="company">Firma</option>
              <option value="individual">Bireysel</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">
              {form.type === 'company' ? 'Firma Adı' : 'Ad Soyad'} <span className="text-red-500">*</span>
            </label>
            <input name="full_name" value={form.full_name} onChange={handleChange}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">
              {form.type === 'company' ? 'Vergi Numarası' : 'TC Kimlik No'}
            </label>
            <input name="tax_number" value={form.tax_number} onChange={handleChange}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Telefon</label>
              <input name="phone" value={form.phone} onChange={handleChange}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">E-posta</label>
              <input name="email" type="email" value={form.email} onChange={handleChange}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Adres</label>
            <input name="address" value={form.address} onChange={handleChange}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">Notlar</label>
            <textarea name="notes" value={form.notes} onChange={handleChange} rows={3}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading}
              className="flex-1 bg-[#C8102E] text-white py-2 rounded-lg font-medium hover:bg-[#a50d26] disabled:opacity-50 transition-colors">
              {loading ? 'Kaydediliyor...' : '💾 Güncelle'}
            </button>
            <Link href={`/customers/${id}`}
              className="px-6 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors text-center">
              İptal
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}