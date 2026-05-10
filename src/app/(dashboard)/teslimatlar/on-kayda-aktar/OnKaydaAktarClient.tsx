'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { manuelOnKaydaAktarAction } from '../actions'

type Row = {
  id: string
  teslimat_id: string
  teslimat_no: string
  teslimat_tarihi: string | null
  teslimat_durum: string
  customer_name: string
  aciklama: string
  miktar: number
  birim: string
  birim_fiyat: number
  toplam_tutar: number
  durum: string
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(value || 0)
}

function formatDate(value: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('tr-TR').format(new Date(value))
}

export function OnKaydaAktarClient({ rows }: { rows: Row[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Row | null>(null)
  const [editing, setEditing] = useState<Row | null>(null)
  const [form, setForm] = useState({ aciklama: '', miktar: '1', birim_fiyat: '0', toplam_tutar: '0', notlar: '' })
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  const hesaplananToplam = useMemo(() => {
    return (Number(form.miktar) || 0) * (Number(form.birim_fiyat) || 0)
  }, [form.miktar, form.birim_fiyat])

  function openEdit(row: Row) {
    setError('')
    setEditing(row)
    setForm({
      aciklama: row.aciklama,
      miktar: String(row.miktar),
      birim_fiyat: String(row.birim_fiyat),
      toplam_tutar: String(row.toplam_tutar || row.miktar * row.birim_fiyat),
      notlar: '',
    })
  }

  function aktar(row: Row, edited = false) {
    const payload = edited
      ? form
      : {
          aciklama: row.aciklama,
          miktar: row.miktar,
          birim_fiyat: row.birim_fiyat,
          toplam_tutar: row.toplam_tutar,
          notlar: '',
        }

    setError('')
    startTransition(async () => {
      const result = await manuelOnKaydaAktarAction(row.id, JSON.stringify(payload))
      if (!result.ok) {
        setError(result.message)
        return
      }
      setEditing(null)
      setSelected(null)
      router.refresh()
    })
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left">Teslimat</th>
              <th className="px-4 py-3 text-left">Müşteri</th>
              <th className="px-4 py-3 text-left">Kalem</th>
              <th className="px-4 py-3 text-right">Tutar</th>
              <th className="px-4 py-3 text-left">Tarih</th>
              <th className="px-4 py-3 text-left">Durum</th>
              <th className="px-4 py-3 text-left">Ön kayıt</th>
              <th className="px-4 py-3 text-right">İşlem</th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-700">
            {rows.map(row => (
              <tr key={row.id}>
                <td className="px-4 py-3"><Link href={`/teslimatlar/${row.teslimat_id}`} className="text-[#C8102E]">{row.teslimat_no}</Link></td>
                <td className="px-4 py-3">{row.customer_name}</td>
                <td className="px-4 py-3">{row.aciklama}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(row.toplam_tutar)}</td>
                <td className="px-4 py-3">{formatDate(row.teslimat_tarihi)}</td>
                <td className="px-4 py-3">{row.teslimat_durum}</td>
                <td className="px-4 py-3">{row.durum}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-3">
                    <button type="button" onClick={() => setSelected(row)} className="text-[#C8102E]">Detay</button>
                    <button type="button" onClick={() => openEdit(row)} className="text-[#C8102E]">Düzenle</button>
                    <button type="button" onClick={() => aktar(row)} disabled={isPending} className="text-[#C8102E] disabled:opacity-50">Ön kayda aktar</button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-gray-400">Kontrol gerektiren kalem yok.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl dark:bg-gray-800">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Kalem detayı</h2>
              <button type="button" onClick={() => setSelected(null)} className="text-sm text-gray-500">Kapat</button>
            </div>
            <div className="grid gap-2 text-sm">
              <div><span className="text-gray-400">Teslimat:</span> {selected.teslimat_no}</div>
              <div><span className="text-gray-400">Müşteri:</span> {selected.customer_name}</div>
              <div><span className="text-gray-400">Kalem:</span> {selected.aciklama}</div>
              <div><span className="text-gray-400">Miktar:</span> {selected.miktar} {selected.birim}</div>
              <div><span className="text-gray-400">Birim fiyat:</span> {formatCurrency(selected.birim_fiyat)}</div>
              <div><span className="text-gray-400">Toplam:</span> {formatCurrency(selected.toplam_tutar)}</div>
              <div><span className="text-gray-400">Durum:</span> {selected.durum}</div>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-lg bg-white p-5 shadow-xl dark:bg-gray-800">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Ön kayda aktar</h2>
              <button type="button" onClick={() => setEditing(null)} className="text-sm text-gray-500">Kapat</button>
            </div>
            <div className="grid gap-3 text-sm">
              <label className="grid gap-1">
                <span>Açıklama</span>
                <input value={form.aciklama} onChange={e => setForm(prev => ({ ...prev, aciklama: e.target.value }))} className="rounded-md border px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
              </label>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="grid gap-1">
                  <span>Miktar</span>
                  <input type="number" step="any" value={form.miktar} onChange={e => setForm(prev => ({ ...prev, miktar: e.target.value, toplam_tutar: String((Number(e.target.value) || 0) * (Number(prev.birim_fiyat) || 0)) }))} className="rounded-md border px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
                </label>
                <label className="grid gap-1">
                  <span>Birim fiyat</span>
                  <input type="number" step="0.01" value={form.birim_fiyat} onChange={e => setForm(prev => ({ ...prev, birim_fiyat: e.target.value, toplam_tutar: String((Number(prev.miktar) || 0) * (Number(e.target.value) || 0)) }))} className="rounded-md border px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
                </label>
                <label className="grid gap-1">
                  <span>Toplam tutar</span>
                  <input type="number" step="0.01" value={form.toplam_tutar} onChange={e => setForm(prev => ({ ...prev, toplam_tutar: e.target.value }))} className="rounded-md border px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
                </label>
              </div>
              <div className="text-xs text-gray-400">Hesaplanan toplam: {formatCurrency(hesaplananToplam)}</div>
              <label className="grid gap-1">
                <span>Not</span>
                <textarea value={form.notlar} onChange={e => setForm(prev => ({ ...prev, notlar: e.target.value }))} className="min-h-20 rounded-md border px-3 py-2 dark:border-gray-700 dark:bg-gray-900" />
              </label>
              {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditing(null)} className="rounded-md border px-4 py-2">İptal</button>
                <button type="button" onClick={() => aktar(editing, true)} disabled={isPending} className="rounded-md bg-[#C8102E] px-4 py-2 font-semibold text-white disabled:opacity-50">
                  {isPending ? 'Aktarılıyor...' : 'Ön kayda aktar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
