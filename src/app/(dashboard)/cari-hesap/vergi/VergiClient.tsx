'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { TAX_TYPE_LABELS, DECLARATION_STATUS_CONFIG } from '@/lib/finance/formatters'

type Props =
  | { mode: 'seed'; year: number; calendarData: any[] }
  | { mode: 'add'; year: number }
  | { mode: 'edit'; declaration: any; year: number }

const TAX_TYPES = [
  'kdv', 'muhtasar', 'gelir_vergisi', 'kurumlar_vergisi', 'sgk_bildirimi', 'damga_vergisi',
]

export default function VergiClient(props: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  if (props.mode === 'seed') {
    const { year: seedYear, calendarData } = props
    async function handleSeed() {
      if (!confirm(`${seedYear} yılı için ${calendarData.length} beyanname kaydı oluşturulsun mu?`)) return
      setLoading(true)
      const { error } = await supabase.from('tax_declarations').insert(calendarData)
      if (error) alert(error.message)
      else router.refresh()
      setLoading(false)
    }
    return (
      <button onClick={handleSeed} disabled={loading}
        className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
        {loading ? 'Oluşturuluyor...' : `${seedYear} Takvimini Oluştur`}
      </button>
    )
  }

  const isEdit = props.mode === 'edit'
  const d = isEdit ? props.declaration : null

  const [form, setForm] = useState({
    tax_type: d?.tax_type ?? 'kdv',
    period_month: String(d?.period_month ?? ''),
    due_date: d?.due_date ?? '',
    declaration_date: d?.declaration_date ?? '',
    base_amount: String(d?.base_amount ?? ''),
    tax_amount: String(d?.tax_amount ?? ''),
    paid_amount: String(d?.paid_amount ?? '0'),
    status: d?.status ?? 'hazirlanacak',
    notes: d?.notes ?? '',
  })

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form.due_date) { alert('Vade tarihi zorunludur.'); return }
    setLoading(true)

    const payload = {
      tax_type: form.tax_type,
      period_year: props.year,
      period_month: form.period_month ? parseInt(form.period_month) : null,
      due_date: form.due_date,
      declaration_date: form.declaration_date || null,
      base_amount: form.base_amount ? parseFloat(form.base_amount) : null,
      tax_amount: form.tax_amount ? parseFloat(form.tax_amount) : null,
      paid_amount: parseFloat(form.paid_amount) || 0,
      status: form.status,
      notes: form.notes || null,
    }

    if (isEdit) {
      await supabase.from('tax_declarations').update(payload).eq('id', d.id)
    } else {
      await supabase.from('tax_declarations').insert([payload])
    }
    setOpen(false)
    setLoading(false)
    router.refresh()
  }

  async function handleDelete() {
    if (!d || !confirm('Bu kaydı silmek istiyor musunuz?')) return
    await supabase.from('tax_declarations').delete().eq('id', d.id)
    router.refresh()
  }

  return (
    <>
      {isEdit ? (
        <button onClick={() => setOpen(true)}
          className="text-xs text-gray-400 dark:text-gray-500 hover:text-[#C8102E] px-2 py-1 border border-transparent hover:border-gray-200 rounded">
          Düzenle
        </button>
      ) : (
        <button onClick={() => setOpen(true)}
          className="border border-[#C8102E] text-[#C8102E] px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-red-50">
          + Beyanname Ekle
        </button>
      )}

      {open && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md">
            <div className="px-5 py-4 border-b flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {isEdit ? 'Beyanname Düzenle' : 'Yeni Beyanname'}
              </h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 text-lg">×</button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Vergi Türü</label>
                  <select value={form.tax_type} onChange={e => setForm(p => ({ ...p, tax_type: e.target.value }))}
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white dark:bg-gray-800">
                    {TAX_TYPES.map(t => <option key={t} value={t}>{TAX_TYPE_LABELS[t] ?? t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Dönem Ayı</label>
                  <select value={form.period_month} onChange={e => setForm(p => ({ ...p, period_month: e.target.value }))}
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white dark:bg-gray-800">
                    <option value="">— (Yıllık)</option>
                    {['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'].map((m, i) => (
                      <option key={i + 1} value={i + 1}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Vade Tarihi <span className="text-red-500">*</span></label>
                  <input type="date" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))}
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Beyan Tarihi</label>
                  <input type="date" value={form.declaration_date} onChange={e => setForm(p => ({ ...p, declaration_date: e.target.value }))}
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Matrah (₺)</label>
                  <input type="number" step="0.01" value={form.base_amount} onChange={e => setForm(p => ({ ...p, base_amount: e.target.value }))}
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Vergi Tutarı (₺)</label>
                  <input type="number" step="0.01" value={form.tax_amount} onChange={e => setForm(p => ({ ...p, tax_amount: e.target.value }))}
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Ödenen (₺)</label>
                  <input type="number" step="0.01" value={form.paid_amount} onChange={e => setForm(p => ({ ...p, paid_amount: e.target.value }))}
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Durum</label>
                  <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E] bg-white dark:bg-gray-800">
                    {Object.entries(DECLARATION_STATUS_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Notlar</label>
                <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={loading}
                  className="flex-1 bg-[#C8102E] text-white py-2 rounded-lg font-medium hover:bg-[#a50d26] disabled:opacity-50">
                  {loading ? 'Kaydediliyor...' : 'Kaydet'}
                </button>
                {isEdit && (
                  <button type="button" onClick={handleDelete}
                    className="px-4 py-2 border border-red-200 text-red-600 rounded-lg text-sm hover:bg-red-50">
                    Sil
                  </button>
                )}
                <button type="button" onClick={() => setOpen(false)}
                  className="px-4 py-2 border rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50">
                  İptal
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
