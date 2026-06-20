import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import { applyTenantScope, getCurrentTenantAccessFromSession } from '@/lib/auth/tenant-scope'
import { EmanetlerClient, type EmanetRow } from './EmanetlerClient'

export default async function EmanetlerPage({ searchParams }: { searchParams: Promise<{ sube?: string }> }) {
  const { sube } = await searchParams
  const supabase = createServiceClient()
  const tenantAccess = await getCurrentTenantAccessFromSession()
  let query = applyTenantScope(supabase
    .from('emanet_takipleri')
    .select('*, teslimatlar(id, teslimat_no), customers(id, full_name), subeler(id, ad), urunler(ad)')
    .in('durum', ['acik', 'kismi_kapandi'])
    .order('created_at', { ascending: false }), tenantAccess)
  if (sube) query = query.eq('sube_id', sube)
  const { data } = await query

  const rows: EmanetRow[] = (data ?? []).map(row => ({
    id: row.id as string,
    teslimat_id: (row.teslimatlar as any)?.id ?? '',
    teslimat_no: (row.teslimatlar as any)?.teslimat_no ?? '-',
    customer_name: (row.customers as any)?.full_name ?? '-',
    urun_ad: (row.urunler as any)?.ad ?? '-',
    sube_ad: (row.subeler as any)?.ad ?? 'Genel',
    miktar: Number(row.miktar ?? 0),
    geri_alinan_miktar: Number(row.geri_alinan_miktar ?? 0),
    hedef_tarih: row.hedef_tarih ?? null,
    durum: row.durum ?? 'acik',
  }))
  const today = new Date().toISOString().slice(0, 10)
  const gecikenCount = rows.filter(row => row.hedef_tarih && row.hedef_tarih < today).length

  return (
    <div className="space-y-5 p-6">
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm">
          <Link href="/teslimatlar" className="flex items-center gap-1 text-[#C8102E] hover:underline">
            ← Teslimatlar
          </Link>
          <span className="text-gray-400">/</span>
          <span className="text-gray-600 dark:text-gray-400">Açık Emanetler</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Açık emanetler</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {rows.length} açık kayıt
          {gecikenCount > 0 && <span className="ml-2 font-semibold text-red-600">· {gecikenCount} gecikmiş ⚠</span>}
        </p>
      </div>
      <EmanetlerClient rows={rows} />
    </div>
  )
}
