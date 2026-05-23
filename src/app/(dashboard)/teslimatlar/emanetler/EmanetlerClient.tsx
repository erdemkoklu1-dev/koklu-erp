'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { emanetGeriAlAction } from '../actions'

export type EmanetRow = {
  id: string
  teslimat_id: string
  teslimat_no: string
  customer_name: string
  urun_ad: string
  sube_ad: string
  miktar: number
  geri_alinan_miktar: number
  hedef_tarih: string | null
  durum: string
}

function formatDate(value: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))
}

function gecikmeGun(hedef: string | null) {
  if (!hedef) return 0
  const today = new Date().toISOString().slice(0, 10)
  if (hedef >= today) return 0
  return Math.ceil((new Date(today).getTime() - new Date(hedef).getTime()) / 86400000)
}

function GeriAlButton({ id }: { id: string }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (!confirm('Bu emanet cihazı geri aldığınızı onaylıyor musunuz?')) return
        startTransition(async () => {
          await emanetGeriAlAction(id)
          router.refresh()
        })
      }}
      className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
    >
      {isPending ? '...' : '↩ Geri Al'}
    </button>
  )
}

export function EmanetlerClient({ rows }: { rows: EmanetRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-12 text-center dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-2 text-3xl">✓</div>
        <div className="text-sm text-gray-500 dark:text-gray-400">Açık emanet kaydı yok.</div>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700 dark:text-gray-400">
          <tr>
            <th className="px-4 py-3 text-left">Teslimat</th>
            <th className="px-4 py-3 text-left">Müşteri</th>
            <th className="px-4 py-3 text-left">Ürün</th>
            <th className="px-4 py-3 text-left">Şube</th>
            <th className="px-4 py-3 text-right">Miktar</th>
            <th className="px-4 py-3 text-left">Hedef</th>
            <th className="px-4 py-3 text-left">Durum</th>
            <th className="px-4 py-3 text-right">İşlem</th>
          </tr>
        </thead>
        <tbody className="divide-y dark:divide-gray-700">
          {rows.map(row => {
            const gecikme = gecikmeGun(row.hedef_tarih)
            return (
              <tr key={row.id} className={gecikme > 0 ? 'bg-red-50 dark:bg-red-900/10' : ''}>
                <td className="px-4 py-3">
                  <Link className="font-mono text-sm font-semibold text-[#C8102E] hover:underline" href={`/teslimatlar/${row.teslimat_id}`}>
                    {row.teslimat_no}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-800 dark:text-gray-200">{row.customer_name}</td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{row.urun_ad}</td>
                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{row.sube_ad}</td>
                <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{row.geri_alinan_miktar}/{row.miktar}</td>
                <td className="px-4 py-3">
                  <span className={gecikme > 0 ? 'font-semibold text-red-600' : 'text-gray-600 dark:text-gray-300'}>
                    {formatDate(row.hedef_tarih)}
                  </span>
                  {gecikme > 0 && (
                    <span className="ml-2 text-xs font-bold text-red-600">⚠ {gecikme} gün gecikmiş</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                    ↻ Açık
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <GeriAlButton id={row.id} />
                    <Link href={`/teslimatlar/${row.teslimat_id}`} className="text-xs text-[#C8102E] hover:underline">Detay</Link>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
