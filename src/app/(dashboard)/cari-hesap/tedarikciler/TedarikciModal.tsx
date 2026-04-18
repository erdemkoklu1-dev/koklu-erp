'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

type TedarikciForm = {
  firma_adi: string
  vergi_no: string
  vergi_dairesi: string
  adres: string
  sehir: string
  telefon: string
  email: string
  web_sitesi: string
  yetkili_adi: string
  yetkili_telefon: string
  urunler_hizmetler: string
  odeme_vadesi: string
  notlar: string
}

const BOSH: TedarikciForm = {
  firma_adi: '', vergi_no: '', vergi_dairesi: '', adres: '', sehir: '',
  telefon: '', email: '', web_sitesi: '', yetkili_adi: '', yetkili_telefon: '',
  urunler_hizmetler: '', odeme_vadesi: '', notlar: '',
}

type Props = {
  initial?: (TedarikciForm & { id: string }) | null
  trigger?: React.ReactNode
}

export default function TedarikciModal({ initial, trigger }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<TedarikciForm>(initial ?? BOSH)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function set(field: keyof TedarikciForm, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.firma_adi.trim()) { setError('Firma adı zorunludur.'); return }
    setLoading(true); setError('')

    const payload = {
      firma_adi: form.firma_adi.trim(),
      vergi_no: form.vergi_no || null,
      vergi_dairesi: form.vergi_dairesi || null,
      adres: form.adres || null,
      sehir: form.sehir || null,
      telefon: form.telefon || null,
      email: form.email || null,
      web_sitesi: form.web_sitesi || null,
      yetkili_adi: form.yetkili_adi || null,
      yetkili_telefon: form.yetkili_telefon || null,
      urunler_hizmetler: form.urunler_hizmetler || null,
      odeme_vadesi: form.odeme_vadesi ? parseInt(form.odeme_vadesi) : null,
      notlar: form.notlar || null,
      updated_at: new Date().toISOString(),
    }

    let err
    if (initial?.id) {
      const res = await supabase.from('tedarikciler').update(payload).eq('id', initial.id)
      err = res.error
    } else {
      const res = await supabase.from('tedarikciler').insert(payload)
      err = res.error
    }

    if (err) { setError('Kayıt hatası: ' + err.message); setLoading(false); return }
    setOpen(false)
    router.refresh()
  }

  const Field = ({ label, field, type = 'text', placeholder = '' }: {
    label: string; field: keyof TedarikciForm; type?: string; placeholder?: string
  }) => (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <input
        type={type}
        value={form[field]}
        onChange={e => set(field, e.target.value)}
        placeholder={placeholder}
        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
      />
    </div>
  )

  return (
    <>
      <div onClick={() => { setForm(initial ?? BOSH); setError(''); setOpen(true) }}>
        {trigger ?? (
          <button className="bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26] transition-colors">
            + Tedarikçi Ekle
          </button>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0">
              <h2 className="text-base font-bold text-gray-900">
                {initial?.id ? 'Tedarikçiyi Düzenle' : 'Yeni Tedarikçi Ekle'}
              </h2>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Firma Adı <span className="text-red-500">*</span></label>
                  <input
                    value={form.firma_adi}
                    onChange={e => set('firma_adi', e.target.value)}
                    placeholder="ABC Ticaret Ltd. Şti."
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                  />
                </div>
                <Field label="Vergi No / TC No" field="vergi_no" placeholder="1234567890" />
                <Field label="Vergi Dairesi" field="vergi_dairesi" placeholder="Erzincan" />
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Adres</label>
                  <input
                    value={form.adres}
                    onChange={e => set('adres', e.target.value)}
                    placeholder="Cadde, sokak, kapı no..."
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                  />
                </div>
                <Field label="Şehir" field="sehir" placeholder="Erzincan" />
                <Field label="Telefon" field="telefon" placeholder="0446 214 45 81" />
                <Field label="E-posta" field="email" type="email" placeholder="info@firma.com" />
                <Field label="Web Sitesi" field="web_sitesi" placeholder="www.firma.com" />
                <Field label="Yetkili Kişi Adı" field="yetkili_adi" placeholder="Ahmet Yılmaz" />
                <Field label="Yetkili Telefonu" field="yetkili_telefon" placeholder="0532 000 00 00" />
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Sattığı Ürünler / Hizmetler</label>
                  <textarea
                    value={form.urunler_hizmetler}
                    onChange={e => set('urunler_hizmetler', e.target.value)}
                    rows={2}
                    placeholder="KKT tozu, basınçlı kaplar, hortum vb."
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] resize-none"
                  />
                </div>
                <Field label="Ödeme Vadesi (gün)" field="odeme_vadesi" type="number" placeholder="30" />
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Notlar</label>
                  <input
                    value={form.notlar}
                    onChange={e => set('notlar', e.target.value)}
                    placeholder="Ek bilgi..."
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                  />
                </div>
              </div>

              {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
            </form>

            <div className="px-6 py-4 border-t flex gap-3 flex-shrink-0">
              <button type="button" onClick={() => setOpen(false)}
                className="flex-1 border rounded-lg py-2.5 text-sm text-gray-600 hover:bg-gray-50">
                İptal
              </button>
              <button
                onClick={handleSubmit as any}
                disabled={loading}
                className="flex-1 bg-[#C8102E] text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-[#a50d26] disabled:opacity-50">
                {loading ? 'Kaydediliyor...' : (initial?.id ? 'Güncelle' : 'Kaydet')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
