'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Kayit = {
  id: string
  kullanici_id: string | null
  email: string | null
  ad_soyad: string | null
  islem_tipi: 'giris' | 'cikis' | 'basarisiz_giris'
  ip_adresi: string | null
  tarayici: string | null
  created_at: string
}
type Profil = { id: string; ad_soyad: string | null }

function fmt(dt: string) {
  return new Date(dt).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const ISLEM_CONFIG = {
  giris:            { label: 'Giriş',           className: 'bg-green-50 text-green-700 border-green-200' },
  cikis:            { label: 'Çıkış',           className: 'bg-blue-50 text-blue-700 border-blue-200' },
  basarisiz_giris:  { label: 'Başarısız Giriş', className: 'bg-red-50 text-red-700 border-red-200' },
}

export default function KayitlarClient({
  kayitlar, profiller, bugunAktif, haftaBasarisiz,
}: {
  kayitlar: Kayit[]
  profiller: Profil[]
  bugunAktif: number
  haftaBasarisiz: number
}) {
  const router = useRouter()
  const [kullanici, setKullanici] = useState('')
  const [from, setFrom]           = useState('')
  const [to, setTo]               = useState('')
  const [tip, setTip]             = useState('')

  function filtrele(e: React.FormEvent) {
    e.preventDefault()
    const p = new URLSearchParams()
    if (kullanici) p.set('kullanici', kullanici)
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    if (tip) p.set('tip', tip)
    router.push('/yonetim/kayitlar?' + p.toString())
  }

  return (
    <div className="space-y-4">
      {/* Özet kartlar */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-800 border rounded-lg p-4">
          <div className="text-xs text-gray-500 dark:text-gray-400">Bugün Aktif Kullanıcı</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{bugunAktif}</div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-xs text-red-600">Bu Hafta Başarısız Giriş</div>
          <div className="text-2xl font-bold text-red-700 mt-1">{haftaBasarisiz}</div>
        </div>
      </div>

      {/* Filtreler */}
      <form onSubmit={filtrele} className="bg-white dark:bg-gray-800 border rounded-lg p-4 flex flex-wrap items-center gap-3">
        <select value={kullanici} onChange={e => setKullanici(e.target.value)}
          className="border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#C8102E]">
          <option value="">Tüm Kullanıcılar</option>
          {profiller.map(p => <option key={p.id} value={p.id}>{p.ad_soyad ?? p.id}</option>)}
        </select>
        <select value={tip} onChange={e => setTip(e.target.value)}
          className="border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#C8102E]">
          <option value="">Tüm İşlemler</option>
          <option value="giris">Giriş</option>
          <option value="cikis">Çıkış</option>
          <option value="basarisiz_giris">Başarısız Giriş</option>
        </select>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)}
          className="border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />
        <span className="text-xs text-gray-400 dark:text-gray-500">–</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)}
          className="border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />
        <button type="submit" className="bg-gray-800 text-white px-3 py-1.5 rounded-lg text-xs hover:bg-gray-700">Filtrele</button>
      </form>

      {/* Tablo */}
      <div className="bg-white dark:bg-gray-800 border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-700 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">KULLANICI</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">İŞLEM</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">ZAMAN</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">IP</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400">TARAYICI</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {kayitlar.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">Kayıt bulunamadı.</td></tr>
            ) : kayitlar.map(k => {
              const conf = ISLEM_CONFIG[k.islem_tipi]
              return (
                <tr key={k.id} className={`hover:bg-gray-50 ${k.islem_tipi === 'basarisiz_giris' ? 'bg-red-50' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{k.ad_soyad || '—'}</div>
                    <div className="text-xs text-gray-400 dark:text-gray-500">{k.email || '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${conf.className}`}>
                      {conf.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{fmt(k.created_at)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 font-mono">{k.ip_adresi || '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500 max-w-xs truncate" title={k.tarayici ?? ''}>
                    {k.tarayici ? k.tarayici.slice(0, 60) + (k.tarayici.length > 60 ? '...' : '') : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
