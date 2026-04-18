'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'

export const SORT_OPTIONS = [
  { value: 'date_desc',     label: 'Tarih (Yeni → Eski)' },
  { value: 'date_asc',      label: 'Tarih (Eski → Yeni)' },
  { value: 'amount_desc',   label: 'Tutar (Büyük → Küçük)' },
  { value: 'amount_asc',    label: 'Tutar (Küçük → Büyük)' },
  { value: 'customer_asc',  label: 'Müşteri / Tedarikçi (A → Z)' },
  { value: 'customer_desc', label: 'Müşteri / Tedarikçi (Z → A)' },
  { value: 'kalan_desc',    label: 'Kalan Tutar (Büyük → Küçük)' },
]

export const PERIOD_OPTIONS = [
  { value: '',         label: 'Tüm Tarihler' },
  { value: 'bu_ay',    label: 'Bu Ay' },
  { value: 'gecen_ay', label: 'Geçen Ay' },
  { value: 'son_3_ay', label: 'Son 3 Ay' },
  { value: 'bu_yil',   label: 'Bu Yıl' },
  { value: 'ozel',     label: 'Özel Aralık' },
]

type Props = {
  basePath: string
  /** Extra params to preserve (e.g. status, type) — key:value */
  preserveParams?: Record<string, string | undefined>
}

function FiltreForm({ basePath, preserveParams = {} }: Props) {
  const sp = useSearchParams()
  const router = useRouter()

  const [period, setPeriod] = useState(sp.get('period') ?? '')
  const [from, setFrom]     = useState(sp.get('from') ?? '')
  const [to, setTo]         = useState(sp.get('to') ?? '')
  const [sort, setSort]     = useState(sp.get('sort') ?? 'date_desc')

  useEffect(() => {
    setPeriod(sp.get('period') ?? '')
    setFrom(sp.get('from') ?? '')
    setTo(sp.get('to') ?? '')
    setSort(sp.get('sort') ?? 'date_desc')
  }, [sp])

  function onPeriodChange(val: string) {
    setPeriod(val)
    if (val !== 'ozel') { setFrom(''); setTo('') }
  }

  function apply() {
    const p = new URLSearchParams()
    // preserve external params
    for (const [k, v] of Object.entries(preserveParams)) {
      if (v) p.set(k, v)
    }
    // preserve q
    const q = sp.get('q')
    if (q) p.set('q', q)

    if (period) p.set('period', period)
    if (period === 'ozel') {
      if (from) p.set('from', from)
      if (to)   p.set('to', to)
    }
    if (sort && sort !== 'date_desc') p.set('sort', sort)
    router.push(`${basePath}?${p.toString()}`)
  }

  const hasFilters = !!(sp.get('period') || (sp.get('sort') && sp.get('sort') !== 'date_desc') || sp.get('from') || sp.get('to'))

  function clear() {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries(preserveParams)) { if (v) p.set(k, v) }
    const q = sp.get('q')
    if (q) p.set('q', q)
    router.push(`${basePath}?${p.toString()}`)
  }

  const inputCls = 'border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]/20 focus:border-[#C8102E] bg-white'

  return (
    <div className="bg-white border rounded-xl p-4 flex flex-wrap gap-3 items-end">
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Dönem</label>
        <select value={period} onChange={e => onPeriodChange(e.target.value)} className={`${inputCls} min-w-36`}>
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
          Uygula
        </button>
        {hasFilters && (
          <button onClick={clear}
            className="border px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            Temizle
          </button>
        )}
      </div>
    </div>
  )
}

export default function FaturaFiltrePaneli(props: Props) {
  return (
    <Suspense fallback={<div className="bg-white border rounded-xl p-4 h-[60px]" />}>
      <FiltreForm {...props} />
    </Suspense>
  )
}
