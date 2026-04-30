'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { TURKEY_PROVINCES } from '@/lib/turkey-provinces'
import SubeSelect from '@/components/SubeSelect'

export default function NewCustomerPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [subeId, setSubeId] = useState<string | null>(null)
  const [form, setForm] = useState({
    full_name: '',
    type: 'company',
    tax_number: '',
    authorized_person: '',
    authorized_phone: '',
    phone: '',
    email: '',
    address: '',
    il: '',
    notes: '',
    iban: '',
    bank_name: '',
  })

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name.trim()) { setError('Müşteri adı zorunlu.'); return }
    setLoading(true)
    setError('')
    const { error } = await supabase.from('customers').insert([{ ...form, sube_id: subeId || null }])
    if (error) {
      setError('Kayıt sırasında hata oluştu: ' + error.message)
      setLoading(false)
    } else {
      router.push('/customers')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Üst bar */}
      <div className="bg-white border-b px-6 py-4 flex items-center gap-3">
        <div className="w-8 h-8 bg-[#C8102E] rounded-lg flex items-center justify-center text-white font-bold text-sm">K</div>
        <Link href="/customers" className="text-gray-500 hover:text-gray-700 text-sm">← Müşteriler</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-lg font-bold text-gray-900">Yeni Müşteri</h1>
      </div>

      <div className="p-6 max-w-2xl mx-auto">
        <form onSubmit={handleSubmit} className="bg-white border rounded-lg p-6 space-y-5">

          {/* Müşteri türü */}
          <div>
            <label className="text-sm font-medium text-gray-700">Müşteri Türü</label>
            <select name="type" value={form.type} onChange={handleChange}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
              <option value="company">Firma</option>
              <option value="individual">Bireysel</option>
            </select>
          </div>

          {/* Müşteri adı */}
          <div>
            <label className="text-sm font-medium text-gray-700">
              {form.type === 'company' ? 'Firma Adı' : 'Ad Soyad'} <span className="text-red-500">*</span>
            </label>
            <input name="full_name" value={form.full_name} onChange={handleChange}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
              placeholder={form.type === 'company' ? 'ABC İnşaat A.Ş.' : 'Ahmet Yılmaz'} />
          </div>

          {/* Vergi No */}
          <div>
            <label className="text-sm font-medium text-gray-700">
              {form.type === 'company' ? 'Vergi Numarası' : 'TC Kimlik No'}
            </label>
            <input name="tax_number" value={form.tax_number} onChange={handleChange}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
              placeholder={form.type === 'company' ? '1234567890' : '12345678901'} />
          </div>

          {/* Yetkili + Yetkili Telefonu + Telefon + E-posta */}
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Yetkili</label>
              <input name="authorized_person" value={form.authorized_person} onChange={handleChange}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                placeholder="Yetkili adı soyadı" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Yetkili Telefonu</label>
              <input name="authorized_phone" value={form.authorized_phone} onChange={handleChange}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                placeholder="0555 123 4567" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Telefon</label>
              <input name="phone" value={form.phone} onChange={handleChange}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                placeholder="0555 123 4567" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">E-posta</label>
              <input name="email" type="email" value={form.email} onChange={handleChange}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                placeholder="info@firma.com" />
            </div>
          </div>

          {/* Şube */}
          <SubeSelect
            value={subeId}
            onChange={setSubeId}
            label="Şube"
          />

          {/* İl + Adres */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">İl</label>
              <select name="il" value={form.il} onChange={handleChange}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white">
                <option value="">— Seçiniz</option>
                {TURKEY_PROVINCES.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700">Adres</label>
              <input name="address" value={form.address} onChange={handleChange}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                placeholder="Mahalle, cadde, bina no..." />
            </div>
          </div>

          {/* Banka Bilgileri */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Banka Adı</label>
              <input name="bank_name" value={form.bank_name} onChange={handleChange}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                placeholder="Ziraat Bankası" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">IBAN</label>
              <input name="iban" value={form.iban} onChange={handleChange}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                placeholder="TR00 0000 0000 0000 0000 0000 00" />
            </div>
          </div>

          {/* Notlar */}
          <div>
            <label className="text-sm font-medium text-gray-700">Notlar</label>
            <textarea name="notes" value={form.notes} onChange={handleChange} rows={3}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
              placeholder="Müşteri hakkında ek bilgiler..." />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

          {/* Butonlar */}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading}
              className="flex-1 bg-[#C8102E] text-white py-2 rounded-lg font-medium hover:bg-[#a50d26] disabled:opacity-50 transition-colors">
              {loading ? 'Kaydediliyor...' : 'Müşteriyi Kaydet'}
            </button>
            <Link href="/customers"
              className="px-6 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition-colors text-center">
              İptal
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}