'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, useRef, Suspense } from 'react'
import { SORT_OPTIONS, PERIOD_OPTIONS } from '../_components/FaturaFiltrePaneli'
import { TURKEY_PROVINCES } from '@/lib/turkey-provinces'

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
  const [sehir, setSehir]   = useState(sp.get('sehir') ?? '')

  const stateRef = useRef({ q, period, from, to, sort, durum, sehir })
  useEffect(() => {
    stateRef.current = { q, period, from, to, sort, durum, sehir }
  })

  useEffect(() => {
    setQ(sp.get('q') ?? '')
    setPeriod(sp.get('period') ?? '')
    setFrom(sp.get('from') ?? '')
    setTo(sp.get('to') ?? '')
    setSort(sp.get('sort') ?? 'date_desc')
    setDurum(sp.get('durum') ?? 'tumu')
    setSehir(sp.get('sehir') ?? '')
  }, [sp])

  // Auto-trigger search on q change (min 2 chars or cleared)
  const isFirstRender = useRef(true)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    if (q.length === 1) return
    const timer = setTimeout(() => {
      const s = stateRef.current
      const p = new URLSearchParams()
      if (s.q.length >= 2) p.set('q', s.q)
      if (s.period) p.set('period', s.period)
      if (s.period === 'ozel' && s.from) p.set('from', s.from)
      if (s.period === 'ozel' && s.to)   p.set('to', s.to)
      if (s.sort !== 'date_desc') p.set('sort', s.sort)
      if (s.durum !== 'tumu')     p.set('durum', s.durum)
      if (s.sehir)                p.set('sehir', s.sehir)
      router.push(`/cari-hesap/giden-faturalar?${p.toString()}`)
    }, 600)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  function apply() {
    const p = new URLSearchParams()
    if (q.length >= 2) p.set('q', q)
    if (period) p.set('period', period)
    if (period === 'ozel' && from) p.set('from', from)
    if (period === 'ozel' && to)   p.set('to', to)
    if (sort !== 'date_desc') p.set('sort', sort)
    if (durum !== 'tumu')     p.set('durum', durum)
    if (sehir)                p.set('sehir', sehir)
    router.push(`/cari-hesap/giden-faturalar?${p.toString()}`)
  }

  const hasFilters = !!(q || period || (sort !== 'date_desc') || (durum !== 'tumu') || sehir)

  function clear() {
    router.push('/cari-hesap/giden-faturalar')
  }

  const inputCls = 'border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]/20 focus:border-[#C8102E] bg-white'

  return (
    <div className="bg-white border rounded-xl p-4 space-y-3">
      {/* Satır 1: arama + durum */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Fatura No / Müşteri ara..."
            className={`w-full pr-8 ${inputCls}`}
          />
          {q && (
            <button
              onClick={() => setQ('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
              type="button"
            >
              ×
            </button>
          )}
        </div>
        <select value={durum} onChange={e => setDurum(e.target.value)} className={inputCls}>
          {DURUM_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Satır 2: il + dönem + sıralama + butonlar */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">İl</label>
          <select value={sehir} onChange={e => setSehir(e.target.value)} className={`${inputCls} min-w-36`}>
            <option value="">Tümü</option>
            <option disabled>─────────</option>
            <option value="Erzincan">Erzincan</option>
            <option value="İstanbul">İstanbul</option>
            <option disabled>─────────</option>
            {TURKEY_PROVINCES.map(il => (
              <option key={il} value={il}>{il}</option>
            ))}
          </select>
        </div>
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
