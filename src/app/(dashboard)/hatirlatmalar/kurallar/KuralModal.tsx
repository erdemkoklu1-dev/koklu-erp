'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Sablon = { id: string; ad: string; kanal: string }

type Kural = {
  id: string
  sablon_id: string | null
  tetikleyici_tip: string
  gun_oncesi: number
  aktif: boolean
}

const TETIKLEYICI = [
  { value: 'kontrol_yaklasiyor', label: 'Kontrol Yaklaşıyor' },
  { value: 'skt_yaklasiyor',    label: 'SKT Yaklaşıyor'    },
  { value: 'kontrol_gecti',     label: 'Kontrol Geçti'     },
  { value: 'skt_gecti',        label: 'SKT Geçti'         },
]

const BOSH = {
  sablon_id: '',
  tetikleyici_tip: 'kontrol_yaklasiyor',
  gun_oncesi: 7,
  aktif: true,
}

type Props = {
  sablonlar: Sablon[]
  kural?: Kural
  trigger?: React.ReactNode
}

export default function KuralModal({ sablonlar, kural, trigger }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    sablon_id: kural?.sablon_id ?? '',
    tetikleyici_tip: kural?.tetikleyici_tip ?? 'kontrol_yaklasiyor',
    gun_oncesi: kural?.gun_oncesi ?? 7,
    aktif: kural?.aktif ?? true,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)

  function openModal() {
    setForm({
      sablon_id: kural?.sablon_id ?? '',
      tetikleyici_tip: kural?.tetikleyici_tip ?? 'kontrol_yaklasiyor',
      gun_oncesi: kural?.gun_oncesi ?? 7,
      aktif: kural?.aktif ?? true,
    })
    setError('')
    setOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const payload = {
      sablon_id: form.sablon_id || null,
      tetikleyici_tip: form.tetikleyici_tip,
      gun_oncesi: Number(form.gun_oncesi),
      aktif: form.aktif,
    }

    let err
    if (kural?.id) {
      const res = await supabase.from('hatirlatma_kurallari').update(payload).eq('id', kural.id)
      err = res.error
    } else {
      const res = await supabase.from('hatirlatma_kurallari').insert(payload)
      err = res.error
    }

    if (err) { setError('Kayıt hatası: ' + err.message); setLoading(false); return }
    setOpen(false)
    router.refresh()
  }

  async function handleDelete() {
    if (!kural?.id) return
    if (!confirm('Bu kuralı silmek istediğinizden emin misiniz?')) return
    setDeleting(true)
    await supabase.from('hatirlatma_kurallari').delete().eq('id', kural.id)
    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <div onClick={openModal}>
        {trigger ?? (
          <button className="bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26] transition-colors">
            + Yeni Kural
          </button>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">
                {kural?.id ? 'Kuralı Düzenle' : 'Yeni Kural'}
              </h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tetikleyici</label>
                <select
                  value={form.tetikleyici_tip}
                  onChange={e => setForm(f => ({ ...f, tetikleyici_tip: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                >
                  {TETIKLEYICI.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Kaç Gün Önce (0 = tarih geçince)
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.gun_oncesi}
                  onChange={e => setForm(f => ({ ...f, gun_oncesi: Number(e.target.value) }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Mesaj Şablonu</label>
                <select
                  value={form.sablon_id}
                  onChange={e => setForm(f => ({ ...f, sablon_id: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                >
                  <option value="">— Şablon seç —</option>
                  {sablonlar.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.ad} ({s.kanal})
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.aktif}
                  onChange={e => setForm(f => ({ ...f, aktif: e.target.checked }))}
                  className="w-4 h-4 text-[#C8102E]"
                />
                <span className="text-sm text-gray-700">Aktif</span>
              </label>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
              )}

              <div className="flex gap-3 pt-1">
                {kural?.id && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="border border-red-200 text-red-600 rounded-lg py-2.5 px-4 text-sm hover:bg-red-50 disabled:opacity-50"
                  >
                    {deleting ? 'Siliniyor...' : 'Sil'}
                  </button>
                )}
                <button type="button" onClick={() => setOpen(false)}
                  className="flex-1 border rounded-lg py-2.5 text-sm text-gray-600 hover:bg-gray-50">
                  İptal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-[#C8102E] text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-[#a50d26] disabled:opacity-50"
                >
                  {loading ? 'Kaydediliyor...' : (kural?.id ? 'Güncelle' : 'Kaydet')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
