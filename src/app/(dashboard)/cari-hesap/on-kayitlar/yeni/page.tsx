'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { formatCurrency } from '@/lib/finance/formatters'

type KalemRow = {
  aciklama: string
  miktar: string
  birim: string
  birim_fiyat: string
}

const BIRIMLER = ['adet', 'kg', 'metre', 'saat', 'iş']

const emptyKalem = (): KalemRow => ({
  aciklama: '',
  miktar: '1',
  birim: 'adet',
  birim_fiyat: '',
})

export default function YeniOnKayitPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [customers, setCustomers] = useState<any[]>([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null)

  const [kayitTarihi, setKayitTarihi] = useState(new Date().toISOString().split('T')[0])
  const [kalemler, setKalemler] = useState<KalemRow[]>([emptyKalem()])

  useEffect(() => {
    supabase.from('customers').select('id, full_name, tax_number').eq('is_active', true).order('full_name')
      .then(({ data }: { data: any }) => {
        setCustomers(data ?? [])
        // URL'den müşteri seçimi
        const cid = searchParams.get('customer_id')
        if (cid && data) {
          const found = data.find((c: any) => c.id === cid)
          if (found) setSelectedCustomer(found)
        }
      })
  }, [])

  const filteredCustomers = customers.filter(c =>
    c.full_name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    (c.tax_number ?? '').includes(customerSearch)
  )

  function updateKalem(idx: number, field: keyof KalemRow, value: string) {
    setKalemler(prev => prev.map((k, i) => i === idx ? { ...k, [field]: value } : k))
  }

  function addKalem() {
    setKalemler(prev => [...prev, emptyKalem()])
  }

  function removeKalem(idx: number) {
    setKalemler(prev => prev.filter((_, i) => i !== idx))
  }

  const toplamTutar = kalemler.reduce((s, k) => {
    return s + (parseFloat(k.miktar) || 0) * (parseFloat(k.birim_fiyat) || 0)
  }, 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedCustomer) { setError('Müşteri seçimi zorunludur.'); return }
    if (!kayitTarihi) { setError('Tarih zorunludur.'); return }

    const validKalemler = kalemler.filter(k => k.aciklama.trim() && parseFloat(k.birim_fiyat) > 0)
    if (validKalemler.length === 0) {
      setError('En az bir geçerli kalem ekleyin (açıklama ve birim fiyat zorunlu).')
      return
    }

    setLoading(true)
    setError('')

    try {
      const rows = validKalemler.map(k => ({
        customer_id:   selectedCustomer.id,
        kayit_tarihi:  kayitTarihi,
        aciklama:      k.aciklama.trim(),
        miktar:        parseFloat(k.miktar) || 1,
        birim:         k.birim,
        birim_fiyat:   parseFloat(k.birim_fiyat) || 0,
        toplam_tutar:  (parseFloat(k.miktar) || 1) * (parseFloat(k.birim_fiyat) || 0),
        durum:         'beklemede',
      }))

      const { error: dbErr } = await supabase.from('on_kayitlar').insert(rows)
      if (dbErr) throw new Error(dbErr.message)

      router.push('/cari-hesap/on-kayitlar')
    } catch (e: any) {
      setError(e.message ?? 'Beklenmeyen hata')
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/cari-hesap/on-kayitlar" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700">← Ön Kayıtlar</Link>
        <span className="text-gray-300">/</span>
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Yeni Ön Kayıt</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Müşteri + Tarih */}
        <div className="bg-white dark:bg-gray-800 border rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 pb-2 border-b">Genel Bilgiler</h3>

          <div className="grid grid-cols-2 gap-4">
            {/* Müşteri */}
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Müşteri <span className="text-red-500">*</span>
              </label>
              {selectedCustomer ? (
                <div className="mt-1 flex items-center justify-between border rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-700">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedCustomer.full_name}</span>
                  <button type="button"
                    onClick={() => { setSelectedCustomer(null); setCustomerSearch('') }}
                    className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600">Değiştir</button>
                </div>
              ) : (
                <div className="relative mt-1">
                  <input
                    value={customerSearch}
                    onChange={e => { setCustomerSearch(e.target.value); setShowDropdown(true) }}
                    onFocus={() => setShowDropdown(true)}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                    placeholder="Müşteri adı ara..."
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                  />
                  {showDropdown && filteredCustomers.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {filteredCustomers.slice(0, 15).map(c => (
                        <button key={c.id} type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                          onMouseDown={e => {
                            e.preventDefault()
                            setSelectedCustomer(c)
                            setCustomerSearch('')
                            setShowDropdown(false)
                          }}>
                          <span className="font-medium">{c.full_name}</span>
                          {c.tax_number && <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">{c.tax_number}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Tarih */}
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Kayıt Tarihi <span className="text-red-500">*</span>
              </label>
              <input type="date" value={kayitTarihi}
                onChange={e => setKayitTarihi(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
          </div>
        </div>

        {/* Kalemler */}
        <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50 dark:bg-gray-700 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Ürün / Hizmet Kalemleri</h3>
            <button type="button" onClick={addKalem}
              className="text-sm bg-[#C8102E] text-white px-3 py-1.5 rounded-lg hover:bg-[#a50d26]">
              + Kalem Ekle
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700 border-b">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Açıklama</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 w-24">Miktar</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 w-24">Birim</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 w-32">Birim Fiyat</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 w-28">Toplam</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {kalemler.map((k, idx) => {
                  const lineTotal = (parseFloat(k.miktar) || 0) * (parseFloat(k.birim_fiyat) || 0)
                  return (
                    <tr key={idx}>
                      <td className="px-3 py-2">
                        <input value={k.aciklama}
                          onChange={e => updateKalem(idx, 'aciklama', e.target.value)}
                          className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                          placeholder="Ürün / hizmet adı" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" step="any" value={k.miktar}
                          onChange={e => updateKalem(idx, 'miktar', e.target.value)}
                          className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />
                      </td>
                      <td className="px-3 py-2">
                        <select value={k.birim} onChange={e => updateKalem(idx, 'birim', e.target.value)}
                          className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E] bg-white dark:bg-gray-800">
                          {BIRIMLER.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" step="0.01" value={k.birim_fiyat}
                          onChange={e => updateKalem(idx, 'birim_fiyat', e.target.value)}
                          className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#C8102E]"
                          placeholder="0,00" />
                      </td>
                      <td className="px-3 py-2 text-sm font-medium text-right text-gray-900 dark:text-gray-100">
                        {formatCurrency(lineTotal)}
                      </td>
                      <td className="px-2 py-2">
                        {kalemler.length > 1 && (
                          <button type="button" onClick={() => removeKalem(idx)}
                            className="text-red-400 hover:text-red-600 text-xs">✕</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="border-t bg-gray-50 dark:bg-gray-700 px-5 py-3 flex justify-end">
            <div className="text-base font-bold text-gray-900 dark:text-gray-100">
              Toplam: <span className="text-[#C8102E]">{formatCurrency(toplamTutar)}</span>
            </div>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex gap-3 pb-6">
          <button type="submit" disabled={loading}
            className="flex-1 bg-[#C8102E] text-white py-3 rounded-lg font-semibold hover:bg-[#a50d26] disabled:opacity-50 transition-colors">
            {loading ? 'Kaydediliyor...' : 'Kayıtları Kaydet'}
          </button>
          <Link href="/cari-hesap/on-kayitlar"
            className="px-8 py-3 border rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 text-center">
            İptal
          </Link>
        </div>

      </form>
    </div>
  )
}
