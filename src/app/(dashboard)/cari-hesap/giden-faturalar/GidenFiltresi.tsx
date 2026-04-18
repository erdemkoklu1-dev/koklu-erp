'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
import { SORT_OPTIONS, PERIOD_OPTIONS } from '../_components/FaturaFiltrePaneli'

const DURUM_OPTIONS = [
  { value: 'tumu',         label: 'Tüm Durumlar' },
  { value: 'kesildi',      label: 'Kesildi' },
  { value: 'gonderildi',   label: 'Gönderildi' },
  { value: 'kismi_odendi', label: 'Kısmi Ödendi' },
  { value: 'odendi',       label: 'Ödendi' },
  { value: 'vergi_mahsup', label: 'Mahsup Edildi' },
  { value: 'gecikmiş',     label: 'Gecikmiş' },
]

function GidenFiltrePaneli() {
  const sp = useSearchParams()
  const router = useRouter()

  const [q, setQ]           = useState(sp.get('q') ?? '')
  const [period, setPeriod] = useState(sp.get('period') ?? '')
  const [from, setFrom]     = useState(sp.get('from') ?? '')
  const [to, setTo]         = useState(sp.get('to') ?? '')
  const [sort, setSort]     = useState(sp.get('sort') ?? 'date_desc')
  const [durum, setDurum]   = useState(sp.get('durum') ?? 'tumu')

  useEffect(() => {
    setQ(sp.get('q') ?? '')
    setPeriod(sp.get('period') ?? '')
    setFrom(sp.get('from') ?? '')
    setTo(sp.get('to') ?? '')
    setSort(sp.get('sort') ?? 'date_desc')
    setDurum(sp.get('durum') ?? 'tumu')
  }, [sp])

  function apply() {
    const p = new URLSearchParams()
    if (q)     p.set('q', q)
    if (period) p.set('period', period)
    if (period === 'ozel' && from) p.set('from', from)
    if (period === 'ozel' && to)   p.set('to', to)
    if (sort !== 'date_desc') p.set('sort', sort)
    if (durum !== 'tumu')     p.set('durum', durum)
    router.push(`/cari-hesap/giden-faturalar?${p.toString()}`)
  }

  const hasFilters = !!(q || period || (sort !== 'date_desc') || (durum !== 'tumu'))

  function clear() {
    router.push('/cari-hesap/giden-faturalar')
  }

  const inputCls = 'border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]/20 focus:border-[#C8102E] bg-white'

  return (
    <div className="bg-white border rounded-xl p-4 space-y-3">
      {/* Satır 1: arama + durum */}
      <div className="flex flex-wrap gap-3">
        <input value={q} onChange={e => setQ(e.target.value)}
          placeholder="Müşteri ara..."
          className={`flex-1 min-w-48 ${inputCls}`} />
        <select value={durum} onChange={e => setDurum(e.target.value)} className={inputCls}>
          {DURUM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Satır 2: dönem + sıralama + butonlar */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Dönem</label>
          <select value={period} onChange={e => { setPeriod(e.target.value); if (e.target.value !== 'ozel') { setFrom(''); setTo('') } }}
            className={`${inputCls} min-w-36`}>
            {PERIOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {period === 'ozel' && (
          <>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Başlangıç</label>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Bitiş</label>
              <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} />
            </div>
          </>
        )}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Sıralama</label>
          <select value={sort} onChange={e => setSort(e.target.value)} className={`${inputCls} min-w-52`}>
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="flex gap-2 pb-0.5">
          <button onClick={apply}
            className="bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26]">
            Filtrele
          </button>
          {hasFilters && (
            <button onClick={clear}
              className="border px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
              Temizle
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function GidenFiltresi() {
  return (
    <Suspense fallback={<div className="bg-white border rounded-xl p-4 h-24" />}>
      <GidenFiltrePaneli />
    </Suspense>
  )
}
