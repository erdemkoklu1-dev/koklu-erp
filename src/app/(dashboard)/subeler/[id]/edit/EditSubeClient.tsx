'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { TURKEY_PROVINCES } from '@/lib/turkey-provinces'

type Sube = {
  id: string; ad: string; tip: string; sehir: string | null; ilce: string | null
  adres: string | null; posta_kodu: string | null; telefon: string | null; email: string | null
  yetkili_kisi: string | null; yetkili_telefon: string | null
  acilis_tarihi: string | null; aktif: boolean; notlar: string | null
}

const TIP_SECENEKLERI = [
  { value: 'merkez', label: 'Merkez' },
  { value: 'sube',   label: 'Şube' },
  { value: 'depo',   label: 'Depo' },
  { value: 'ofis',   label: 'Ofis' },
]

export default function EditSubeClient({ sube }: { sube: Sube }) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    ad: sube.ad,
    tip: sube.tip,
    sehir: sube.sehir ?? '',
    ilce: sube.ilce ?? '',
    adres: sube.adres ?? '',
    posta_kodu: sube.posta_kodu ?? '',
    telefon: sube.telefon ?? '',
    email: sube.email ?? '',
    yetkili_kisi: sube.yetkili_kisi ?? '',
    yetkili_telefon: sube.yetkili_telefon ?? '',
    acilis_tarihi: sube.acilis_tarihi ?? '',
    notlar: sube.notlar ?? '',
    aktif: sube.aktif,
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
    const { error: err } = await supabase.from('subeler').update(payload).eq('id', sube.id)
    if (err) { setError('Hata: ' + err.message); setLoading(false) }
    else router.push(`/subeler/${sube.id}`)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 bg-[#C8102E] rounded-lg flex items-center justify-center text-white font-bold text-sm">K</div>
        <Link href={`/subeler/${sube.id}`} className="text-gray-500 hover:text-gray-700 text-sm">← {sube.ad}</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-lg font-bold text-gray-900">Düzenle</h1>
      </div>
      <div className="p-6 max-w-2xl mx-auto">
        <form onSubmit={handleSubmit} className="bg-white border rounded-xl p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700">Şube Adı *</label>
              <input value={form.ad} onChange={e => set('ad', e.target.value)} className={inp} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Tip</label>
              <select value={form.tip} onChange={e => set('tip', e.target.value)} className={inp}>
                {TIP_SECENEKLERI.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Açılış Tarihi</label>
              <input type="date" value={form.acilis_tarihi} onChange={e => set('acilis_tarihi', e.target.value)} className={inp} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">İl</label>
              <select value={form.sehir} onChange={e => set('sehir', e.target.value)} className={inp + ' bg-white'}>
                <option value="">— Seçiniz</option>
                {TURKEY_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">İlçe</label>
              <input value={form.ilce} onChange={e => set('ilce', e.target.value)} className={inp} />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700">Adres</label>
              <textarea value={form.adres} onChange={e => set('adres', e.target.value)} rows={2} className={inp + ' resize-none'} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Telefon</label>
              <input value={form.telefon} onChange={e => set('telefon', e.target.value)} className={inp} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">E-posta</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} className={inp} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Yetkili Kişi</label>
              <input value={form.yetkili_kisi} onChange={e => set('yetkili_kisi', e.target.value)} className={inp} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Yetkili Telefonu</label>
              <input value={form.yetkili_telefon} onChange={e => set('yetkili_telefon', e.target.value)} className={inp} />
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700">Notlar</label>
              <textarea value={form.notlar} onChange={e => set('notlar', e.target.value)} rows={2} className={inp + ' resize-none'} />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-gray-700">Aktif</label>
              <div onClick={() => set('aktif', !form.aktif)}
                className={`relative w-10 h-5 rounded-full cursor-pointer transition-colors ${form.aktif ? 'bg-[#C8102E]' : 'bg-gray-300'}`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${form.aktif ? 'left-5' : 'left-0.5'}`} />
              </div>
            </div>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading} className="flex-1 bg-[#C8102E] text-white py-2 rounded-lg font-medium hover:bg-[#a50d26] disabled:opacity-50">
              {loading ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
            </button>
            <Link href={`/subeler/${sube.id}`} className="px-6 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 text-center">İptal</Link>
          </div>
        </form>
      </div>
    </div>
  )
}
