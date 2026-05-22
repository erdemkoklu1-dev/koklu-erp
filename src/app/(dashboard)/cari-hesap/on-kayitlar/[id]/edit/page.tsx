'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { formatCurrency } from '@/lib/finance/formatters'

const BIRIMLER = ['adet', 'kg', 'metre', 'saat', 'iş']

type KalemRow = {
  aciklama: string
  miktar: string
  birim: string
  birim_fiyat: string
}

const emptyKalem = (): KalemRow => ({
  aciklama: '',
  miktar: '1',
  birim: 'adet',
  birim_fiyat: '',
})

export default function EditOnKayitPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const supabase = createClient()

  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState('')
  const [isFaturalanmis, setIsFaturalanmis] = useState(false)
  const [notlar, setNotlar] = useState('')
  const [kayitTarihi, setKayitTarihi] = useState('')
  const [kalemler, setKalemler] = useState<KalemRow[]>([emptyKalem()])

  useEffect(() => {
    supabase.from('on_kayitlar').select('*').eq('id', id).single()
      .then(({ data }: { data: any }) => {
        if (data) {
          setIsFaturalanmis(data.durum === 'faturalanmadi')
          setKayitTarihi(data.kayit_tarihi ?? '')
          setNotlar(data.notlar ?? '')

          const stored = Array.isArray(data.kalemler) && data.kalemler.length > 0
            ? data.kalemler
            : null

          if (stored) {
            setKalemler(stored.map((k: any) => ({
              aciklama:    String(k.aciklama ?? ''),
              miktar:      String(k.miktar ?? '1'),
              birim:       String(k.birim ?? 'adet'),
              birim_fiyat: String(k.birim_fiyat ?? ''),
            })))
          } else {
            // Eski tek-kalem satır
            setKalemler([{
              aciklama:    data.aciklama ?? '',
              miktar:      String(data.miktar ?? '1'),
              birim:       data.birim ?? 'adet',
              birim_fiyat: String(data.birim_fiyat ?? ''),
            }])
          }
        }
        setFetching(false)
      })
  }, [id])

  function updateKalem(idx: number, field: keyof KalemRow, value: string) {
    setKalemler(prev => prev.map((k, i) => i === idx ? { ...k, [field]: value } : k))
  }

  function addKalem() {
    setKalemler(prev => [...prev, emptyKalem()])
  }

  function removeKalem(idx: number) {
    setKalemler(prev => prev.filter((_, i) => i !== idx))
  }

  const toplamTutar = kalemler.reduce((s, k) =>
    s + (parseFloat(k.miktar) || 0) * (parseFloat(k.birim_fiyat) || 0), 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!kayitTarihi) { setError('Tarih zorunludur.'); return }

    const validKalemler = kalemler.filter(k => k.aciklama.trim() && parseFloat(k.birim_fiyat) > 0)
    if (validKalemler.length === 0) {
      setError('En az bir geçerli kalem gereklidir (açıklama ve birim fiyat zorunlu).')
      return
    }

    setLoading(true)
    setError('')

    const kalemlerData = validKalemler.map(k => ({
      aciklama:    k.aciklama.trim(),
      miktar:      parseFloat(k.miktar) || 1,
      birim:       k.birim,
      birim_fiyat: parseFloat(k.birim_fiyat) || 0,
      tutar:       (parseFloat(k.miktar) || 1) * (parseFloat(k.birim_fiyat) || 0),
    }))

    const tek = kalemlerData.length === 1
    const { error: err } = await supabase.from('on_kayitlar').update({
      kayit_tarihi: kayitTarihi,
      aciklama:     tek ? kalemlerData[0].aciklama : kalemlerData.map(k => k.aciklama).join(', '),
      miktar:       tek ? kalemlerData[0].miktar : 1,
      birim:        tek ? kalemlerData[0].birim : 'adet',
      birim_fiyat:  tek ? kalemlerData[0].birim_fiyat : 0,
      toplam_tutar: toplamTutar,
      kalemler:     kalemlerData,
      notlar:       notlar.trim() || null,
      updated_at:   new Date().toISOString(),
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
    <div className="p-6 max-w-3xl mx-auto space-y-5">
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

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Tarih + Notlar */}
        <div className="bg-white dark:bg-gray-800 border rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 pb-2 border-b">Genel Bilgiler</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Kayıt Tarihi <span className="text-red-500">*</span>
              </label>
              <input type="date" value={kayitTarihi}
                onChange={e => setKayitTarihi(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Notlar</label>
              <input value={notlar} onChange={e => setNotlar(e.target.value)}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                placeholder="Opsiyonel not..." />
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
            {loading ? 'Kaydediliyor...' : 'Güncelle'}
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
