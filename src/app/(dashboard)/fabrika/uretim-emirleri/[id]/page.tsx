'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

type Emir = {
  id: string
  emir_no: string
  durum: string
  miktar: number
  planlanan_baslangic: string | null
  planlanan_bitis: string | null
  gercek_baslangic: string | null
  gercek_bitis: string | null
  sorumlu: string | null
  notlar: string | null
  created_at: string
  urunler: { id: string; ad: string; kategori: string; kdv_haric_fiyat: number } | null
}

type Hareket = {
  id: string
  kullanilan_miktar: number
  tarih: string
  notlar: string | null
  hammaddeler: { id: string; ad: string; birim: string } | null
}

const DURUM_BADGE: Record<string, string> = {
  'planlandı':  'bg-gray-100 text-gray-700',
  'üretimde':   'bg-blue-100 text-blue-700',
  'tamamlandı': 'bg-green-100 text-green-700',
  'iptal':      'bg-red-100 text-red-700',
}

function fmt(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('tr-TR')
}

function fmtTs(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleString('tr-TR')
}

export default function UretimEmriDetayPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()

  const [emir, setEmir] = useState<Emir | null>(null)
  const [hareketler, setHareketler] = useState<Hareket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [updating, setUpdating] = useState(false)

  async function load() {
    const res = await fetch(`/api/fabrika/uretim-emirleri/${id}`)
    if (!res.ok) { setError('Üretim emri bulunamadı.'); setLoading(false); return }
    const data = await res.json()
    setEmir(data.emir)
    setHareketler(data.hareketler ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  async function durumGuncelle(yeniDurum: string) {
    if (!emir) return
    setUpdating(true)
    const res = await fetch(`/api/fabrika/uretim-emirleri/${id}/durum`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ durum: yeniDurum }),
    })
    setUpdating(false)
    if (res.ok) {
      await load()
    }
  }

  if (loading) return <div className="p-6 text-sm text-gray-400">Yükleniyor...</div>
  if (error || !emir) return (
    <div className="p-6">
      <div className="text-red-600 mb-4">{error || 'Kayıt bulunamadı.'}</div>
      <Link href="/fabrika" className="text-sm text-[#C8102E] hover:underline">← Fabrikaya dön</Link>
    </div>
  )

  const durumClass = DURUM_BADGE[emir.durum] ?? 'bg-gray-100 text-gray-600'

  return (
    <div className="p-6 max-w-4xl space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/fabrika" className="hover:text-[#C8102E]">Fabrika</Link>
        <span>/</span>
        <span className="text-gray-400">Üretim Emirleri</span>
        <span>/</span>
        <span className="font-medium text-gray-900">{emir.emir_no}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{emir.emir_no}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${durumClass}`}>
              {emir.durum.charAt(0).toUpperCase() + emir.durum.slice(1)}
            </span>
            <span className="text-sm text-gray-500">{emir.urunler?.ad ?? '—'}</span>
          </div>
        </div>

        {/* Aksiyon butonları */}
        <div className="flex items-center gap-2 shrink-0">
          {emir.durum === 'planlandı' && (
            <>
              <button
                onClick={() => durumGuncelle('üretimde')}
                disabled={updating}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {updating ? '...' : '▶ Üretime Başla'}
              </button>
              <button
                onClick={() => durumGuncelle('iptal')}
                disabled={updating}
                className="px-4 py-2 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
              >
                İptal Et
              </button>
            </>
          )}
          {emir.durum === 'üretimde' && (
            <>
              <button
                onClick={() => durumGuncelle('tamamlandı')}
                disabled={updating}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {updating ? '...' : '✓ Tamamla'}
              </button>
              <button
                onClick={() => durumGuncelle('iptal')}
                disabled={updating}
                className="px-4 py-2 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
              >
                İptal Et
              </button>
            </>
          )}
        </div>
      </div>

      {/* Bilgi kartları */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Ürün</div>
          <div className="font-semibold text-sm text-gray-900">{emir.urunler?.ad ?? '—'}</div>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Miktar</div>
          <div className="font-semibold text-sm text-gray-900">{Number(emir.miktar).toLocaleString('tr-TR')} adet</div>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Sorumlu</div>
          <div className="font-semibold text-sm text-gray-900">{emir.sorumlu || '—'}</div>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <div className="text-xs text-gray-500 mb-1">Oluşturulma</div>
          <div className="font-semibold text-sm text-gray-900">{fmt(emir.created_at)}</div>
        </div>
      </div>

      {/* Planlama & Gerçekleşen */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50 font-semibold text-sm text-gray-900">
          Zamanlama
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0">
          <div className="px-5 py-4">
            <div className="text-xs text-gray-500 mb-1">Planlanan Başlangıç</div>
            <div className="text-sm font-medium text-gray-900">{fmt(emir.planlanan_baslangic)}</div>
          </div>
          <div className="px-5 py-4">
            <div className="text-xs text-gray-500 mb-1">Planlanan Bitiş</div>
            <div className="text-sm font-medium text-gray-900">{fmt(emir.planlanan_bitis)}</div>
          </div>
          <div className="px-5 py-4">
            <div className="text-xs text-gray-500 mb-1">Gerçek Başlangıç</div>
            <div className="text-sm font-medium text-gray-900">{fmtTs(emir.gercek_baslangic)}</div>
          </div>
          <div className="px-5 py-4">
            <div className="text-xs text-gray-500 mb-1">Gerçek Bitiş</div>
            <div className="text-sm font-medium text-gray-900">{fmtTs(emir.gercek_bitis)}</div>
          </div>
        </div>
      </div>

      {/* Notlar */}
      {emir.notlar && (
        <div className="bg-white border rounded-xl p-5">
          <div className="text-xs text-gray-500 mb-1 font-medium">Notlar</div>
          <div className="text-sm text-gray-700">{emir.notlar}</div>
        </div>
      )}

      {/* Kullanılan hammaddeler */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50 font-semibold text-sm text-gray-900">
          Kullanılan Hammaddeler
          {hareketler.length > 0 && (
            <span className="ml-2 text-xs text-gray-400 font-normal">({hareketler.length} kalem)</span>
          )}
        </div>
        {hareketler.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-400">
            {emir.durum === 'tamamlandı'
              ? 'Bu emir için hareket kaydı yok.'
              : 'Hammadde hareketleri üretim tamamlanınca kaydedilir.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase border-b">
              <tr>
                <th className="px-4 py-2 text-left">Hammadde</th>
                <th className="px-4 py-2 text-right">Kullanılan Miktar</th>
                <th className="px-4 py-2 text-left">Birim</th>
                <th className="px-4 py-2 text-left">Tarih</th>
                <th className="px-4 py-2 text-left">Notlar</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {hareketler.map(h => (
                <tr key={h.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{h.hammaddeler?.ad ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {Number(h.kullanilan_miktar).toLocaleString('tr-TR')}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{h.hammaddeler?.birim ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{fmt(h.tarih)}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{h.notlar ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
