'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { geriTeslimYapAction } from '../actions'

export type BekleyenRow = {
  id: string
  teslimat_id: string
  teslimat_no: string
  customer_id: string
  customer_name: string
  sube_ad: string
  urun_ad: string
  miktar: number
  teslim_edilen_miktar: number
  hedef_tarih: string | null
  durum: string
  created_at: string
}

function daysBetween(from: string | null, to: string) {
  if (!from) return 0
  const d1 = new Date(from)
  const d2 = new Date(to)
  return Math.floor((d2.getTime() - d1.getTime()) / 86400000)
}

function GunFarki({ hedef }: { hedef: string | null }) {
  const today = new Date().toISOString().slice(0, 10)
  if (!hedef || hedef >= today) return null
  const gun = daysBetween(hedef, today)
  return (
    <span className="ml-2 text-xs font-bold text-red-600">
      ⚠️ {gun} gün gecikmiş
    </span>
  )
}

function TeslimEtButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        {
          if (!confirm('Geri teslim yapıldığını onaylıyor musunuz?')) return
          startTransition(async () => {
            await geriTeslimYapAction(id)
            router.refresh()
          })
        }
      }
      className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
    >
      {isPending ? '...' : '✅ Teslim Edildi'}
    </button>
  )
}

function formatDate(v: string | null) {
  if (!v) return '-'
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(v))
}

export function BekleyenlerClient({ rows }: { rows: BekleyenRow[] }) {
  const today = new Date().toISOString().slice(0, 10)

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-12 text-center dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-2 text-3xl">✅</div>
        <div className="text-sm text-gray-500 dark:text-gray-400">Geri teslim bekleyen kayıt yok.</div>
      </div>
    )
  }

  // Müşteri bazında grupla
  const grouped = new Map<string, { customer_name: string; sube_ad: string; rows: BekleyenRow[] }>()
  for (const row of rows) {
    const key = `${row.customer_id}__${row.sube_ad}`
    const cur = grouped.get(key) ?? { customer_name: row.customer_name, sube_ad: row.sube_ad, rows: [] }
    cur.rows.push(row)
    grouped.set(key, cur)
  }

  return (
    <div className="space-y-4">
      {Array.from(grouped.values()).map(group => (
        <div key={`${group.customer_name}__${group.sube_ad}`} className="rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
          {/* Müşteri başlığı */}
          <div className="flex items-center gap-2 border-b bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-700">
            <span className="text-base">📍</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">{group.customer_name}</span>
            <span className="text-sm text-gray-400">({group.sube_ad})</span>
            <span className="ml-auto rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
              {group.rows.length} bekleyen
            </span>
          </div>

          {/* Kalemler */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700/50 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-2 text-left">Teslimat</th>
                  <th className="px-4 py-2 text-left">Ürün</th>
                  <th className="px-4 py-2 text-right">Kalan</th>
                  <th className="px-4 py-2 text-left">Hedef</th>
                  <th className="px-4 py-2 text-left">Durum</th>
                  <th className="px-4 py-2 text-right">İşlem</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {group.rows.map(row => {
                  const geciken = row.hedef_tarih && row.hedef_tarih < today
                  const kalan = Math.max(row.miktar - row.teslim_edilen_miktar, 0)
                  return (
                    <tr key={row.id} className={geciken ? 'bg-red-50 dark:bg-red-900/10' : ''}>
                      <td className="px-4 py-3">
                        <Link href={`/teslimatlar/${row.teslimat_id}`} className="font-mono text-sm font-semibold text-[#C8102E] hover:underline">
                          {row.teslimat_no}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-800 dark:text-gray-200">{row.urun_ad}</td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                        {kalan} / {row.miktar}
                      </td>
                      <td className="px-4 py-3">
                        <span className={geciken ? 'font-semibold text-red-600' : 'text-gray-600 dark:text-gray-300'}>
                          {formatDate(row.hedef_tarih)}
                        </span>
                        <GunFarki hedef={row.hedef_tarih} />
                      </td>
                      <td className="px-4 py-3">
                        {row.durum === 'kismi_teslim' ? (
                          <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300">
                            Kısmen teslim
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">
                            Bekliyor
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <TeslimEtButton id={row.id} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
