'use client'

import type { MaterialListItem, TechnicalReportType } from '@/lib/technical-reports/types'

type Props = {
  reportType: TechnicalReportType
  value: MaterialListItem[]
  onChange: (items: MaterialListItem[]) => void
}

export default function MaterialListEditor({ reportType, value, onChange }: Props) {
  function update(index: number, patch: Partial<MaterialListItem>) {
    onChange(value.map((item, i) => i === index ? { ...item, ...patch, manuel_duzenlendi: true } : item))
  }

  function add() {
    onChange([...value, {
      id: crypto.randomUUID(),
      urun_adi: '',
      kategori: '',
      miktar: 1,
      birim: 'adet',
      aciklama: '',
      rapor_kaynagi: reportType,
      manuel_duzenlendi: true,
    }])
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index))
  }

  return (
    <div className="rounded-lg border bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">İhtiyaç Listesi</h2>
        <button type="button" onClick={add} className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700">
          Kalem Ekle
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-300">
            <tr>
              <th className="px-2 py-2 text-left">Ürün Adı</th>
              <th className="px-2 py-2 text-left">Kategori</th>
              <th className="px-2 py-2 text-left">Miktar</th>
              <th className="px-2 py-2 text-left">Birim</th>
              <th className="px-2 py-2 text-left">Açıklama</th>
              <th className="px-2 py-2 text-right">Aksiyon</th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-700">
            {value.map((item, index) => (
              <tr key={item.id}>
                <td className="px-2 py-2"><input value={item.urun_adi} onChange={e => update(index, { urun_adi: e.target.value })} className="w-full rounded border px-2 py-1 dark:border-gray-600" /></td>
                <td className="px-2 py-2"><input value={item.kategori} onChange={e => update(index, { kategori: e.target.value })} className="w-full rounded border px-2 py-1 dark:border-gray-600" /></td>
                <td className="px-2 py-2"><input type="number" min="0" value={item.miktar} onChange={e => update(index, { miktar: Number(e.target.value) })} className="w-24 rounded border px-2 py-1 dark:border-gray-600" /></td>
                <td className="px-2 py-2"><input value={item.birim} onChange={e => update(index, { birim: e.target.value })} className="w-24 rounded border px-2 py-1 dark:border-gray-600" /></td>
                <td className="px-2 py-2"><input value={item.aciklama} onChange={e => update(index, { aciklama: e.target.value })} className="w-full rounded border px-2 py-1 dark:border-gray-600" /></td>
                <td className="px-2 py-2 text-right"><button type="button" onClick={() => remove(index)} className="text-xs font-medium text-red-600 hover:underline">Sil</button></td>
              </tr>
            ))}
            {value.length === 0 && (
              <tr><td colSpan={6} className="px-2 py-8 text-center text-gray-500">Henüz kalem oluşturulmadı.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
