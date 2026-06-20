import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import { applyTenantScope, getCurrentTenantAccessFromSession } from '@/lib/auth/tenant-scope'
import { BekleyenlerClient, type BekleyenRow } from './BekleyenlerClient'

export default async function BekleyenlerPage() {
  const supabase = createServiceClient()
  const tenantAccess = await getCurrentTenantAccessFromSession()

  const { data } = await applyTenantScope(supabase
    .from('geri_teslim_takipleri')
    .select('*, teslimatlar(id, teslimat_no), customers(id, full_name), subeler(id, ad), urunler(ad)')
    .in('durum', ['bekliyor', 'kismi_teslim'])
    .order('hedef_tarih', { ascending: true }), tenantAccess)

  const rows: BekleyenRow[] = (data ?? []).map(row => ({
    id: row.id as string,
    teslimat_id: (row.teslimatlar as any)?.id ?? '',
    teslimat_no: (row.teslimatlar as any)?.teslimat_no ?? '-',
    customer_id: (row.customers as any)?.id ?? '',
    customer_name: (row.customers as any)?.full_name ?? '-',
    sube_ad: (row.subeler as any)?.ad ?? 'Genel',
    urun_ad: (row.urunler as any)?.ad ?? (row.aciklama as string | null) ?? '-',
    miktar: Number(row.miktar ?? 0),
    teslim_edilen_miktar: Number(row.teslim_edilen_miktar ?? 0),
    hedef_tarih: row.hedef_tarih ?? null,
    durum: row.durum ?? 'bekliyor',
    created_at: row.created_at ?? '',
  }))

  const today = new Date().toISOString().slice(0, 10)
  const gecikenCount = rows.filter(r => r.hedef_tarih && r.hedef_tarih < today).length

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm">
            <Link href="/teslimatlar" className="flex items-center gap-1 text-[#C8102E] hover:underline">
              ← Teslimatlar
            </Link>
            <span className="text-gray-400">/</span>
            <span className="text-gray-600 dark:text-gray-400">Geri Teslim Bekleyenler</span>
          </div>
          <h1 className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">Geri teslim bekleyenler</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {rows.length} açık kayıt
            {gecikenCount > 0 && (
              <span className="ml-2 font-semibold text-red-600">· {gecikenCount} gecikmiş ⚠️</span>
            )}
          </p>
        </div>
      </div>

      <BekleyenlerClient rows={rows} />
    </div>
  )
}
