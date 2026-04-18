'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { calculateSalaryDeductions } from '@/lib/finance/calculations'
import { formatCurrency, MONTHS_TR } from '@/lib/finance/formatters'

type Props =
  | { mode: 'add-employee'; employees: any[] }
  | { mode: 'pay-button'; employee: any; year: number; month: number; employees: any[] }

export default function MaaslarClient(props: Props) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  if (props.mode === 'add-employee') {
    return (
      <>
        <button onClick={() => setOpen(true)}
          className="border border-[#C8102E] text-[#C8102E] px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-red-50">
          + Çalışan Ekle
        </button>
        {open && <EmployeeModal onClose={() => { setOpen(false); router.refresh() }} />}
      </>
    )
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="text-xs bg-[#C8102E] text-white px-3 py-1.5 rounded-lg font-medium hover:bg-[#a50d26]">
        Öde
      </button>
      {open && (
        <SalaryPayModal
          employee={props.employee}
          year={props.year}
          month={props.month}
          onClose={() => { setOpen(false); router.refresh() }}
        />
      )}
    </>
  )
}

function EmployeeModal({ onClose }: { onClose: () => void }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    full_name: '', title: '', tc_no: '', sgk_no: '', phone: '', iban: '',
    gross_salary: '', start_date: new Date().toISOString().split('T')[0], notes: '',
  })
  const supabase = createClient()

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.full_name.trim()) { setError('Ad soyad zorunludur.'); return }
    if (!form.gross_salary || parseFloat(form.gross_salary) <= 0) { setError('Brüt maaş zorunludur.'); return }
    setLoading(true)
    const { error: err } = await supabase.from('employees').insert([{
      full_name: form.full_name, title: form.title || null,
      tc_no: form.tc_no || null, sgk_no: form.sgk_no || null,
      phone: form.phone || null, iban: form.iban || null,
      gross_salary: parseFloat(form.gross_salary),
      start_date: form.start_date, notes: form.notes || null, status: 'aktif',
    }])
    if (err) { setError(err.message); setLoading(false); return }
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Yeni Çalışan Ekle</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
        </div>
        <form onSubmit={handleSave} className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700">Ad Soyad</label>
              <input value={form.full_name} onChange={e => setForm(p => ({ ...p, full_name: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Ünvan</label>
              <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]"
                placeholder="Teknisyen, Muhasebe..." />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Brüt Maaş (₺)</label>
              <input type="number" step="0.01" value={form.gross_salary}
                onChange={e => setForm(p => ({ ...p, gross_salary: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">TC Kimlik No</label>
              <input value={form.tc_no} onChange={e => setForm(p => ({ ...p, tc_no: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">SGK No</label>
              <input value={form.sgk_no} onChange={e => setForm(p => ({ ...p, sgk_no: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Telefon</label>
              <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">IBAN</label>
              <input value={form.iban} onChange={e => setForm(p => ({ ...p, iban: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">İşe Başlama</label>
              <input type="date" value={form.start_date}
                onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={loading}
              className="flex-1 bg-[#C8102E] text-white py-2 rounded-lg font-medium hover:bg-[#a50d26] disabled:opacity-50">
              {loading ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
            <button type="button" onClick={onClose}
              className="px-5 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">İptal</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function SalaryPayModal({
  employee, year, month, onClose,
}: {
  employee: any; year: number; month: number; onClose: () => void
}) {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const gross = employee.gross_salary ?? 0
  const calcs = calculateSalaryDeductions(gross)
  const [form, setForm] = useState({
    gross_amount: String(gross.toFixed(2)),
    sgk_employee: String(calcs.sgk_employee.toFixed(2)),
    sgk_employer: String(calcs.sgk_employer.toFixed(2)),
    income_tax: String(calcs.income_tax.toFixed(2)),
    stamp_tax: String(calcs.stamp_tax.toFixed(2)),
    net_amount: String(calcs.net.toFixed(2)),
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'havale_eft',
    notes: '',
  })

  function recalc(newGross: number) {
    const c = calculateSalaryDeductions(newGross)
    setForm(p => ({
      ...p,
      sgk_employee: c.sgk_employee.toFixed(2),
      sgk_employer: c.sgk_employer.toFixed(2),
      income_tax: c.income_tax.toFixed(2),
      stamp_tax: c.stamp_tax.toFixed(2),
      net_amount: c.net.toFixed(2),
    }))
  }

  async function handlePay(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')

    const { data: catData } = await supabase.from('expense_categories')
      .select('id').eq('name', 'Maaş Ödemeleri').single()
    const { data: sgkCatData } = await supabase.from('expense_categories')
      .select('id').eq('name', 'SGK İşveren Payı').single()

    // Maaş işlemi
    const { data: txn } = await supabase.from('transactions').insert([{
      direction: 'gider',
      category_id: catData?.id,
      transaction_date: form.payment_date,
      amount: parseFloat(form.net_amount),
      kdv_included: false, kdv_rate: 0, kdv_amount: 0,
      net_amount: parseFloat(form.net_amount),
      description: `${employee.full_name} — ${MONTHS_TR[month - 1]} ${year} Maaşı`,
      payment_method: form.payment_method as any,
    }]).select('id').single()

    // SGK işlemi
    const sgkAmount = parseFloat(form.sgk_employer)
    if (sgkAmount > 0) {
      await supabase.from('transactions').insert([{
        direction: 'gider',
        category_id: sgkCatData?.id,
        transaction_date: form.payment_date,
        amount: sgkAmount, kdv_included: false, kdv_rate: 0, kdv_amount: 0, net_amount: sgkAmount,
        description: `${employee.full_name} — ${MONTHS_TR[month - 1]} ${year} SGK İşveren Payı`,
        payment_method: 'havale_eft' as any,
      }])
    }

    // Maaş ödeme kaydı
    const { error: err } = await supabase.from('salary_payments').insert([{
      employee_id: employee.id,
      payment_year: year,
      payment_month: month,
      gross_amount: parseFloat(form.gross_amount),
      sgk_employee: parseFloat(form.sgk_employee),
      sgk_employer: sgkAmount,
      income_tax: parseFloat(form.income_tax),
      stamp_tax: parseFloat(form.stamp_tax),
      net_amount: parseFloat(form.net_amount),
      payment_date: form.payment_date,
      payment_method: form.payment_method as any,
      transaction_id: txn?.id ?? null,
      notes: form.notes || null,
    }])

    if (err) { setError(err.message); setLoading(false); return }
    onClose()
  }

  const employerTotal = parseFloat(form.gross_amount) + parseFloat(form.sgk_employer)

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{employee.full_name}</h3>
            <p className="text-xs text-gray-400">{MONTHS_TR[month - 1]} {year} Maaş Ödemesi</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">×</button>
        </div>
        <form onSubmit={handlePay} className="p-5 space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700">Brüt Maaş (₺)</label>
            <input type="number" step="0.01" value={form.gross_amount}
              onChange={e => {
                setForm(p => ({ ...p, gross_amount: e.target.value }))
                const v = parseFloat(e.target.value) || 0
                if (v > 0) recalc(v)
              }}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
          </div>
          <div className="bg-gray-50 border rounded-lg p-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">SGK İşçi (%15)</span>
              <input type="number" step="0.01" value={form.sgk_employee}
                onChange={e => setForm(p => ({ ...p, sgk_employee: e.target.value }))}
                className="w-28 border rounded px-2 py-0.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Gelir Vergisi</span>
              <input type="number" step="0.01" value={form.income_tax}
                onChange={e => setForm(p => ({ ...p, income_tax: e.target.value }))}
                className="w-28 border rounded px-2 py-0.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Damga Vergisi (%0.759)</span>
              <input type="number" step="0.01" value={form.stamp_tax}
                onChange={e => setForm(p => ({ ...p, stamp_tax: e.target.value }))}
                className="w-28 border rounded px-2 py-0.5 text-sm text-right focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />
            </div>
            <div className="flex justify-between font-semibold border-t pt-1.5">
              <span className="text-gray-900">Net Ödenecek</span>
              <input type="number" step="0.01" value={form.net_amount}
                onChange={e => setForm(p => ({ ...p, net_amount: e.target.value }))}
                className="w-28 border-2 border-[#C8102E] rounded px-2 py-0.5 text-sm text-right font-bold text-[#C8102E] focus:outline-none" />
            </div>
            <div className="flex justify-between text-xs text-gray-500 border-t pt-1">
              <span>SGK İşveren (%22.5)</span>
              <input type="number" step="0.01" value={form.sgk_employer}
                onChange={e => setForm(p => ({ ...p, sgk_employer: e.target.value }))}
                className="w-28 border rounded px-2 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-[#C8102E]" />
            </div>
            <div className="flex justify-between text-xs text-red-600 font-medium">
              <span>Toplam İşveren Maliyeti</span>
              <span>{formatCurrency(employerTotal)}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Ödeme Tarihi</label>
              <input type="date" value={form.payment_date}
                onChange={e => setForm(p => ({ ...p, payment_date: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Yöntem</label>
              <select value={form.payment_method} onChange={e => setForm(p => ({ ...p, payment_method: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white">
                <option value="havale_eft">Havale / EFT</option>
                <option value="nakit">Nakit</option>
              </select>
            </div>
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={loading}
              className="flex-1 bg-green-600 text-white py-2 rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50">
              {loading ? 'Ödeniyor...' : `${formatCurrency(parseFloat(form.net_amount) || 0)} Öde`}
            </button>
            <button type="button" onClick={onClose}
              className="px-5 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">İptal</button>
          </div>
        </form>
      </div>
    </div>
  )
}
