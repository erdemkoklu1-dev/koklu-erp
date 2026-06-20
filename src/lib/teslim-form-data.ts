import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import { applyTenantScope, getCurrentTenantAccessFromSession } from '@/lib/auth/tenant-scope'

export type TeslimFormData = {
  teslimat: any
  kalemler: any[]
  emanetler: any[]
  bekleyenler: any[]
}

export async function getTeslimFormData(id: string): Promise<TeslimFormData> {
  const supabase = createServiceClient()
  const tenantAccess = await getCurrentTenantAccessFromSession()
  let teslimatQuery = supabase
    .from('teslimatlar')
    .select('*, customers(id, full_name, phone, email, address, tax_number, authorized_person, authorized_phone), subeler(ad), personeller(ad, soyad)')
    .eq('id', id)
  teslimatQuery = applyTenantScope(teslimatQuery, tenantAccess)
  let kalemQuery = supabase
    .from('teslimat_kalemleri')
    .select('*, urunler(ad, kategori)')
    .eq('teslimat_id', id)
    .order('created_at')
  kalemQuery = applyTenantScope(kalemQuery, tenantAccess)
  let emanetQuery = supabase
    .from('emanet_takipleri')
    .select('*, urunler(ad)')
    .eq('teslimat_id', id)
  emanetQuery = applyTenantScope(emanetQuery, tenantAccess)
  let geriQuery = supabase
    .from('geri_teslim_takipleri')
    .select('*, urunler(ad)')
    .eq('teslimat_id', id)
  geriQuery = applyTenantScope(geriQuery, tenantAccess)
  const [
    { data: teslimat },
    { data: kalemler },
    { data: emanetler },
    { data: bekleyenler },
  ] = await Promise.all([
    teslimatQuery.maybeSingle(),
    kalemQuery,
    emanetQuery,
    geriQuery,
  ])

  if (!teslimat) notFound()

  return {
    teslimat,
    kalemler: kalemler ?? [],
    emanetler: emanetler ?? [],
    bekleyenler: bekleyenler ?? [],
  }
}

export function teslimFormFileName(teslimatNo: string | null | undefined) {
  const safeNo = String(teslimatNo ?? 'teslim-formu').replace(/[^a-zA-Z0-9ğüşöçıİĞÜŞÖÇ-]+/g, '-')
  return `${safeNo}-teslim-formu.pdf`
}
