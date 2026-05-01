'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

type KPI = {
  stokDegeri: number
  kritikStokSayisi: number
  aktifEmir: number
  buAyTamamlanan: number
}

type KritikItem = {
  id: string
  ad: string
  birim: string
  mevcut_stok: number
  minimum_stok: number
  kategori: string
}

type Emir = {
  id: string
  emir_no: string
  urunler: { ad: string } | null
  miktar: number
  durum: string
  planlanan_baslangic: string | null
  planlanan_bitis: string | null
  sorumlu: string | null
}

export default function Genel() {
  const [kpi, setKpi] = useState<KPI | null>(null)
  const [kritik, setKritik] = useState<KritikItem[]>([])
  const [aktifEmirleri, setAktifEmirleri] = useState<Emir[]>([])
  const [loading, setLoading] = useState(true)
  const [hata, setHata] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const [hammRes, emirRes] = await Promise.all([
          fetch('/api/fabrika/hammaddeler'),
          fetch('/api/fabrika/uretim-emirleri'),
        ])
        const hammRaw = await hammRes.json()
        const emirRaw = await emirRes.json()
        const hammaddeler: KritikItem[] = Array.isArray(hammRaw) ? hammRaw : []
        const emirler: Emir[] = Array.isArray(emirRaw) ? emirRaw : []

        const stokDegeri = hammaddeler.reduce(
          (sum, h) => sum + Number(h.mevcut_stok) * Number((h as any).birim_maliyet), 0
        )
        const kritikList = hammaddeler.filter(h => Number(h.mevcut_stok) < Number(h.minimum_stok))
        const aktif = emirler.filter(e => e.durum === 'planlandı' || e.durum === 'üretimde')

        const buAyBas = new Date(); buAyBas.setDate(1); buAyBas.setHours(0,0,0,0)
        const buAy = emirler.filter(e =>
          e.durum === 'tamamlandı' &&
          (e as any).gercek_bitis &&
          new Date((e as any).gercek_bitis) >= buAyBas
        )

        setKpi({
          stokDegeri,
          kritikStokSayisi: kritikList.length,
          aktifEmir: aktif.length,
          buAyTamamlanan: buAy.length,
        })
        setKritik(kritikList)
        setAktifEmirleri(aktif)
      } catch (err: any) {
        console.error('Fabrika Genel yükleme hatası:', err)
        setHata('Veriler yüklenemedi: ' + (err?.message ?? 'Bilinmeyen hata'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return <div className="p-6 text-sm text-gray-400 dark:text-gray-500">Yükleniyor...</div>
  if (hata) return (
    <div className="p-6">
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{hata}</div>
    </div>
  )

  const durumBadge = (durum: string) => {
    if (durum === 'planlandı') return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">Planlandı</span>
    if (durum === 'üretimde')  return <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700">Üretimde</span>
    if (durum === 'tamamlandı') return <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">Tamamlandı</span>
    return <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700">İptal</span>
  }

  return (
    <div className="p-6 space-y-6">
      {/* KPI kartlar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl border p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Toplam Stok Değeri</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            ₺{(kpi?.stokDegeri ?? 0).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div className={`rounded-xl border p-4 ${kpi && kpi.kritikStokSayisi > 0 ? 'bg-red-50 border-red-200' : 'bg-white dark:bg-gray-800'}`}>
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Kritik Stok</div>
          <div className={`text-2xl font-bold ${kpi && kpi.kritikStokSayisi > 0 ? 'text-red-600' : 'text-gray-900 dark:text-gray-100'}`}>
            {kpi?.kritikStokSayisi ?? 0}
            {kpi && kpi.kritikStokSayisi > 0 && <span className="text-sm ml-1">hammadde</span>}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Aktif Üretim Emirleri</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{kpi?.aktifEmir ?? 0}</div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl border p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Bu Ay Tamamlanan</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{kpi?.buAyTamamlanan ?? 0}</div>
        </div>
      </div>

      {/* Kritik stok uyarısı */}
      {kritik.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="font-semibold text-red-700 mb-3 flex items-center gap-2">
            <span>⚠</span> Kritik Stok Uyarısı — {kritik.length} hammadde minimum seviyenin altında
          </div>
          <div className="space-y-2">
            {kritik.map(h => (
              <div key={h.id} className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg px-4 py-2 border border-red-100">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{h.ad}</div>
                <div className="text-xs text-red-600 font-medium">
                  {Number(h.mevcut_stok).toLocaleString('tr-TR')} / min {Number(h.minimum_stok).toLocaleString('tr-TR')} {h.birim}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Aktif üretim emirleri */}
      <div className="bg-white dark:bg-gray-800 border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50 dark:bg-gray-700 font-semibold text-sm text-gray-900 dark:text-gray-100">
          Aktif Üretim Emirleri
        </div>
        {aktifEmirleri.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400 dark:text-gray-500">Aktif üretim emri yok</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700 text-xs text-gray-500 dark:text-gray-400 uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Emir No</th>
                <th className="px-4 py-2 text-left">Ürün</th>
                <th className="px-4 py-2 text-right">Miktar</th>
                <th className="px-4 py-2 text-left">Planlanan Bitiş</th>
                <th className="px-4 py-2 text-left">Durum</th>
                <th className="px-4 py-2 text-left">Sorumlu</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {aktifEmirleri.map(e => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-300">{e.emir_no}</td>
                  <td className="px-4 py-3 font-medium">{e.urunler?.ad ?? '—'}</td>
                  <td className="px-4 py-3 text-right">{Number(e.miktar).toLocaleString('tr-TR')}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{e.planlanan_bitis ?? '—'}</td>
                  <td className="px-4 py-3">{durumBadge(e.durum)}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{e.sorumlu ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Link href={`/fabrika/uretim-emirleri/${e.id}`}
                      className="text-xs text-[#C8102E] hover:underline">Detay →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
