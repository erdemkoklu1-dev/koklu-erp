'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { emanetGeriAlAction, geriTeslimYapAction } from '../actions'

export type GecikenRow = {
  id: string
  tip: 'Geri teslim' | 'Emanet'
  teslimat_id: string
  teslimat_no: string
  customer_name: string
  urun_ad: string
  hedef_tarih: string | null
  created_at: string
  gun: number
}

function formatDate(value: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))
}

function getSeviyeStyle(gun: number) {
  if (gun >= 20) return 'bg-red-600 text-white'
  if (gun >= 10) return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
  if (gun >= 5) return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'
  return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
}

function ActionButton({ row }: { row: GecikenRow }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        const message = row.tip === 'Emanet'
          ? 'Bu emanet cihazı geri aldığınızı onaylıyor musunuz?'
          : 'Geri teslim yapıldığını onaylıyor musunuz?'
        if (!confirm(message)) return
        startTransition(async () => {
          if (row.tip === 'Emanet') {
            await emanetGeriAlAction(row.id)
          } else {
            await geriTeslimYapAction(row.id)
          }
          router.refresh()
        })
      }}
      className={`rounded-md px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-50 ${
        row.tip === 'Emanet' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'
      }`}
    >
      {isPending ? '...' : row.tip === 'Emanet' ? '↩ Geri Al' : '✓ Teslim Edildi'}
    </button>
  )
}

export function GecikenlerClient({ rows }: { rows: GecikenRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-12 text-center dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-2 text-3xl">✓</div>
        <div className="text-sm text-gray-500 dark:text-gray-400">Geciken teslimat kalemi yok.</div>
      </div>
    )
  }

  const tipIkon: Record<GecikenRow['tip'], string> = {
    'Geri teslim': '⏳',
    Emanet: '↻',
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700 dark:text-gray-400">
          <tr>
            <th className="px-4 py-3 text-left">Tip</th>
            <th className="px-4 py-3 text-left">Teslimat</th>
            <th className="px-4 py-3 text-left">Müşteri</th>
            <th className="px-4 py-3 text-left">Ürün</th>
            <th className="px-4 py-3 text-left">Hedef</th>
            <th className="px-4 py-3 text-left">Gecikme</th>
            <th className="px-4 py-3 text-right">İşlem</th>
          </tr>
        </thead>
        <tbody className="divide-y dark:divide-gray-700">
          {rows.map(row => (
            <tr key={`${row.tip}-${row.id}`} className={row.gun >= 10 ? 'bg-red-50 dark:bg-red-900/10' : ''}>
              <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{tipIkon[row.tip]} {row.tip}</td>
              <td className="px-4 py-3">
                <Link href={`/teslimatlar/${row.teslimat_id}`} className="font-mono text-sm font-semibold text-[#C8102E] hover:underline">
                  {row.teslimat_no}
                </Link>
              </td>
              <td className="px-4 py-3 text-gray-800 dark:text-gray-200">{row.customer_name}</td>
              <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{row.urun_ad}</td>
              <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{formatDate(row.hedef_tarih)}</td>
              <td className="px-4 py-3">
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getSeviyeStyle(row.gun)}`}>
                  {row.gun} gün
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-2">
                  <ActionButton row={row} />
                  <Link href={`/teslimatlar/${row.teslimat_id}`} className="text-xs text-[#C8102E] hover:underline">Detay</Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
