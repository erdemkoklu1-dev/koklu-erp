import Link from 'next/link'
import type { ComponentProps } from 'react'
import { createServiceClient } from '@/lib/supabase/service'
import OperationShell from '../../_components/OperationShell'
import { getCurrentAccess } from '@/lib/auth/authorization'
import { applyBranchScope, filterVisibleBranches, getLockedBranchId } from '@/lib/auth/branch-scope'
import { applyTenantScope, getCurrentTenantAccessFromSession } from '@/lib/auth/tenant-scope'
import IsPlaniForm from './IsPlaniForm'

type IsPlaniFormProps = ComponentProps<typeof IsPlaniForm>
type SearchParams = Promise<{ requestId?: string }>

type RequestRow = {
  id: string
  talep_no: string | null
  customer_id: string | null
  customer_name_snapshot: string | null
  baslik: string | null
  aciklama: string | null
  kategori: string | null
  oncelik: string | null
  hedef_tarih: string | null
  sube_id: string | null
  ilgili_is_plani_id: string | null
  customers?: { phone?: string | null; address?: string | null } | { phone?: string | null; address?: string | null }[] | null
}

function relationOne<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

function planTuruFromKategori(kategori: string | null) {
  if (kategori === 'Arıza') return 'Arıza Planı'
  if (kategori === 'Teslimat Talebi') return 'Teslimat Planı'
  if (kategori === 'Dolum Talebi') return 'Dolum Toplama Planı'
  if (kategori === 'Bakım Talebi' || kategori === 'Periyodik Kontrol') return 'Periyodik Bakım'
  return 'Genel Saha Görevi'
}

export default async function YeniIsPlaniPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const requestId = typeof params.requestId === 'string' ? params.requestId : null
  const supabase = createServiceClient()
  const access = await getCurrentAccess()
  const tenantAccess = await getCurrentTenantAccessFromSession()

  let customersQuery = supabase
    .from('customers')
    .select('id, full_name, phone, address, sube_id')
    .eq('is_active', true)
    .order('full_name')
  customersQuery = applyBranchScope(applyTenantScope(customersQuery, tenantAccess), access)

  let personellerQuery = supabase
    .from('personeller')
    .select('id, ad, soyad, sube_id')
    .eq('durum', 'aktif')
    .order('ad')
  personellerQuery = applyBranchScope(personellerQuery, access)

  let requestQuery = requestId
    ? applyTenantScope(supabase
      .from('musteri_talepleri')
      .select('id, talep_no, customer_id, customer_name_snapshot, baslik, aciklama, kategori, oncelik, hedef_tarih, sube_id, ilgili_is_plani_id, customers(phone, address)')
      .eq('id', requestId), tenantAccess)
    : null
  if (requestQuery) requestQuery = applyBranchScope(requestQuery, access)

  const [{ data: customers }, { data: subeler }, { data: personeller }, requestResult] = await Promise.all([
    customersQuery,
    supabase.from('subeler').select('id, ad').eq('aktif', true).order('ad'),
    personellerQuery,
    requestQuery ? requestQuery.maybeSingle() : Promise.resolve({ data: null }),
  ])

  const visibleSubeler = filterVisibleBranches((subeler ?? []) as { id: string; ad: string | null }[], access)
  const lockedSubeId = getLockedBranchId(access)
  const defaultSubeId = lockedSubeId ?? visibleSubeler.find(sube => sube.ad === 'Erzincan Merkez')?.id ?? visibleSubeler[0]?.id ?? ''
  const request = requestResult.data as RequestRow | null
  const requestCustomer = relationOne(request?.customers)

  const initialValues = request
    ? {
      mode: 'single' as const,
      sourceRequestId: request.id,
      sourceRequestNo: request.talep_no,
      existingPlanId: request.ilgili_is_plani_id,
      baslik: request.baslik ?? '',
      aciklama: request.aciklama ?? '',
      customerId: request.customer_id ?? '',
      manualCustomerName: request.customer_id ? '' : request.customer_name_snapshot ?? '',
      phone: requestCustomer?.phone ?? '',
      address: requestCustomer?.address ?? '',
      subeId: request.sube_id ?? defaultSubeId,
      planTuru: planTuruFromKategori(request.kategori),
      oncelik: request.oncelik ?? 'Normal',
      baslangicTarihi: request.hedef_tarih ?? new Date().toISOString().slice(0, 10),
      bitisTarihi: '',
      tekrarTipi: 'Tek seferlik',
      tekrarAraligi: 1,
      isSayisi: 1,
      durum: 'Aktif',
    }
    : undefined

  return (
    <OperationShell active="is-planlari" title="Yeni İş Planı">
      <div className="mx-auto max-w-5xl space-y-5 p-6">
        <div>
          <Link href="/operasyon/is-planlari" className="text-sm text-gray-500 hover:text-gray-700">← İş Planları</Link>
          <h1 className="mt-2 text-xl font-bold text-gray-900 dark:text-gray-100">Yeni İş Planı</h1>
        </div>

        <IsPlaniForm
          customers={(customers ?? []) as IsPlaniFormProps['customers']}
          subeler={visibleSubeler}
          personeller={(personeller ?? []) as IsPlaniFormProps['personeller']}
          defaultSubeId={defaultSubeId}
          lockedSubeId={lockedSubeId}
          initialValues={initialValues}
          requestNotFound={Boolean(requestId && !request)}
        />
      </div>
    </OperationShell>
  )
}
