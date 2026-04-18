'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
import { SORT_OPTIONS, PERIOD_OPTIONS } from '../_components/FaturaFiltrePaneli'

function GelenFiltrePaneli() {
  const sp = useSearchParams()
  const router = useRouter()

  const [tedarikci, setTedarikci] = useState(sp.get('tedarikci') ?? '')
  const [period, setPeriod]       = useState(sp.get('period') ?? '')
  const [from, setFrom]           = useState(sp.get('from') ?? '')
  const [to, setTo]               = useState(sp.get('to') ?? '')
  const [sort, setSort]           = useState(sp.get('sort') ?? 'date_desc')
  const [odeme, setOdeme]         = useState(sp.get('odeme_durumu') ?? 'tumu')
  const [vade, setVade]           = useState(sp.get('vade_durumu') ?? 'tumu')
  const [kategori, setKategori]   = useState(sp.get('kategori') ?? 'tumu')

  useEffect(() => {
    setTedarikci(sp.get('tedarikci') ?? '')
    setPeriod(sp.get('period') ?? '')
    setFrom(sp.get('from') ?? '')
    setTo(sp.get('to') ?? '')
    setSort(sp.get('sort') ?? 'date_desc')
    setOdeme(sp.get('odeme_durumu') ?? 'tumu')
    setVade(sp.get('vade_durumu') ?? 'tumu')
    setKategori(sp.get('kategori') ?? 'tumu')
  }, [sp])

  function apply() {
    const p = new URLSearchParams()
    if (tedarikci) p.set('tedarikci', tedarikci)
    if (period)    p.set('period', period)
    if (period === 'ozel' && from) p.set('from', from)
    if (period === 'ozel' && to)   p.set('to', to)
    if (sort !== 'date_desc')      p.set('sort', sort)
    if (odeme !== 'tumu')          p.set('odeme_durumu', odeme)
    if (vade !== 'tumu')           p.set('vade_durumu', vade)
    if (kategori !== 'tumu')       p.set('kategori', kategori)
    router.push(`/cari-hesap/gelen-faturalar?${p.toString()}`)
  }

  const hasFilters = !!(tedarikci || period || (sort !== 'date_desc') || (odeme !== 'tumu') || (vade !== 'tumu') || (kategori !== 'tumu'))

  const inputCls = 'border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]/20 focus:border-[#C8102E] bg-white'

  return (
    <div className="bg-white border rounded-xl p-4 space-y-3">
      {/* Satır 1: arama + ödeme + vade + kategori */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <input value={tedarikci} onChange={e => setTedarikci(e.target.value)}
          placeholder="Tedarikçi ara..." className={`col-span-1 ${inputCls}`} />
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
            <button onClick={() => router.push('/cari-hesap/gelen-faturalar')}
              className="border px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
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
    <Suspense fallback={<div className="bg-white border rounded-xl p-4 h-24" />}>
      <GelenFiltrePaneli />
    </Suspense>
  )
}
