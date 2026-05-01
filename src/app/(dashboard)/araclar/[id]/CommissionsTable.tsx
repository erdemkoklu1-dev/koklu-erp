'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { formatCurrency, formatTRDate } from '@/lib/finance/formatters'

type CommissionRow = {
  id: string
  invoice_id: string
  commission_rate: number
  commission_amount: number
  is_paid: boolean
  paid_date: string | null
  notes: string | null
  invoices: {
    invoice_number: string
    invoice_date: string
    total_amount: number
    customers: { full_name: string } | null
  } | null
}

type InvoiceOption = {
  id: string
  invoice_number: string
  invoice_date: string
  total_amount: number
  customer_name: string | null
}

type Props = {
  brokerId: string
  initialRows: CommissionRow[]
  totalJobs: number
}

export default function CommissionsTable({ brokerId, initialRows, totalJobs }: Props) {
  const supabase = createClient()
  const [rows, setRows] = useState(initialRows)
  const [invoiceOptions, setInvoiceOptions] = useState<InvoiceOption[]>([])

  // Ödeme durumu güncelleme state
  const [payingId, setPayingId] = useState<string | null>(null)
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)

  // Komisyon tutarı düzenleme state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editRate, setEditRate] = useState('')
  const [editAmount, setEditAmount] = useState('')

  // Fatura bağlama state
  const [showAddForm, setShowAddForm] = useState(false)
  const [invoiceSearch, setInvoiceSearch] = useState('')
  const [showInvoiceDrop, setShowInvoiceDrop] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceOption | null>(null)
  const [addRate, setAddRate] = useState('')
  const [addAmount, setAddAmount] = useState('')
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')

  // Fatura bağla formu açıldığında faturaları çek
  useEffect(() => {
    if (!showAddForm || invoiceOptions.length > 0) return
    fetch('/api/invoices')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setInvoiceOptions(data) })
  }, [showAddForm])

  const linkedInvoiceIds = new Set(rows.map(r => r.invoice_id))
  const filteredInvoices = invoiceOptions.filter(inv =>
    !linkedInvoiceIds.has(inv.id) && (
      inv.invoice_number.toLowerCase().includes(invoiceSearch.toLowerCase()) ||
      (inv.customer_name ?? '').toLowerCase().includes(invoiceSearch.toLowerCase())
    )
  )

  /* ---------- Ödeme tarihi kaydet ---------- */
  async function confirmPaid(row: CommissionRow) {
    setSaving(true)
    const { error } = await supabase
      .from('invoice_brokers')
      .update({ is_paid: true, paid_date: payDate, updated_at: new Date().toISOString() })
      .eq('id', row.id)
    if (!error) {
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, is_paid: true, paid_date: payDate } : r))
      setPayingId(null)
    }
    setSaving(false)
  }

  async function unmarkPaid(row: CommissionRow) {
    setSaving(true)
    const { error } = await supabase
      .from('invoice_brokers')
      .update({ is_paid: false, paid_date: null, updated_at: new Date().toISOString() })
      .eq('id', row.id)
    if (!error) {
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, is_paid: false, paid_date: null } : r))
    }
    setSaving(false)
  }

  /* ---------- Komisyon düzenle ---------- */
  function startEdit(row: CommissionRow) {
    setEditingId(row.id)
    setEditRate(String(row.commission_rate))
    setEditAmount(String(row.commission_amount))
  }

  function handleEditRateChange(val: string, rowInvoiceTotal: number) {
    setEditRate(val)
    const rate = parseFloat(val) || 0
    if (rate > 0 && rowInvoiceTotal > 0) {
      setEditAmount(String(parseFloat((rowInvoiceTotal * rate / 100).toFixed(2))))
    }
  }

  async function saveEdit(row: CommissionRow) {
    setSaving(true)
    const { error } = await supabase
      .from('invoice_brokers')
      .update({
        commission_rate: parseFloat(editRate) || 0,
        commission_amount: parseFloat(editAmount) || 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
    if (!error) {
      setRows(prev => prev.map(r => r.id === row.id
        ? { ...r, commission_rate: parseFloat(editRate) || 0, commission_amount: parseFloat(editAmount) || 0 }
        : r))
      setEditingId(null)
    }
    setSaving(false)
  }

  /* ---------- Fatura bağla ---------- */
  function handleAddRateChange(val: string) {
    setAddRate(val)
    const rate = parseFloat(val) || 0
    if (rate > 0 && selectedInvoice) {
      setAddAmount(String(parseFloat((selectedInvoice.total_amount * rate / 100).toFixed(2))))
    }
  }

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedInvoice) { setAddError('Fatura seçiniz.'); return }
    setAddSaving(true); setAddError('')
    const { data, error } = await supabase
      .from('invoice_brokers')
      .insert({
        broker_id: brokerId,
        invoice_id: selectedInvoice.id,
        commission_rate: parseFloat(addRate) || 0,
        commission_amount: parseFloat(addAmount) || 0,
        is_paid: false,
      })
      .select('id')
      .single()
    if (error) { setAddError(error.message); setAddSaving(false); return }
    // Invoices join RLS'i bypass etmek için selectedInvoice'dan doğrudan oluştur
    const newRow: CommissionRow = {
      id: data.id,
      invoice_id: selectedInvoice.id,
      commission_rate: parseFloat(addRate) || 0,
      commission_amount: parseFloat(addAmount) || 0,
      is_paid: false,
      paid_date: null,
      notes: null,
      invoices: {
        invoice_number: selectedInvoice.invoice_number,
        invoice_date: selectedInvoice.invoice_date,
        total_amount: selectedInvoice.total_amount,
        customers: selectedInvoice.customer_name ? { full_name: selectedInvoice.customer_name } : null,
      },
    }
    setRows(prev => [newRow, ...prev])
    setShowAddForm(false)
    setSelectedInvoice(null)
    setInvoiceSearch('')
    setAddRate('')
    setAddAmount('')
    setAddSaving(false)
  }

  return (
    <div className="bg-white dark:bg-gray-800 border rounded-lg">
      {/* Tablo başlığı */}
      <div className="px-5 py-3 border-b bg-gray-50 dark:bg-gray-700 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Bağlı Faturalar ({rows.length || totalJobs})</h2>
        <button
          onClick={() => setShowAddForm(v => !v)}
          className="bg-[#C8102E] text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-[#a50d26] transition-colors"
        >
          + Fatura Bağla
        </button>
      </div>

      {/* Fatura bağla formu */}
      {showAddForm && (
        <form onSubmit={handleAddSubmit} className="p-5 border-b bg-blue-50 space-y-4">
          <h4 className="text-sm font-semibold text-blue-900">Fatura Bağla</h4>

          {/* Fatura seç */}
          <div className="relative">
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Fatura</label>
            {selectedInvoice ? (
              <div className="mt-1 flex items-center justify-between border rounded-lg px-3 py-2 bg-white dark:bg-gray-800">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {selectedInvoice.invoice_number} — {selectedInvoice.customer_name ?? '-'}
                  <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">{formatCurrency(selectedInvoice.total_amount)}</span>
                </span>
                <button type="button" onClick={() => setSelectedInvoice(null)}
                  className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600">Değiştir</button>
              </div>
            ) : (
              <div className="relative mt-1">
                <input
                  value={invoiceSearch}
                  onChange={e => { setInvoiceSearch(e.target.value); setShowInvoiceDrop(true) }}
                  onFocus={() => setShowInvoiceDrop(true)}
                  onBlur={() => setTimeout(() => setShowInvoiceDrop(false), 150)}
                  placeholder="Fatura no veya müşteri ara..."
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                />
                {showInvoiceDrop && filteredInvoices.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {filteredInvoices.slice(0, 15).map(inv => (
                      <button key={inv.id} type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                        onMouseDown={e => { e.preventDefault(); setSelectedInvoice(inv); setInvoiceSearch(''); setShowInvoiceDrop(false) }}>
                        <span className="font-medium">{inv.invoice_number}</span>
                        <span className="ml-2 text-gray-500 dark:text-gray-400">{inv.customer_name ?? '-'}</span>
                        <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">{formatCurrency(inv.total_amount)}</span>
                      </button>
                    ))}
                  </div>
                )}
                {showInvoiceDrop && filteredInvoices.length === 0 && invoiceSearch && (
                  <div className="absolute z-20 mt-1 w-full bg-white dark:bg-gray-800 border rounded-lg shadow-lg px-3 py-3 text-sm text-gray-400 dark:text-gray-500">
                    Fatura bulunamadı.
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-4">
            <div>
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Komisyon Oranı (%)</label>
              <input type="number" min="0" max="100" step="0.1" value={addRate}
                onChange={e => handleAddRateChange(e.target.value)}
                className="mt-1 w-28 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                placeholder="0" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300">Komisyon Tutarı (₺)</label>
              <input type="number" min="0" step="0.01" value={addAmount}
                onChange={e => setAddAmount(e.target.value)}
                className="mt-1 w-36 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                placeholder="0,00" />
            </div>
          </div>

          {addError && <p className="text-sm text-red-600">{addError}</p>}

          <div className="flex gap-2">
            <button type="submit" disabled={addSaving}
              className="bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26] disabled:opacity-50">
              {addSaving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
            <button type="button" onClick={() => { setShowAddForm(false); setSelectedInvoice(null); setInvoiceSearch(''); setAddRate(''); setAddAmount(''); setAddError('') }}
              className="border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">
              İptal
            </button>
          </div>
        </form>
      )}

      {/* Tablo */}
      {rows.length === 0 && !showAddForm ? (
        <div className="px-4 py-10 text-center text-gray-400 dark:text-gray-500 text-sm">
          Bu aracıya bağlı fatura kaydı bulunmuyor.{' '}
          <button onClick={() => setShowAddForm(true)} className="text-[#C8102E] hover:underline">Fatura bağla →</button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700 border-b">
              <tr>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Fatura No</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Müşteri</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Fatura Tarihi</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Fatura Tutarı</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Kom. Oranı</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Kom. Tutarı</th>
                <th className="text-center px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Ödeme</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Ödeme Tarihi</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(row => {
                const inv = row.invoices
                const isEditing = editingId === row.id
                const isPaying = payingId === row.id

                return (
                  <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      {inv ? (
                        <Link href={`/cari-hesap/faturalar/${row.invoice_id}`}
                          className="text-sm font-medium text-[#C8102E] hover:underline">
                          {inv.invoice_number}
                        </Link>
                      ) : <span className="text-sm text-gray-400 dark:text-gray-500">-</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">{inv?.customers?.full_name ?? '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {inv?.invoice_date ? formatTRDate(inv.invoice_date) : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100 text-right font-medium">
                      {inv ? formatCurrency(inv.total_amount) : '-'}
                    </td>

                    {/* Komisyon oranı ve tutarı — düzenlenebilir */}
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <input type="number" min="0" max="100" step="0.1" value={editRate}
                          onChange={e => handleEditRateChange(e.target.value, inv?.total_amount ?? 0)}
                          className="w-16 border rounded px-1.5 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />
                      ) : (
                        <span className="text-sm text-gray-700 dark:text-gray-300">%{row.commission_rate}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isEditing ? (
                        <input type="number" min="0" step="0.01" value={editAmount}
                          onChange={e => setEditAmount(e.target.value)}
                          className="w-24 border rounded px-1.5 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />
                      ) : (
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(row.commission_amount)}</span>
                      )}
                    </td>

                    {/* Ödeme durumu */}
                    <td className="px-4 py-3 text-center">
                      {isPaying ? (
                        <div className="flex items-center gap-1.5 justify-center">
                          <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
                            className="border rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />
                          <button onClick={() => confirmPaid(row)} disabled={saving}
                            className="bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700 disabled:opacity-50">
                            {saving ? '...' : 'Onayla'}
                          </button>
                          <button onClick={() => setPayingId(null)}
                            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 text-xs">✕</button>
                        </div>
                      ) : row.is_paid ? (
                        <button onClick={() => unmarkPaid(row)} disabled={saving}
                          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border bg-green-50 text-green-700 border-green-200 hover:bg-green-100 disabled:opacity-50">
                          Ödendi
                        </button>
                      ) : (
                        <button
                          onClick={() => { setPayingId(row.id); setPayDate(new Date().toISOString().split('T')[0]) }}
                          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100">
                          Bekliyor
                        </button>
                      )}
                    </td>

                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {row.paid_date ? formatTRDate(row.paid_date) : '-'}
                    </td>

                    {/* Düzenle / Kaydet */}
                    <td className="px-2 py-3 text-right">
                      {isEditing ? (
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => saveEdit(row)} disabled={saving}
                            className="text-xs bg-[#C8102E] text-white px-2 py-1 rounded hover:bg-[#a50d26] disabled:opacity-50">
                            {saving ? '...' : 'Kaydet'}
                          </button>
                          <button onClick={() => setEditingId(null)}
                            className="text-xs border border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 px-2 py-1 rounded hover:bg-gray-50">
                            İptal
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(row)}
                          className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-700 px-1">
                          Düzenle
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
