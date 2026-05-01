'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { formatCurrency } from '@/lib/finance/formatters'

const BIRIMLER = ['adet', 'kg', 'metre', 'saat', 'iş']

export default function EditOnKayitPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const supabase = createClient()

  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState('')
  const [isFaturalanmis, setIsFaturalanmis] = useState(false)

  const [form, setForm] = useState({
    kayit_tarihi: '',
    aciklama: '',
    miktar: '1',
    birim: 'adet',
    birim_fiyat: '',
    notlar: '',
  })

  useEffect(() => {
    supabase.from('on_kayitlar').select('*').eq('id', id).single()
      .then(({ data }: { data: any }) => {
        if (data) {
          setIsFaturalanmis(data.durum === 'faturalanmadi')
          setForm({
            kayit_tarihi: data.kayit_tarihi ?? '',
            aciklama: data.aciklama ?? '',
            miktar: String(data.miktar ?? 1),
            birim: data.birim ?? 'adet',
            birim_fiyat: String(data.birim_fiyat ?? ''),
            notlar: data.notlar ?? '',
          })
        }
        setFetching(false)
      })
  }, [id])

  const toplam = (parseFloat(form.miktar) || 0) * (parseFloat(form.birim_fiyat) || 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.aciklama.trim()) { setError('Açıklama zorunludur.'); return }
    if (!form.kayit_tarihi) { setError('Tarih zorunludur.'); return }
    if (parseFloat(form.birim_fiyat) <= 0) { setError('Birim fiyat sıfırdan büyük olmalıdır.'); return }

    setLoading(true); setError('')

    const { error: err } = await supabase.from('on_kayitlar').update({
      kayit_tarihi: form.kayit_tarihi,
      aciklama: form.aciklama.trim(),
      miktar: parseFloat(form.miktar) || 1,
      birim: form.birim,
      birim_fiyat: parseFloat(form.birim_fiyat) || 0,
      toplam_tutar: toplam,
      notlar: form.notlar.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq('id', id)

    if (err) { setError(err.message); setLoading(false); return }
    router.push('/cari-hesap/on-kayitlar')
  }

  async function handleDelete() {
    if (!confirm('Bu ön kaydı silmek istediğinizden emin misiniz?')) return
    const { error: err } = await supabase.from('on_kayitlar').delete().eq('id', id)
    if (err) { setError(err.message); return }
    router.push('/cari-hesap/on-kayitlar')
  }

  if (fetching) return <div className="p-6 text-gray-400 dark:text-gray-500 text-sm">Yükleniyor...</div>

  return (
    <div className="p-6 max-w-xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/cari-hesap/on-kayitlar" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700">← Ön Kayıtlar</Link>
          <span className="text-gray-300">/</span>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Ön Kayıt Düzenle</h2>
        </div>
        <button onClick={handleDelete}
          className="text-sm text-red-500 hover:text-red-700 border border-red-200 px-3 py-1.5 rounded-lg hover:bg-red-50">
          Sil
        </button>
      </div>

      {isFaturalanmis && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
          Bu kayıt faturalandırılmış. Düzenleyebilirsiniz ancak fatura kalemlerini etkilemez.
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 border rounded-xl p-5 space-y-4">

        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Tarih <span className="text-red-500">*</span></label>
          <input type="date" value={form.kayit_tarihi}
            onChange={e => setForm(p => ({ ...p, kayit_tarihi: e.target.value }))}
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Açıklama <span className="text-red-500">*</span></label>
          <input value={form.aciklama}
            onChange={e => setForm(p => ({ ...p, aciklama: e.target.value }))}
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
            placeholder="Ürün / hizmet adı" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Miktar</label>
            <input type="number" min="0" step="any" value={form.miktar}
              onChange={e => setForm(p => ({ ...p, miktar: e.target.value }))}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Birim</label>
            <select value={form.birim} onChange={e => setForm(p => ({ ...p, birim: e.target.value }))}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white dark:bg-gray-800">
              {BIRIMLER.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Birim Fiyat (₺)</label>
            <input type="number" min="0" step="0.01" value={form.birim_fiyat}
              onChange={e => setForm(p => ({ ...p, birim_fiyat: e.target.value }))}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
              placeholder="0,00" />
          </div>
        </div>

        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg px-4 py-2.5 flex justify-between items-center">
          <span className="text-sm text-gray-600 dark:text-gray-300">Toplam Tutar</span>
          <span className="text-base font-bold text-[#C8102E]">{formatCurrency(toplam)}</span>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Notlar</label>
          <textarea value={form.notlar} onChange={e => setForm(p => ({ ...p, notlar: e.target.value }))} rows={2}
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
            placeholder="Opsiyonel not..." />
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading}
            className="flex-1 bg-[#C8102E] text-white py-2.5 rounded-lg font-semibold hover:bg-[#a50d26] disabled:opacity-50">
            {loading ? 'Kaydediliyor...' : 'Güncelle'}
          </button>
          <Link href="/cari-hesap/on-kayitlar"
            className="px-6 py-2.5 border rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 text-center">
            İptal
          </Link>
        </div>
      </form>
    </div>
  )
}
