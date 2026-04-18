'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'
import { formatCurrency, formatTRDate, PAYMENT_METHOD_LABELS } from '@/lib/finance/formatters'

type Customer = {
  id: string
  full_name: string
  phone: string | null
  tax_number: string | null
  email: string | null
  address: string | null
  iban?: string | null
  bank_name?: string | null
}
type Invoice = {
  id: string; customer_id: string | null; invoice_number: string | null
  invoice_date: string | null; due_date: string | null
  total_amount: number | null; paid_amount: number | null
  status: string | null; invoice_type: string | null
}
type Payment = {
  id: string; invoice_id: string | null; payment_date: string | null
  amount: number | null; method: string | null; reference_no: string | null
}

type Props = {
  customers: Customer[]
  invoices: Invoice[]
  payments: Payment[]
  today: string
}

export default function MusteriCariClient({ customers, invoices, payments, today }: Props) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'faturalar' | 'odemeler' | 'ekstre' | 'notlar'>('faturalar')
  const [note, setNote] = useState('')
  const [notes, setNotes] = useState<string[]>([])

  const invoiceMap = useMemo(() => {
    const m = new Map<string, Invoice[]>()
    for (const inv of invoices) {
      if (!inv.customer_id) continue
      const list = m.get(inv.customer_id) ?? []
      list.push(inv)
      m.set(inv.customer_id, list)
    }
    return m
  }, [invoices])

  type RowSummary = Customer & {
    totalInvoice: number
    totalPaid: number
    kalan: number
    gecikmisTutar: number
    lastDate: string | null
  }

  const rows: RowSummary[] = useMemo(() => {
    return customers.map(c => {
      const cinvs = invoiceMap.get(c.id) ?? []
      const totalInvoice = cinvs.reduce((s, i) => s + (i.total_amount ?? 0), 0)
      const totalPaid    = cinvs.reduce((s, i) => s + (i.paid_amount ?? 0), 0)
      const kalan        = Math.max(0, totalInvoice - totalPaid)
      const lastDate     = cinvs.length > 0 ? cinvs[0].invoice_date : null
      const gecikmisTutar = cinvs.reduce((s, i) => {
        const effDue = i.due_date ?? i.invoice_date
        if (!effDue || effDue >= today) return s
        const k = Math.max(0, (i.total_amount ?? 0) - (i.paid_amount ?? 0))
        return s + k
      }, 0)
      return { ...c, totalInvoice, totalPaid, kalan, gecikmisTutar, lastDate }
    })
  }, [customers, invoiceMap, today])

  // Client-side search: full_name, phone, tax_number
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return rows
    return rows.filter(r =>
      r.full_name.toLowerCase().includes(q) ||
      (r.phone ?? '').includes(q) ||
      (r.tax_number ?? '').includes(q) ||
      (r.email ?? '').toLowerCase().includes(q)
    )
  }, [rows, search])

  const selected = useMemo(() => rows.find(r => r.id === selectedId) ?? null, [rows, selectedId])
  const selInvoices = useMemo(() => selectedId ? (invoiceMap.get(selectedId) ?? []) : [], [selectedId, invoiceMap])
  const selPayments = useMemo(() => {
    const ids = new Set(selInvoices.map(i => i.id))
    return payments.filter(p => p.invoice_id && ids.has(p.invoice_id))
  }, [selInvoices, payments])

  // Cari ekstre: fatura = borç, ödeme = alacak, kronolojik
  const ekstre = useMemo(() => {
    type EksRow = { date: string; tip: string; aciklama: string; borc: number; alacak: number; bakiye: number }
    const eksList: Omit<EksRow, 'bakiye'>[] = []
    for (const inv of selInvoices) {
      eksList.push({ date: inv.invoice_date ?? '', tip: 'Fatura', aciklama: inv.invoice_number ?? '-', borc: inv.total_amount ?? 0, alacak: 0 })
    }
    for (const p of selPayments) {
      const inv = selInvoices.find(i => i.id === p.invoice_id)
      eksList.push({ date: p.payment_date ?? '', tip: 'Ödeme', aciklama: inv?.invoice_number ? `${inv.invoice_number} ödemesi` : 'Ödeme', borc: 0, alacak: p.amount ?? 0 })
    }
    eksList.sort((a, b) => a.date.localeCompare(b.date))
    let bakiye = 0
    return eksList.map(r => { bakiye += r.borc - r.alacak; return { ...r, bakiye } })
  }, [selInvoices, selPayments])

  const toplamAlacak = useMemo(() => rows.reduce((s, r) => s + r.kalan, 0), [rows])
  const gecikmisSayi = useMemo(() => rows.filter(r => r.gecikmisTutar > 0).length, [rows])

  return (
    <div className="flex h-full min-h-0 overflow-hidden">

      {/* ── Sol Panel ── */}
      <div className="w-72 flex-shrink-0 border-r bg-white flex flex-col h-full">
        {/* Üst */}
        <div className="px-4 py-3 border-b space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Müşteri Cari</h2>
            <Link href="/cari-hesap/faturalar/new"
              className="text-xs bg-[#C8102E] text-white px-2 py-1 rounded-lg hover:bg-[#a50d26]">
              + Fatura
            </Link>
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Müşteri ara..."
            className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
          />
          <div className="flex gap-3 text-xs text-gray-500">
            <span>{filtered.length} / {rows.length} müşteri</span>
            {gecikmisSayi > 0 && <span className="text-orange-600">{gecikmisSayi} gecikmiş</span>}
          </div>
        </div>

        {/* Liste */}
        <div className="flex-1 overflow-y-auto divide-y">
          {filtered.map(r => (
            <button
              key={r.id}
              onClick={() => { setSelectedId(r.id); setActiveTab('faturalar') }}
              className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${selectedId === r.id ? 'bg-red-50 border-l-2 border-[#C8102E]' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium truncate ${r.gecikmisTutar > 0 ? 'text-red-700' : 'text-gray-900'}`}>
                  {r.full_name}
                </span>
                {r.kalan > 0 && (
                  <span className={`text-xs font-semibold ml-2 flex-shrink-0 ${r.gecikmisTutar > 0 ? 'text-red-600' : 'text-orange-600'}`}>
                    {formatCurrency(r.kalan)}
                  </span>
                )}
              </div>
              <div className="flex gap-2 mt-0.5">
                {r.gecikmisTutar > 0 && (
                  <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Gecikmiş</span>
                )}
                {r.totalInvoice === 0 && (
                  <span className="text-xs text-gray-300">Fatura yok</span>
                )}
                {r.kalan === 0 && r.totalInvoice > 0 && (
                  <span className="text-xs text-green-500">Kapandı</span>
                )}
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              {search ? `"${search}" için sonuç bulunamadı` : 'Müşteri yok'}
            </div>
          )}
        </div>

        {/* Alt özet */}
        <div className="border-t px-4 py-3 bg-gray-50">
          <div className="text-xs text-gray-500">Toplam Alacak</div>
          <div className="text-base font-bold text-orange-600">{formatCurrency(toplamAlacak)}</div>
        </div>
      </div>

      {/* ── Sağ Panel ── */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {!selected ? (
          <div className="flex items-center justify-center h-full min-h-64">
            <div className="text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <p className="text-sm text-gray-400">Listeden bir müşteri seçin</p>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-4">

            {/* Müşteri başlık */}
            <div className="bg-white border rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-bold text-gray-900">{selected.full_name}</h3>
                  <div className="flex gap-4 mt-1 text-xs text-gray-400">
                    {selected.phone && <span>{selected.phone}</span>}
                    {selected.email && <span>{selected.email}</span>}
                    {selected.tax_number && <span>VKN: {selected.tax_number}</span>}
                  </div>
                  {selected.address && <div className="text-xs text-gray-400 mt-0.5">{selected.address}</div>}
                  {(selected.bank_name || selected.iban) && (
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
                      {selected.bank_name && (
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded font-medium">
                          {selected.bank_name}
                        </span>
                      )}
                      {selected.iban && (
                        <span className="text-xs text-gray-700 font-mono tracking-wide">
                          {selected.iban}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <Link href={`/customers/${selected.id}`}
                  className="text-xs text-[#C8102E] hover:underline font-medium flex-shrink-0">
                  Müşteri Kartı →
                </Link>
              </div>
            </div>

            {/* KPI */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white border rounded-xl p-3">
                <div className="text-xs text-gray-500">Toplam Fatura</div>
                <div className="text-lg font-bold text-gray-900 mt-0.5">{formatCurrency(selected.totalInvoice)}</div>
                <div className="text-xs text-gray-400">{selInvoices.length} fatura</div>
              </div>
              <div className="bg-white border rounded-xl p-3">
                <div className="text-xs text-gray-500">Tahsilat</div>
                <div className="text-lg font-bold text-green-700 mt-0.5">{formatCurrency(selected.totalPaid)}</div>
                <div className="text-xs text-gray-400">{selPayments.length} ödeme</div>
              </div>
              <div className={`rounded-xl p-3 border ${selected.kalan > 0 ? 'bg-orange-50 border-orange-200' : 'bg-white'}`}>
                <div className={`text-xs ${selected.kalan > 0 ? 'text-orange-600' : 'text-gray-500'}`}>Kalan Alacak</div>
                <div className={`text-lg font-bold mt-0.5 ${selected.kalan > 0 ? 'text-orange-700' : 'text-gray-400'}`}>
                  {selected.kalan > 0 ? formatCurrency(selected.kalan) : '—'}
                </div>
              </div>
              <div className={`rounded-xl p-3 border ${selected.gecikmisTutar > 0 ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
                <div className={`text-xs ${selected.gecikmisTutar > 0 ? 'text-red-600' : 'text-gray-500'}`}>Gecikmiş</div>
                <div className={`text-lg font-bold mt-0.5 ${selected.gecikmisTutar > 0 ? 'text-red-700' : 'text-gray-400'}`}>
                  {selected.gecikmisTutar > 0 ? formatCurrency(selected.gecikmisTutar) : '—'}
                </div>
                {selected.lastDate && (
                  <div className="text-xs text-gray-400">Son: {formatTRDate(selected.lastDate)}</div>
                )}
              </div>
            </div>

            {/* Sekmeler */}
            <div className="bg-white border rounded-xl overflow-hidden">
              <div className="border-b px-4 flex gap-0">
                {(['faturalar', 'odemeler', 'ekstre', 'notlar'] as const).map(tab => {
                  const labels = { faturalar: 'Faturalar', odemeler: 'Ödemeler', ekstre: 'Hesap Özeti', notlar: 'Notlar' }
                  return (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                      className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-[#C8102E] text-[#C8102E]' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
                      {labels[tab]}
                    </button>
                  )
                })}
              </div>

              {/* Sekme 1: Faturalar */}
              {activeTab === 'faturalar' && (
                <div>
                  <div className="px-4 py-2 border-b bg-gray-50 flex justify-end">
                    <Link href={`/cari-hesap/faturalar/new?customer_id=${selected.id}`}
                      className="text-xs bg-[#C8102E] text-white px-3 py-1.5 rounded-lg hover:bg-[#a50d26]">
                      + Yeni Fatura
                    </Link>
                  </div>
                  {selInvoices.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-gray-400">Henüz fatura yok.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Fatura No</th>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Tarih</th>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Vade</th>
                            <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Tutar</th>
                            <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Ödenen</th>
                            <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Kalan</th>
                            <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Durum</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {selInvoices.map(inv => {
                            const k = Math.max(0, (inv.total_amount ?? 0) - (inv.paid_amount ?? 0))
                            const effDue = inv.due_date ?? inv.invoice_date
                            const late = effDue && effDue < today && k > 0
                            return (
                              <tr key={inv.id} className={`hover:bg-gray-50 ${late ? 'bg-red-50/40' : ''}`}>
                                <td className="px-4 py-2.5">
                                  <Link href={`/cari-hesap/faturalar/${inv.id}`}
                                    className="font-mono text-xs text-[#C8102E] hover:underline">
                                    {inv.invoice_number}
                                  </Link>
                                </td>
                                <td className="px-4 py-2.5 text-xs text-gray-600">{formatTRDate(inv.invoice_date)}</td>
                                <td className={`px-4 py-2.5 text-xs ${late ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                                  {formatTRDate(effDue)}
                                </td>
                                <td className="px-4 py-2.5 text-right text-sm font-medium text-gray-800">{formatCurrency(inv.total_amount)}</td>
                                <td className="px-4 py-2.5 text-right text-xs text-green-700">{formatCurrency(inv.paid_amount)}</td>
                                <td className={`px-4 py-2.5 text-right text-sm font-semibold ${k > 0 ? (late ? 'text-red-600' : 'text-orange-600') : 'text-gray-300'}`}>
                                  {k > 0 ? formatCurrency(k) : '—'}
                                </td>
                                <td className="px-4 py-2.5">
                                  <StatusBadge status={inv.status} />
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Sekme 2: Ödemeler */}
              {activeTab === 'odemeler' && (
                <div>
                  {selPayments.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-gray-400">Henüz ödeme kaydı yok.</div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b">
                            <tr>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Tarih</th>
                              <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Tutar</th>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Yöntem</th>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Referans</th>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Fatura</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {selPayments.map(p => {
                              const inv = selInvoices.find(i => i.id === p.invoice_id)
                              return (
                                <tr key={p.id} className="hover:bg-gray-50">
                                  <td className="px-4 py-2.5 text-xs text-gray-600">{formatTRDate(p.payment_date)}</td>
                                  <td className="px-4 py-2.5 text-right font-semibold text-green-700">{formatCurrency(p.amount)}</td>
                                  <td className="px-4 py-2.5 text-xs text-gray-600">{PAYMENT_METHOD_LABELS[p.method ?? ''] ?? p.method}</td>
                                  <td className="px-4 py-2.5 text-xs text-gray-400 font-mono">{p.reference_no ?? '—'}</td>
                                  <td className="px-4 py-2.5 text-xs">
                                    {inv && <Link href={`/cari-hesap/faturalar/${inv.id}`} className="text-[#C8102E] hover:underline font-mono">{inv.invoice_number}</Link>}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="border-t px-4 py-3 bg-gray-50 flex justify-between text-sm">
                        <span className="text-gray-500">Toplam Ödenen</span>
                        <span className="font-bold text-green-700">{formatCurrency(selPayments.reduce((s, p) => s + (p.amount ?? 0), 0))}</span>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Sekme 3: Hesap Özeti (Ekstre) */}
              {activeTab === 'ekstre' && (
                <div>
                  {ekstre.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-gray-400">İşlem kaydı yok.</div>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 border-b">
                            <tr>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Tarih</th>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">İşlem</th>
                              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Açıklama</th>
                              <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Borç</th>
                              <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Alacak</th>
                              <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Bakiye</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {ekstre.map((row, i) => (
                              <tr key={i} className="hover:bg-gray-50">
                                <td className="px-4 py-2.5 text-xs text-gray-600 whitespace-nowrap">{formatTRDate(row.date)}</td>
                                <td className="px-4 py-2.5">
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${row.tip === 'Fatura' ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'}`}>
                                    {row.tip}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-xs text-gray-700 font-mono">{row.aciklama}</td>
                                <td className="px-4 py-2.5 text-right text-sm text-gray-800">
                                  {row.borc > 0 ? formatCurrency(row.borc) : '—'}
                                </td>
                                <td className="px-4 py-2.5 text-right text-sm text-green-700">
                                  {row.alacak > 0 ? formatCurrency(row.alacak) : '—'}
                                </td>
                                <td className={`px-4 py-2.5 text-right text-sm font-bold ${row.bakiye > 0 ? 'text-orange-600' : row.bakiye < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                                  {row.bakiye === 0 ? '—' : formatCurrency(Math.abs(row.bakiye))}
                                  {row.bakiye < 0 && <span className="text-xs font-normal ml-1">(alacak)</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="border-t px-4 py-3 bg-gray-50 flex justify-between items-center">
                        <span className="text-sm font-semibold text-gray-700">Güncel Bakiye</span>
                        <span className={`text-base font-bold ${(ekstre[ekstre.length - 1]?.bakiye ?? 0) > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                          {formatCurrency(Math.abs(ekstre[ekstre.length - 1]?.bakiye ?? 0))}
                          {(ekstre[ekstre.length - 1]?.bakiye ?? 0) < 0 && <span className="text-xs font-normal ml-1">(müşteri alacaklı)</span>}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Sekme 4: Notlar */}
              {activeTab === 'notlar' && (
                <div className="p-4 space-y-3">
                  <div className="flex gap-2">
                    <input
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && note.trim()) { setNotes(p => [...p, note.trim()]); setNote('') } }}
                      placeholder="Not ekle... (Enter ile kaydet)"
                      className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                    />
                    <button
                      onClick={() => { if (note.trim()) { setNotes(p => [...p, note.trim()]); setNote('') } }}
                      className="bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26]"
                    >
                      Ekle
                    </button>
                  </div>
                  {notes.length === 0 ? (
                    <div className="text-center text-sm text-gray-400 py-6">Henüz not yok.</div>
                  ) : (
                    <div className="space-y-2">
                      {notes.map((n, i) => (
                        <div key={i} className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 flex items-start justify-between gap-2">
                          <p className="text-sm text-gray-800">{n}</p>
                          <button onClick={() => setNotes(p => p.filter((_, j) => j !== i))}
                            className="text-gray-300 hover:text-red-400 text-lg leading-none flex-shrink-0">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string | null }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    taslak:       { label: 'Taslak',       cls: 'bg-gray-100 text-gray-600 border-gray-200' },
    kesildi:      { label: 'Kesildi',      cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    gonderildi:   { label: 'Gönderildi',   cls: 'bg-purple-50 text-purple-700 border-purple-200' },
    kismi_odendi: { label: 'Kısmi Ödendi', cls: 'bg-orange-50 text-orange-700 border-orange-200' },
    odendi:       { label: 'Ödendi',       cls: 'bg-green-50 text-green-700 border-green-200' },
    iptal:        { label: 'İptal',        cls: 'bg-red-50 text-red-600 border-red-200' },
  }
  const c = cfg[status ?? '']
  if (!c) return null
  return <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${c.cls}`}>{c.label}</span>
}
