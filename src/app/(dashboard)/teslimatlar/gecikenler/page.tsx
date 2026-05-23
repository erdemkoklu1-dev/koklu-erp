import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import { GecikenlerClient, type GecikenRow } from './GecikenlerClient'

function daysLate(date: string | null | undefined) {
  if (!date) return 0
  const today = new Date().toISOString().slice(0, 10)
  return Math.max(Math.ceil((new Date(today).getTime() - new Date(date).getTime()) / 86400000), 0)
}

export default async function GecikenlerPage() {
  const supabase = createServiceClient()
  const today = new Date().toISOString().slice(0, 10)
  const [{ data: geri }, { data: emanet }] = await Promise.all([
    supabase
      .from('geri_teslim_takipleri')
      .select('*, teslimatlar(id, teslimat_no), customers(full_name), urunler(ad)')
      .in('durum', ['bekliyor', 'kismi_teslim'])
      .lt('hedef_tarih', today),
    supabase
      .from('emanet_takipleri')
      .select('*, teslimatlar(id, teslimat_no), customers(full_name), urunler(ad)')
      .in('durum', ['acik', 'kismi_kapandi'])
      .lt('hedef_tarih', today),
  ])

  const rows: GecikenRow[] = [
    ...(geri ?? []).map(row => ({
      id: row.id as string,
      tip: 'Geri teslim' as const,
      teslimat_id: (row.teslimatlar as any)?.id ?? '',
      teslimat_no: (row.teslimatlar as any)?.teslimat_no ?? '-',
      customer_name: (row.customers as any)?.full_name ?? '-',
      urun_ad: (row.urunler as any)?.ad ?? '-',
      hedef_tarih: row.hedef_tarih ?? null,
      created_at: row.created_at ?? '',
      gun: daysLate(row.hedef_tarih),
    })),
    ...(emanet ?? []).map(row => ({
      id: row.id as string,
      tip: 'Emanet' as const,
      teslimat_id: (row.teslimatlar as any)?.id ?? '',
      teslimat_no: (row.teslimatlar as any)?.teslimat_no ?? '-',
      customer_name: (row.customers as any)?.full_name ?? '-',
      urun_ad: (row.urunler as any)?.ad ?? '-',
      hedef_tarih: row.hedef_tarih ?? null,
      created_at: row.created_at ?? '',
      gun: daysLate(row.hedef_tarih),
    })),
  ].sort((a, b) => b.gun - a.gun)

  return (
    <div className="space-y-5 p-6">
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm">
          <Link href="/teslimatlar" className="flex items-center gap-1 text-[#C8102E] hover:underline">
            ← Teslimatlar
          </Link>
          <span className="text-gray-400">/</span>
          <span className="text-gray-600 dark:text-gray-400">Gecikenler</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Gecikenler</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{rows.length} geciken kayıt</p>
      </div>
      <GecikenlerClient rows={rows} />
    </div>
  )
}
