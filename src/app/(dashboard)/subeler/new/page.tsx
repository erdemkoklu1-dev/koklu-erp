'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { TURKEY_PROVINCES } from '@/lib/turkey-provinces'

const TIP_SECENEKLERI = [
  { value: 'merkez', label: 'Merkez' },
  { value: 'sube',   label: 'Şube' },
  { value: 'depo',   label: 'Depo' },
  { value: 'ofis',   label: 'Ofis' },
]

export default function YeniSubePage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    ad: '', tip: 'sube', sehir: '', ilce: '', adres: '',
    posta_kodu: '', telefon: '', email: '',
    yetkili_kisi: '', yetkili_telefon: '',
    acilis_tarihi: '', notlar: '', aktif: true,
  })

  function set(k: string, v: any) { setForm(p => ({ ...p, [k]: v })) }
  const inp = 'mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.ad.trim()) { setError('Şube adı zorunludur.'); return }
    setLoading(true); setError('')
    const payload = {
      ...form,
      sehir: form.sehir || null,
      ilce: form.ilce || null,
      adres: form.adres || null,
      posta_kodu: form.posta_kodu || null,
      telefon: form.telefon || null,
      email: form.email || null,
      yetkili_kisi: form.yetkili_kisi || null,
      yetkili_telefon: form.yetkili_telefon || null,
      acilis_tarihi: form.acilis_tarihi || null,
      notlar: form.notlar || null,
    }
    const { error: err } = await supabase.from('subeler').insert([payload])
    if (err) { setError('Hata: ' + err.message); setLoading(false) }
    else router.push('/subeler')
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-700">
      <div className="bg-white dark:bg-gray-800 border-b px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 bg-[#C8102E] rounded-lg flex items-center justify-center text-white font-bold text-sm">K</div>
        <Link href="/subeler" className="text-gray-500 dark:text-gray-400 hover:text-gray-700 text-sm">← Şubeler</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Yeni Şube</h1>
      </div>
      <div className="p-6 max-w-2xl mx-auto">
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 border rounded-xl p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Şube Adı *</label>
              <input value={form.ad} onChange={e => set('ad', e.target.value)} className={inp} placeholder="Erzincan Merkez" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Tip</label>
              <select value={form.tip} onChange={e => set('tip', e.target.value)} className={inp}>
                {TIP_SECENEKLERI.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Açılış Tarihi</label>
              <input type="date" value={form.acilis_tarihi} onChange={e => set('acilis_tarihi', e.target.value)} className={inp} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">İl</label>
              <select value={form.sehir} onChange={e => set('sehir', e.target.value)} className={inp + ' bg-white dark:bg-gray-800'}>
                <option value="">— Seçiniz</option>
                {TURKEY_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">İlçe</label>
              <input value={form.ilce} onChange={e => set('ilce', e.target.value)} className={inp} />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Adres</label>
              <textarea value={form.adres} onChange={e => set('adres', e.target.value)} rows={2} className={inp + ' resize-none'} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Telefon</label>
              <input value={form.telefon} onChange={e => set('telefon', e.target.value)} className={inp} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">E-posta</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} className={inp} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Yetkili Kişi</label>
              <input value={form.yetkili_kisi} onChange={e => set('yetkili_kisi', e.target.value)} className={inp} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Yetkili Telefonu</label>
              <input value={form.yetkili_telefon} onChange={e => set('yetkili_telefon', e.target.value)} className={inp} />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Notlar</label>
              <textarea value={form.notlar} onChange={e => set('notlar', e.target.value)} rows={2} className={inp + ' resize-none'} />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Aktif</label>
              <div onClick={() => set('aktif', !form.aktif)}
                className={`relative w-10 h-5 rounded-full cursor-pointer transition-colors ${form.aktif ? 'bg-[#C8102E]' : 'bg-gray-300'}`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white dark:bg-gray-800 rounded-full shadow transition-all ${form.aktif ? 'left-5' : 'left-0.5'}`} />
              </div>
            </div>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="flex-1 bg-[#C8102E] text-white py-2 rounded-lg font-medium hover:bg-[#a50d26] disabled:opacity-50">
              {loading ? 'Kaydediliyor...' : 'Şubeyi Kaydet'}
            </button>
            <Link href="/subeler" className="px-6 py-2 border rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 text-center">İptal</Link>
          </div>
        </form>
      </div>
    </div>
  )
}
