'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, useRef, Suspense } from 'react'
import { SORT_OPTIONS, PERIOD_OPTIONS } from '../_components/FaturaFiltrePaneli'
import { TURKEY_PROVINCES } from '@/lib/turkey-provinces'
import { createClient } from '@/lib/supabase/client'

function GelenFiltrePaneli() {
  const sp = useSearchParams()
  const router = useRouter()

  const [q, setQ]               = useState(sp.get('q') ?? '')
  const [period, setPeriod]     = useState(sp.get('period') ?? '')
  const [from, setFrom]         = useState(sp.get('from') ?? '')
  const [to, setTo]             = useState(sp.get('to') ?? '')
  const [sort, setSort]         = useState(sp.get('sort') ?? 'date_desc')
  const [odeme, setOdeme]       = useState(sp.get('odeme_durumu') ?? 'tumu')
  const [vade, setVade]         = useState(sp.get('vade_durumu') ?? 'tumu')
  const [kategori, setKategori] = useState(sp.get('kategori') ?? 'tumu')
  const [sehir, setSehir]       = useState(sp.get('sehir') ?? '')
  const [sube, setSube]         = useState(sp.get('sube') ?? '')
  const [subeler, setSubeler]   = useState<{ id: string; ad: string }[]>([])

  useEffect(() => {
    createClient().from('subeler').select('id, ad').order('ad')
      .then(({ data }: { data: { id: string; ad: string }[] | null }) => setSubeler(data ?? []))
  }, [])

  // State refs for debounce effect to read latest values
  const stateRef = useRef({ q, period, from, to, sort, odeme, vade, kategori, sehir, sube })
  useEffect(() => {
    stateRef.current = { q, period, from, to, sort, odeme, vade, kategori, sehir, sube }
  })

  useEffect(() => {
    setQ(sp.get('q') ?? '')
    setPeriod(sp.get('period') ?? '')
    setFrom(sp.get('from') ?? '')
    setTo(sp.get('to') ?? '')
    setSort(sp.get('sort') ?? 'date_desc')
    setOdeme(sp.get('odeme_durumu') ?? 'tumu')
    setVade(sp.get('vade_durumu') ?? 'tumu')
    setKategori(sp.get('kategori') ?? 'tumu')
    setSehir(sp.get('sehir') ?? '')
    setSube(sp.get('sube') ?? '')
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
      if (s.sort !== 'date_desc')        p.set('sort', s.sort)
      if (s.odeme !== 'tumu')            p.set('odeme_durumu', s.odeme)
      if (s.vade !== 'tumu')             p.set('vade_durumu', s.vade)
      if (s.kategori !== 'tumu')         p.set('kategori', s.kategori)
      if (s.sehir)                       p.set('sehir', s.sehir)
      if (s.sube)                        p.set('sube', s.sube)
      router.push(`/cari-hesap/gelen-faturalar?${p.toString()}`)
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
    if (sort !== 'date_desc')      p.set('sort', sort)
    if (odeme !== 'tumu')          p.set('odeme_durumu', odeme)
    if (vade !== 'tumu')           p.set('vade_durumu', vade)
    if (kategori !== 'tumu')       p.set('kategori', kategori)
    if (sehir)                     p.set('sehir', sehir)
    if (sube)                      p.set('sube', sube)
    router.push(`/cari-hesap/gelen-faturalar?${p.toString()}`)
  }

  const hasFilters = !!(q || period || (sort !== 'date_desc') || (odeme !== 'tumu') || (vade !== 'tumu') || (kategori !== 'tumu') || sehir || sube)

  const inputCls = 'border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]/20 focus:border-[#C8102E] bg-white dark:bg-gray-800'

  return (
    <div className="bg-white dark:bg-gray-800 border rounded-xl p-4 space-y-3">
      {/* Satır 1: arama + ödeme + vade + kategori */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative col-span-1">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Fatura No / Tedarikçi ara..."
            className={`w-full pr-8 ${inputCls}`}
          />
          {q && (
            <button
              onClick={() => setQ('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 text-lg leading-none"
              type="button"
            >
              ×
            </button>
          )}
        </div>
        <select value={odeme} onChange={e => setOdeme(e.target.value)} className={inputCls}>
          <option value="tumu">Tüm Ödeme Durumları</option>
          <option value="odenmemis">Ödenmemiş</option>
          <option value="kismi_odendi">Kısmen Ödendi</option>
          <option value="odendi">Ödendi</option>
        </select>
        <select value={vade} onChange={e => setVade(e.target.value)} className={inputCls}>
          <option value="tumu">Tüm Vadeler</option>
          <option value="gecikmiş">Gecikmiş</option>
          <option value="bugun">Bugün Vadeli</option>
          <option value="yaklasan">7 Gün İçinde</option>
        </select>
        <select value={kategori} onChange={e => setKategori(e.target.value)} className={inputCls}>
          <option value="tumu">Tüm Kategoriler</option>
          <option value="vergi">Vergi Borcu</option>
        </select>
      </div>

      {/* Satır 2: il filtresi + şube + dönem + sıralama + butonlar */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">İl</label>
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
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Şube</label>
          <select value={sube} onChange={e => setSube(e.target.value)} className={`${inputCls} min-w-40`}>
            <option value="">Tüm Şubeler</option>
            {subeler.map(s => <option key={s.id} value={s.id}>{s.ad}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Dönem</label>
          <select value={period} onChange={e => { setPeriod(e.target.value); if (e.target.value !== 'ozel') { setFrom(''); setTo('') } }}
            className={`${inputCls} min-w-36`}>
            {PERIOD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        {period === 'ozel' && (
          <>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Başlangıç</label>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Bitiş</label>
              <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} />
            </div>
          </>
        )}
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Sıralama</label>
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
            <button onClick={() => router.push('/cari-hesap/gelen-faturalar')}
              className="border px-4 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50">
              Temizle
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function GelenFiltresi() {
  return (
    <Suspense fallback={<div className="bg-white dark:bg-gray-800 border rounded-xl p-4 h-24" />}>
      <GelenFiltrePaneli />
    </Suspense>
  )
}
