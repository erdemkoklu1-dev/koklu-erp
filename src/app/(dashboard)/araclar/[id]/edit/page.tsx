'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

export default function EditAraciPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    full_name: '',
    company_name: '',
    phone: '',
    email: '',
    notes: '',
  })

  useEffect(() => {
    let cancelled = false
    supabase.from('brokers').select('*').eq('id', id).single()
      .then(({ data, error }: { data: any; error: any }) => {
        if (cancelled) return
        if (error) { console.error('Aracı yüklenemedi:', error); setFetching(false); return }
        if (data) setForm({
          full_name: data.full_name ?? '',
          company_name: data.company_name ?? '',
          phone: data.phone ?? '',
          email: data.email ?? '',
          notes: data.notes ?? '',
        })
        setFetching(false)
      })
    return () => { cancelled = true }
  }, [id])

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name.trim()) { setError('Ad soyad zorunludur.'); return }
    setLoading(true)
    setError('')
    const { error } = await supabase.from('brokers').update({
      full_name: form.full_name.trim(),
      company_name: form.company_name.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) {
      setError('Güncelleme hatası: ' + error.message)
      setLoading(false)
    } else {
      router.push(`/araclar/${id}`)
    }
  }

  if (fetching) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-400 text-sm">Yükleniyor...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4 flex items-center gap-3 sticky top-0 z-10">
        <div className="w-8 h-8 bg-[#C8102E] rounded-lg flex items-center justify-center text-white font-bold text-sm">K</div>
        <Link href={`/araclar/${id}`} className="text-gray-500 hover:text-gray-700 text-sm">← Aracı Detayı</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-lg font-bold text-gray-900">Aracı Düzenle</h1>
      </div>

      <div className="p-6 max-w-xl mx-auto">
        <form onSubmit={handleSubmit} className="bg-white border rounded-lg p-6 space-y-5">

          <div>
            <label className="text-sm font-medium text-gray-700">Ad Soyad <span className="text-red-500">*</span></label>
            <input name="full_name" value={form.full_name} onChange={handleChange}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Firma Adı</label>
            <input name="company_name" value={form.company_name} onChange={handleChange}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
              placeholder="Firma adı (opsiyonel)" />
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
            <label className="text-sm font-medium text-gray-700">Notlar</label>
            <textarea name="notes" value={form.notes} onChange={handleChange} rows={3}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading}
              className="flex-1 bg-[#C8102E] text-white py-2 rounded-lg font-medium hover:bg-[#a50d26] disabled:opacity-50 transition-colors">
              {loading ? 'Kaydediliyor...' : 'Güncelle'}
            </button>
            <Link href={`/araclar/${id}`}
              className="px-6 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors text-center">
              İptal
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
