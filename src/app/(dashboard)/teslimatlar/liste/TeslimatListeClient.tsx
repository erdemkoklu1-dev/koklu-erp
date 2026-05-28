'use client'

import Link from 'next/link'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { TeslimatSilButton } from '../TeslimatSilButton'

export type TeslimatRow = {
  id: string
  teslimat_no: string
  teslimat_tarihi: string | null
  hedef_tarih: string | null
  durum: string
  customers: { id: string; full_name: string } | null
  subeler: { id: string; ad: string } | null
  personeller: { id: string; ad: string; soyad: string } | null
  kalem_count: number
}

type Sube = { id: string; ad: string }

const DURUM_BADGE: Record<string, { label: string; icon: string; cls: string }> = {
  taslak:     { label: 'Taslak',     icon: '', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  sevkte:     { label: 'Sevkte',     icon: '', cls: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' },
  tamamlandi: { label: 'Tamamlandı', icon: '', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  iptal:      { label: 'İptal',      icon: '', cls: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' },
}

function formatDate(v: string | null) {
  if (!v) return '-'
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(v))
}

function isGeciken(hedef: string | null, durum: string) {
  if (!hedef || durum === 'tamamlandi' || durum === 'iptal') return false
  return hedef < new Date().toISOString().slice(0, 10)
}

export function TeslimatListeClient({ rows, subeler, initialDurum = '' }: { rows: TeslimatRow[]; subeler: Sube[]; initialDurum?: string }) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [durum, setDurum] = useState(initialDurum === 'bugun' ? '' : initialDurum)
  const [subeId, setSubeId] = useState('')
  const [baslangic, setBaslangic] = useState('')
  const [bitis, setBitis] = useState('')
  const [sadeceGeciken, setSadeceGeciken] = useState(false)
  const [sadeceBugun, setSadeceBugun] = useState(initialDurum === 'bugun')

  const hasFilter = !!(q || durum || subeId || baslangic || bitis || sadeceGeciken || sadeceBugun)

  const filtered = useMemo(() => {
    return rows.filter(row => {
      if (!durum && row.durum === 'iptal') return false
      if (q) {
        const qL = q.toLocaleLowerCase('tr-TR')
        const name = (row.customers?.full_name ?? '').toLocaleLowerCase('tr-TR')
        const no = (row.teslimat_no ?? '').toLocaleLowerCase('tr-TR')
        if (!name.includes(qL) && !no.includes(qL)) return false
      }
      if (durum && row.durum !== durum) return false
      if (sadeceBugun && row.teslimat_tarihi !== new Date().toISOString().slice(0, 10)) return false
      if (subeId && row.subeler?.id !== subeId) return false
      if (baslangic && row.teslimat_tarihi && row.teslimat_tarihi < baslangic) return false
      if (bitis && row.teslimat_tarihi && row.teslimat_tarihi > bitis) return false
      if (sadeceGeciken && !isGeciken(row.hedef_tarih, row.durum)) return false
      return true
    })
  }, [rows, q, durum, subeId, baslangic, bitis, sadeceGeciken, sadeceBugun])

  function clearFilters() {
    setQ('')
    setDurum('')
    setSubeId('')
    setBaslangic('')
    setBitis('')
    setSadeceGeciken(false)
    setSadeceBugun(false)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Müşteri veya teslimat no ara..."
          className="w-64 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]/30 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        />
        <select
          value={durum}
          onChange={e => setDurum(e.target.value)}
          className="rounded-md border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        >
          <option value="">Tüm Durumlar</option>
          <option value="taslak">Taslak</option>
          <option value="sevkte">Sevkte</option>
          <option value="tamamlandi">Tamamlandı</option>
          <option value="iptal">İptal</option>
        </select>
        <select
          value={subeId}
          onChange={e => setSubeId(e.target.value)}
          className="rounded-md border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
        >
          <option value="">Tüm Şubeler</option>
          {subeler.map(s => <option key={s.id} value={s.id}>{s.ad}</option>)}
        </select>
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={baslangic}
            onChange={e => setBaslangic(e.target.value)}
            className="rounded-md border px-2 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
          <span className="text-gray-400">-</span>
          <input
            type="date"
            value={bitis}
            onChange={e => setBitis(e.target.value)}
            className="rounded-md border px-2 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={sadeceGeciken}
            onChange={e => setSadeceGeciken(e.target.checked)}
            className="rounded"
          />
          Sadece gecikenler
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={sadeceBugun}
            onChange={e => setSadeceBugun(e.target.checked)}
            className="rounded"
          />
          Bugün teslim
        </label>
        {hasFilter && (
          <button
            type="button"
            onClick={clearFilters}
            className="rounded-md border px-3 py-2 text-xs text-gray-500 hover:text-red-600 dark:border-gray-600 dark:text-gray-400"
          >
            Temizle
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700 dark:text-gray-400">
            <tr>
              <th className="px-4 py-3 text-left">Teslimat No</th>
              <th className="px-4 py-3 text-left">Müşteri</th>
              <th className="px-4 py-3 text-left">Şube</th>
              <th className="px-4 py-3 text-left">Personel</th>
              <th className="px-4 py-3 text-left">Tarih</th>
              <th className="px-4 py-3 text-left">Hedef</th>
              <th className="px-4 py-3 text-left">Durum</th>
              <th className="px-4 py-3 text-center">Kalem</th>
              <th className="px-4 py-3 text-right">İşlem</th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-700">
            {filtered.map(row => {
              const geciken = isGeciken(row.hedef_tarih, row.durum)
              const badge = DURUM_BADGE[row.durum] ?? { label: row.durum, icon: '', cls: 'bg-gray-100 text-gray-600' }
              return (
                <tr
                  key={row.id}
                  onClick={() => router.push(`/teslimatlar/${row.id}`)}
                  className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 ${geciken ? 'bg-red-50 dark:bg-red-900/10' : ''}`}
                >
                  <td className="px-4 py-3 font-mono font-semibold text-[#C8102E]">{row.teslimat_no}</td>
                  <td className="px-4 py-3 text-gray-800 dark:text-gray-200">
                    {row.customers?.id ? (
                      <Link href={`/customers/${row.customers.id}`} onClick={e => e.stopPropagation()} className="hover:underline">
                        {row.customers.full_name}
                      </Link>
                    ) : '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{row.subeler?.ad ?? 'Genel'}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                    {row.personeller ? `${row.personeller.ad ?? ''} ${row.personeller.soyad ?? ''}`.trim() || <span className="text-sm text-gray-400">Atanmadı</span> : <span className="text-sm text-gray-400">Atanmadı</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{formatDate(row.teslimat_tarihi)}</td>
                  <td className="px-4 py-3">
                    <span className={geciken ? 'font-semibold text-red-600' : 'text-gray-600 dark:text-gray-300'}>
                      {formatDate(row.hedef_tarih)}
                      {geciken && <span className="ml-1">!</span>}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                      {badge.icon && <span>{badge.icon}</span>}
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-500 dark:text-gray-400">{row.kalem_count}</td>
                  <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-3">
                      <Link href={`/teslimatlar/${row.id}`} className="text-[#C8102E] hover:underline">Detay</Link>
                      <Link href={`/teslimatlar/${row.id}/duzenle`} className="text-[#C8102E] hover:underline">Düzenle</Link>
                      <TeslimatSilButton id={row.id} teslimatNo={row.teslimat_no} />
                    </div>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center">
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {hasFilter ? 'Filtreyle eşleşen teslimat bulunamadı.' : 'Henüz teslimat kaydı yok.'}
                  </div>
                  {hasFilter ? (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="mt-2 text-sm text-[#C8102E] hover:underline"
                    >
                      Filtreleri temizle
                    </button>
                  ) : (
                    <Link href="/teslimatlar/yeni" className="mt-2 inline-block text-sm text-[#C8102E] hover:underline">
                      + Yeni teslimat oluştur
                    </Link>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-gray-400 dark:border-gray-700">
          <span>{filtered.length} / {rows.length} teslimat</span>
          <Link href="/teslimatlar/yeni" className="text-[#C8102E] hover:underline">+ Yeni teslimat</Link>
        </div>
      </div>
    </div>
  )
}
