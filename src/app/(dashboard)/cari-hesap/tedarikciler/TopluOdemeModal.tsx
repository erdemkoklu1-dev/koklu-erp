'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatTRDate } from '@/lib/finance/formatters'

type Invoice = {
  id: string
  invoice_number: string
  invoice_date: string | null
  due_date: string | null
  total_amount: number | null
  paid_amount: number | null
}

type Props = {
  supplierName: string
  invoices: Invoice[]
}

export default function TopluOdemeModal({ supplierName, invoices }: Props) {
  const router = useRouter()

  const unpaid = invoices.filter(inv => ((inv.total_amount ?? 0) - (inv.paid_amount ?? 0)) > 0)

  const [open, setOpen]           = useState(false)
  const [selected, setSelected]   = useState<Record<string, boolean>>({})
  const [amounts, setAmounts]     = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState('')
  const [success, setSuccess]     = useState('')
  const [form, setForm]           = useState({
    payment_date: new Date().toISOString().split('T')[0],
    method: 'havale_eft',
    reference_no: '',
    notes: '',
  })

  function openModal() {
    const sel: Record<string, boolean> = {}
    const amt: Record<string, string>  = {}
    unpaid.forEach(inv => {
      sel[inv.id] = true
      amt[inv.id] = Math.max(0, (inv.total_amount ?? 0) - (inv.paid_amount ?? 0)).toFixed(2)
    })
    setSelected(sel)
    setAmounts(amt)
    setError('')
    setSuccess('')
    setOpen(true)
  }

  const allSelected       = unpaid.length > 0 && unpaid.every(inv => selected[inv.id])
  const selectedInvoices  = unpaid.filter(inv => selected[inv.id])
  const totalAmount       = selectedInvoices.reduce((sum, inv) => sum + (parseFloat(amounts[inv.id] ?? '0') || 0), 0)

  function toggleAll() {
    const next = !allSelected
    const sel: Record<string, boolean> = {}
    unpaid.forEach(inv => { sel[inv.id] = next })
    setSelected(sel)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    if (selectedInvoices.length === 0) { setError('En az bir fatura seçin.'); return }
    const invalidAmt = selectedInvoices.find(inv => !(parseFloat(amounts[inv.id]) > 0))
    if (invalidAmt) { setError('Seçili faturalarda geçerli tutar girin.'); return }

    setSubmitting(true)
    setError('')

    const res = await fetch('/api/toplu-odeme', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payments: selectedInvoices.map(inv => ({
          invoice_id: inv.id,
          amount:     parseFloat(amounts[inv.id]),
        })),
        payment_date: form.payment_date,
        method:       form.method,
        reference_no: form.reference_no || null,
        notes:        form.notes || null,
      }),
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Bir hata oluştu')
      setSubmitting(false)
      return
    }

    setSubmitting(false)
    setSuccess(`${data.eklendi} fatura ödendi. Toplam: ${formatCurrency(data.toplam)}`)
    setTimeout(() => {
      setOpen(false)
      setSuccess('')
      router.refresh()
    }, 1800)
  }

  if (unpaid.length === 0) return null

  return (
    <>
      <button
        onClick={openModal}
        className="text-xs bg-green-600 text-white px-2.5 py-1 rounded-lg font-medium hover:bg-green-700 transition-colors whitespace-nowrap"
      >
        Toplu Öde
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => !submitting && setOpen(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Başlık */}
            <div className="bg-green-600 px-5 py-4 rounded-t-2xl flex-shrink-0">
              <div className="text-white font-semibold">{supplierName} — Toplu Ödeme</div>
              <div className="text-green-100 text-xs mt-0.5">{unpaid.length} ödenmemiş fatura</div>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col min-h-0">
              {/* Fatura listesi */}
              <div className="overflow-y-auto flex-1 border-b">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700 border-b sticky top-0">
                    <tr>
                      <th className="px-4 py-2.5 w-10">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={toggleAll}
                          className="rounded"
                        />
                      </th>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Fatura No</th>
                      <th className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Tarih</th>
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Toplam</th>
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Kalan</th>
                      <th className="text-right px-3 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Ödenecek</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {unpaid.map(inv => {
                      const kalan    = (inv.total_amount ?? 0) - (inv.paid_amount ?? 0)
                      const checked  = !!selected[inv.id]
                      const amt      = parseFloat(amounts[inv.id] ?? '0') || 0
                      const isPartial = checked && amt > 0 && amt < kalan
                      return (
                        <tr key={inv.id} className={`${checked ? '' : 'opacity-40'} hover:bg-gray-50 transition-opacity`}>
                          <td className="px-4 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={e => setSelected(p => ({ ...p, [inv.id]: e.target.checked }))}
                              className="rounded"
                            />
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-gray-800 dark:text-gray-200">{inv.invoice_number}</td>
                          <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatTRDate(inv.invoice_date)}</td>
                          <td className="px-3 py-2 text-xs text-right text-gray-700 dark:text-gray-300">{formatCurrency(inv.total_amount)}</td>
                          <td className="px-3 py-2 text-xs text-right text-orange-600 font-medium">{formatCurrency(kalan)}</td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex flex-col items-end gap-0.5">
                              <input
                                type="number"
                                step="0.01"
                                min="0.01"
                                disabled={!checked}
                                value={amounts[inv.id] ?? ''}
                                onChange={e => setAmounts(p => ({ ...p, [inv.id]: e.target.value }))}
                                className="w-28 border rounded px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-green-500 disabled:opacity-40 disabled:bg-gray-50"
                              />
                              {isPartial && (
                                <span className="text-xs text-orange-500">Kısmi ödeme</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Alt kısım: özet + form */}
              <div className="p-5 space-y-4 flex-shrink-0">
                {/* Özet bant */}
                <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg px-4 py-2.5">
                  <span className="text-sm text-green-700">
                    <strong>{selectedInvoices.length}</strong> fatura seçili
                  </span>
                  <span className="text-base font-bold text-green-700">
                    Toplam: {formatCurrency(totalAmount)}
                  </span>
                </div>

                {/* Ödeme bilgileri */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Ödeme Tarihi</label>
                    <input
                      type="date"
                      value={form.payment_date}
                      onChange={e => setForm(p => ({ ...p, payment_date: e.target.value }))}
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Ödeme Yöntemi</label>
                    <select
                      value={form.method}
                      onChange={e => setForm(p => ({ ...p, method: e.target.value }))}
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white dark:bg-gray-800"
                    >
                      <option value="nakit">Nakit</option>
                      <option value="havale_eft">Havale / EFT</option>
                      <option value="kredi_karti">Kredi Kartı</option>
                      <option value="cek">Çek</option>
                      <option value="senet">Senet</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Referans / Dekont No</label>
                    <input
                      value={form.reference_no}
                      onChange={e => setForm(p => ({ ...p, reference_no: e.target.value }))}
                      placeholder="Opsiyonel"
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-600 dark:text-gray-300">Notlar</label>
                    <input
                      value={form.notes}
                      onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                      placeholder="Opsiyonel"
                      className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                </div>

                {error   && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
                {success && <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2 font-medium">{success}</p>}

                <div className="flex gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={submitting || selectedInvoices.length === 0}
                    className="flex-1 bg-[#C8102E] text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-[#a50d26] disabled:opacity-50 transition-colors"
                  >
                    {submitting ? 'Ödeniyor...' : `${selectedInvoices.length} Faturayı Öde — ${formatCurrency(totalAmount)}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    disabled={submitting}
                    className="px-4 py-2.5 border rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 disabled:opacity-50"
                  >
                    İptal
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
