'use client'

import { useState, useEffect } from 'react'

type Hareket = {
  id: string
  hareket_tipi: string
  kaynak: string
  kaynak_id: string
  kaynak_adi: string
  miktar: number
  tarih: string
  referans_no: string | null
  aciklama: string | null
  created_at: string
}

const TIP_BADGE: Record<string, string> = {
  giris:    'bg-green-100 text-green-700',
  cikis:    'bg-red-100 text-red-700',
  fire:     'bg-amber-100 text-amber-700',
  transfer: 'bg-blue-100 text-blue-700',
}

export default function DepoHareketleri() {
  const [hareketler, setHareketler] = useState<Hareket[]>([])
  const [loading, setLoading] = useState(true)

  const [tipFilter, setTipFilter] = useState('')
  const [kaynakFilter, setKaynakFilter] = useState('')
  const [baslangic, setBaslangic] = useState('')
  const [bitis, setBitis] = useState('')

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (tipFilter)    params.set('hareket_tipi', tipFilter)
      if (kaynakFilter) params.set('kaynak', kaynakFilter)
      if (baslangic)    params.set('baslangic', baslangic)
      if (bitis)        params.set('bitis', bitis)
      params.set('limit', '300')

      const res = await fetch(`/api/fabrika/depo-hareketleri?${params}`)
      const data = await res.json()
      setHareketler(Array.isArray(data) ? data : [])
    } catch (err: any) {
      console.error('Depo hareketleri yükleme hatası:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  function exportCsv() {
    const headers = ['Tarih', 'Tür', 'Kaynak', 'Ürün/Hammadde', 'Miktar', 'Referans', 'Açıklama']
    const rows = hareketler.map(h => [
      h.tarih,
      h.hareket_tipi,
      h.kaynak,
      `"${h.kaynak_adi}"`,
      h.miktar,
      h.referans_no ?? '',
      `"${h.aciklama ?? ''}"`,
    ])
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `depo-hareketleri-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-6 space-y-4">
      {/* Filtreler */}
      <div className="flex flex-wrap gap-3 items-end justify-between">
        <div className="flex flex-wrap gap-2">
          <select value={tipFilter} onChange={e => setTipFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
            <option value="">Tüm Türler</option>
            <option value="giris">Giriş</option>
            <option value="cikis">Çıkış</option>
            <option value="fire">Fire</option>
            <option value="transfer">Transfer</option>
          </select>
          <select value={kaynakFilter} onChange={e => setKaynakFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]">
            <option value="">Tüm Kaynaklar</option>
            <option value="hammadde">Hammadde</option>
            <option value="urun">Ürün</option>
          </select>
          <input type="date" value={baslangic} onChange={e => setBaslangic(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
          <input type="date" value={bitis} onChange={e => setBitis(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
          <button onClick={load}
            className="border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 px-3 py-2 rounded-lg text-sm hover:bg-gray-50">
            Filtrele
          </button>
        </div>
        <button onClick={exportCsv} disabled={hareketler.length === 0}
          className="border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 px-3 py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-40">
          ⬇ Excel'e Aktar
        </button>
      </div>

      {/* Tablo */}
      <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-sm text-gray-400 dark:text-gray-500">Yükleniyor...</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase border-b">
              <tr>
                <th className="px-4 py-2 text-left">Tarih</th>
                <th className="px-4 py-2 text-left">Tür</th>
                <th className="px-4 py-2 text-left">Kaynak</th>
                <th className="px-4 py-2 text-left">Ürün / Hammadde</th>
                <th className="px-4 py-2 text-right">Miktar</th>
                <th className="px-4 py-2 text-left">Referans</th>
                <th className="px-4 py-2 text-left">Açıklama</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {hareketler.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500">Hareket kaydı yok</td></tr>
              )}
              {hareketler.map(h => (
                <tr key={h.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-500 dark:text-gray-400 text-xs">{h.tarih}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TIP_BADGE[h.hareket_tipi] ?? ''}`}>
                      {h.hareket_tipi}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-500 dark:text-gray-400 capitalize text-xs">{h.kaynak}</td>
                  <td className="px-4 py-2 font-medium">{h.kaynak_adi}</td>
                  <td className="px-4 py-2 text-right font-medium">{Number(h.miktar).toLocaleString('tr-TR')}</td>
                  <td className="px-4 py-2 text-gray-500 dark:text-gray-400 text-xs">{h.referans_no ?? '—'}</td>
                  <td className="px-4 py-2 text-gray-500 dark:text-gray-400 text-xs max-w-xs truncate">{h.aciklama ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!loading && (
        <div className="text-xs text-gray-400 dark:text-gray-500 text-right">{hareketler.length} kayıt gösteriliyor</div>
      )}
    </div>
  )
}
