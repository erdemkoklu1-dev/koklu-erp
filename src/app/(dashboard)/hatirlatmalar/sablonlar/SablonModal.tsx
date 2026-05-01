'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type Sablon = {
  id: string
  ad: string
  kanal: 'email' | 'sms' | 'whatsapp'
  konu: string | null
  mesaj_sablonu: string
  aktif: boolean
}

const DEGISKENLER = [
  { key: '{musteri_adi}',   aciklama: 'Müşteri adı'              },
  { key: '{cihaz_adi}',    aciklama: 'Cihaz adı'                },
  { key: '{kontrol_tarihi}', aciklama: 'Kontrol/SKT tarihi'     },
  { key: '{gun_kaldi}',    aciklama: 'Kalan gün'                },
  { key: '{firma_adi}',    aciklama: 'Firma adı (Köklü Yangın)' },
]

type Props = {
  sablon?: Sablon
  trigger?: React.ReactNode
}

const BOSH: Omit<Sablon, 'id'> = {
  ad: '',
  kanal: 'email',
  konu: '',
  mesaj_sablonu: '',
  aktif: true,
}

export default function SablonModal({ sablon, trigger }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<Omit<Sablon, 'id'>>({
    ad: sablon?.ad ?? '',
    kanal: sablon?.kanal ?? 'email',
    konu: sablon?.konu ?? '',
    mesaj_sablonu: sablon?.mesaj_sablonu ?? '',
    aktif: sablon?.aktif ?? true,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)

  function openModal() {
    setForm({
      ad: sablon?.ad ?? '',
      kanal: sablon?.kanal ?? 'email',
      konu: sablon?.konu ?? '',
      mesaj_sablonu: sablon?.mesaj_sablonu ?? '',
      aktif: sablon?.aktif ?? true,
    })
    setError('')
    setOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.ad.trim()) { setError('Şablon adı zorunludur.'); return }
    if (!form.mesaj_sablonu.trim()) { setError('Mesaj içeriği zorunludur.'); return }
    setLoading(true); setError('')

    const payload = {
      ad: form.ad.trim(),
      kanal: form.kanal,
      konu: form.kanal === 'email' ? (form.konu?.trim() || null) : null,
      mesaj_sablonu: form.mesaj_sablonu.trim(),
      aktif: form.aktif,
    }

    let err
    if (sablon?.id) {
      const res = await supabase.from('hatirlatma_sablonlari').update(payload).eq('id', sablon.id)
      err = res.error
    } else {
      const res = await supabase.from('hatirlatma_sablonlari').insert(payload)
      err = res.error
    }

    if (err) { setError('Kayıt hatası: ' + err.message); setLoading(false); return }
    setOpen(false)
    router.refresh()
  }

  async function handleDelete() {
    if (!sablon?.id) return
    if (!confirm('Bu şablonu silmek istediğinizden emin misiniz?')) return
    setDeleting(true)
    await supabase.from('hatirlatma_sablonlari').delete().eq('id', sablon.id)
    setOpen(false)
    router.refresh()
  }

  function insertVar(v: string) {
    setForm(f => ({ ...f, mesaj_sablonu: f.mesaj_sablonu + v }))
  }

  return (
    <>
      <div onClick={openModal}>
        {trigger ?? (
          <button className="bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26] transition-colors">
            + Yeni Şablon
          </button>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0">
              <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">
                {sablon?.id ? 'Şablonu Düzenle' : 'Yeni Mesaj Şablonu'}
              </h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                    Şablon Adı <span className="text-red-500">*</span>
                  </label>
                  <input
                    value={form.ad}
                    onChange={e => setForm(f => ({ ...f, ad: e.target.value }))}
                    placeholder="örn: Kontrol Yaklaşıyor (E-posta)"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Kanal</label>
                  <select
                    value={form.kanal}
                    onChange={e => setForm(f => ({ ...f, kanal: e.target.value as any }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                  >
                    <option value="email">E-posta</option>
                    <option value="sms">SMS</option>
                    <option value="whatsapp">WhatsApp (Yakında)</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 cursor-pointer self-end pb-2">
                  <input
                    type="checkbox"
                    checked={form.aktif}
                    onChange={e => setForm(f => ({ ...f, aktif: e.target.checked }))}
                    className="w-4 h-4 text-[#C8102E]"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Aktif</span>
                </label>
              </div>

              {form.kanal === 'email' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">E-posta Konusu</label>
                  <input
                    value={form.konu ?? ''}
                    onChange={e => setForm(f => ({ ...f, konu: e.target.value }))}
                    placeholder="Yangın Söndürme Cihazı Bakım Hatırlatması - {cihaz_adi}"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                  />
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                    Mesaj İçeriği <span className="text-red-500">*</span>
                  </label>
                </div>
                {/* Değişken düğmeleri */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {DEGISKENLER.map(d => (
                    <button
                      key={d.key}
                      type="button"
                      onClick={() => insertVar(d.key)}
                      title={d.aciklama}
                      className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 px-2 py-0.5 rounded hover:bg-[#C8102E] hover:text-white hover:border-[#C8102E] transition-colors"
                    >
                      {d.key}
                    </button>
                  ))}
                </div>
                <textarea
                  value={form.mesaj_sablonu}
                  onChange={e => setForm(f => ({ ...f, mesaj_sablonu: e.target.value }))}
                  rows={6}
                  placeholder="Sayın {musteri_adi}, {cihaz_adi} cihazınızın bakımı {gun_kaldi} gün sonra..."
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] font-mono resize-none"
                />
                {form.kanal === 'sms' && (
                  <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    SMS karakter sayısı: {form.mesaj_sablonu.length} (160 karakter = 1 SMS)
                  </div>
                )}
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
              )}
            </form>

            <div className="px-6 py-4 border-t flex gap-3 flex-shrink-0">
              {sablon?.id && (
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
                className="flex-1 border rounded-lg py-2.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50">
                İptal
              </button>
              <button
                onClick={handleSubmit as any}
                disabled={loading}
                className="flex-1 bg-[#C8102E] text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-[#a50d26] disabled:opacity-50"
              >
                {loading ? 'Kaydediliyor...' : (sablon?.id ? 'Güncelle' : 'Kaydet')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
