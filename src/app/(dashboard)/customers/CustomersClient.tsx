'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import HatirlatmaModal from '@/components/HatirlatmaModal'

export type ControlStatus = 'expired' | 'overdue' | 'urgent' | 'soon' | 'ok' | 'no-device'
export type CustomerRow = {
  id: string
  full_name: string
  type: string
  tax_number: string | null
  phone: string | null
  email: string | null
  address: string | null
  created_at: string
  city: 'Erzincan' | 'İstanbul' | 'Diğer'
  otherCityName: string | null
  controlStatus: ControlStatus
  daysUntilNext: number | null
}

type CityFilter = 'all' | 'Erzincan' | 'İstanbul' | 'Diğer'
type StatusFilter = 'all' | ControlStatus
type TypeFilter = 'all' | 'company' | 'individual'

const statusConfig: Record<ControlStatus, { label: string; color: string; bg: string; border: string }> = {
  expired:   { label: 'SKT Doldu',   color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-300'    },
  overdue:   { label: 'Gecikmiş',    color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-300' },
  urgent:    { label: 'Acil (<30g)', color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-300' },
  soon:      { label: 'Yaklaşıyor',  color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-300'   },
  ok:        { label: 'Güncel',      color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-300'  },
  'no-device': { label: 'Cihaz Yok', color: 'text-gray-500 dark:text-gray-400',  bg: 'bg-gray-50 dark:bg-gray-700',   border: 'border-gray-300 dark:border-gray-600'   },
}

function FilterPill({
  label, count, active, onClick, color = 'red',
}: {
  label: string; count: number; active: boolean; onClick: () => void; color?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${
        active
          ? 'bg-[#C8102E] text-white border-[#C8102E]'
          : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-[#C8102E] hover:text-[#C8102E]'
      }`}
    >
      {label}
      <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${
        active ? 'bg-white dark:bg-gray-800/20 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
      }`}>
        {count}
      </span>
    </button>
  )
}

type HatirlatmaTarget = { id: string; full_name: string; phone: string | null; email: string | null }

export default function CustomersClient({ customers }: { customers: CustomerRow[] }) {
  const [cityFilter, setCityFilter] = useState<CityFilter>('all')
  const [hatirlatmaTarget, setHatirlatmaTarget] = useState<HatirlatmaTarget | null>(null)
  const [otherCityFilter, setOtherCityFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [search, setSearch] = useState('')

  // Unique other cities from "Diğer" customers
  const otherCities = useMemo(() => {
    const set = new Set<string>()
    for (const c of customers) {
      if (c.city === 'Diğer' && c.otherCityName) set.add(c.otherCityName)
    }
    return Array.from(set).sort()
  }, [customers])

  function handleSetCityFilter(city: CityFilter) {
    setCityFilter(city)
    setOtherCityFilter('')
  }

  const filtered = customers.filter(c => {
    if (cityFilter !== 'all') {
      if (c.city !== cityFilter) return false
      if (cityFilter === 'Diğer' && otherCityFilter !== '' && c.otherCityName !== otherCityFilter) return false
    }
    if (statusFilter !== 'all' && c.controlStatus !== statusFilter) return false
    if (typeFilter !== 'all' && c.type !== typeFilter) return false
    if (search.trim() !== '') {
      const q = search.trim().toLowerCase()
      const match =
        c.full_name.toLowerCase().includes(q) ||
        (c.tax_number ?? '').toLowerCase().includes(q) ||
        (c.phone ?? '').toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q) ||
        (c.address ?? '').toLowerCase().includes(q)
      if (!match) return false
    }
    return true
  })

  function countCity(city: CityFilter) {
    if (city === 'all') return customers.length
    return customers.filter(c => c.city === city).length
  }

  function countStatus(s: StatusFilter) {
    if (s === 'all') return customers.length
    return customers.filter(c => c.controlStatus === s).length
  }

  function countType(t: TypeFilter) {
    if (t === 'all') return customers.length
    return customers.filter(c => c.type === t).length
  }

  const hasActiveFilter = cityFilter !== 'all' || statusFilter !== 'all' || typeFilter !== 'all' || search.trim() !== ''

  return (
    <div className="p-6 space-y-4">

      {/* Arama */}
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Müşteri ara... (isim, vergi no, telefon, e-posta, adres)"
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-[#C8102E]/20 focus:border-[#C8102E] placeholder-gray-400"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Filtre paneli */}
      <div className="bg-white dark:bg-gray-800 border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Filtreler</span>
          {hasActiveFilter && (
            <button
              onClick={() => { handleSetCityFilter('all'); setStatusFilter('all'); setTypeFilter('all'); setSearch('') }}
              className="text-xs text-[#C8102E] hover:underline"
            >
              Filtreleri Temizle
            </button>
          )}
        </div>

        {/* Şehir */}
        <div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mb-2">Şehir</div>
          <div className="flex flex-wrap items-center gap-2">
            <FilterPill label="Tümü"     count={countCity('all')}       active={cityFilter === 'all'}       onClick={() => handleSetCityFilter('all')} />
            <FilterPill label="Erzincan" count={countCity('Erzincan')} active={cityFilter === 'Erzincan'} onClick={() => handleSetCityFilter('Erzincan')} />
            <FilterPill label="İstanbul" count={countCity('İstanbul')} active={cityFilter === 'İstanbul'} onClick={() => handleSetCityFilter('İstanbul')} />
            <FilterPill label="Diğer Şehirler" count={countCity('Diğer')} active={cityFilter === 'Diğer'} onClick={() => handleSetCityFilter('Diğer')} />
            {cityFilter === 'Diğer' && otherCities.length > 0 && (
              <select
                value={otherCityFilter}
                onChange={e => setOtherCityFilter(e.target.value)}
                className="border border-gray-200 dark:border-gray-600 rounded-full px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-[#C8102E]/20 focus:border-[#C8102E] cursor-pointer"
              >
                <option value="">— Tüm diğer şehirler</option>
                {otherCities.map(city => (
                  <option key={city} value={city}>
                    {city} ({customers.filter(c => c.city === 'Diğer' && c.otherCityName === city).length})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Kontrol durumu */}
        <div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mb-2">Kontrol Durumu</div>
          <div className="flex flex-wrap gap-2">
            <FilterPill label="Tümü" count={countStatus('all')} active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} />
            {(Object.keys(statusConfig) as ControlStatus[]).map(s => (
              countStatus(s) > 0 && (
                <FilterPill
                  key={s}
                  label={statusConfig[s].label}
                  count={countStatus(s)}
                  active={statusFilter === s}
                  onClick={() => setStatusFilter(s)}
                />
              )
            ))}
          </div>
        </div>

        {/* Müşteri türü */}
        <div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mb-2">Müşteri Türü</div>
          <div className="flex flex-wrap gap-2">
            <FilterPill label="Tümü"    count={countType('all')}        active={typeFilter === 'all'}        onClick={() => setTypeFilter('all')} />
            <FilterPill label="Firma"   count={countType('company')}    active={typeFilter === 'company'}    onClick={() => setTypeFilter('company')} />
            <FilterPill label="Bireysel" count={countType('individual')} active={typeFilter === 'individual'} onClick={() => setTypeFilter('individual')} />
          </div>
        </div>
      </div>

      {/* Kontrol durumu kartları — tıklanabilir filtre */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {(Object.keys(statusConfig) as ControlStatus[]).map(s => {
          const count = countStatus(s)
          const cfg = statusConfig[s]
          const isActive = statusFilter === s
          return (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter(isActive ? 'all' : s)}
              className={`rounded-lg p-4 border text-left transition-colors cursor-pointer ${
                isActive
                  ? 'bg-[#C8102E] border-[#C8102E]'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600 hover:border-[#C8102E]'
              }`}
            >
              <div className={`text-xs font-medium ${isActive ? 'text-white' : cfg.color}`}>
                {cfg.label}
              </div>
              <div className={`text-2xl font-bold mt-1 ${isActive ? 'text-white' : 'text-gray-900 dark:text-gray-100'}`}>
                {count}
              </div>
            </button>
          )
        })}
      </div>

      {hatirlatmaTarget && (
        <HatirlatmaModal
          open={true}
          onClose={() => setHatirlatmaTarget(null)}
          customerId={hatirlatmaTarget.id}
          customerName={hatirlatmaTarget.full_name}
          phone={hatirlatmaTarget.phone}
          email={hatirlatmaTarget.email}
        />
      )}

      {/* Müşteri tablosu */}
      <div className="bg-white dark:bg-gray-800 border rounded-lg overflow-x-auto">
        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">
            {search.trim() ? `"${search}" için sonuç bulunamadı.` : 'Bu filtreye uyan müşteri bulunamadı.'}
          </div>
        ) : (
          <table className="w-full min-w-[900px]">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase sticky left-0 z-10 bg-gray-50 dark:bg-gray-700 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Müşteri</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Şehir</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Tür</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Telefon</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Kontrol Durumu</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase sticky right-0 z-10 bg-gray-50 dark:bg-gray-700 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)]">İşlem</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(c => {
                const sc = statusConfig[c.controlStatus]
                return (
                  <tr key={c.id} className="group hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 sticky left-0 z-10 bg-white dark:bg-gray-900 group-hover:bg-gray-50 dark:group-hover:bg-gray-800 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] transition-colors">
                      <div className="font-medium text-gray-900 dark:text-gray-100">{c.full_name}</div>
                      {c.email && <div className="text-xs text-gray-400 dark:text-gray-500">{c.email}</div>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {c.city === 'Diğer' && c.otherCityName ? c.otherCityName : c.city}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        c.type === 'company' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                      }`}>
                        {c.type === 'company' ? 'Firma' : 'Bireysel'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">{c.phone ?? '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${sc.bg} ${sc.color} ${sc.border}`}>
                          {sc.label}
                        </span>
                        {c.daysUntilNext !== null && c.controlStatus !== 'no-device' && (
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            {c.daysUntilNext < 0
                              ? `${Math.abs(c.daysUntilNext)}g gecikmiş`
                              : `${c.daysUntilNext}g kaldı`}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 sticky right-0 z-10 bg-white dark:bg-gray-900 group-hover:bg-gray-50 dark:group-hover:bg-gray-800 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)] transition-colors">
                      <div className="flex items-center gap-3">
                        <Link href={`/customers/${c.id}`} className="text-[#C8102E] text-sm font-medium hover:underline">
                          Detay →
                        </Link>
                        {c.controlStatus !== 'no-device' && (
                          <button
                            title="Hatırlatma Gönder"
                            onClick={() => setHatirlatmaTarget({ id: c.id, full_name: c.full_name, phone: c.phone, email: c.email })}
                            className="text-gray-400 dark:text-gray-500 hover:text-[#C8102E] transition-colors"
                          >
                            🔔
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
