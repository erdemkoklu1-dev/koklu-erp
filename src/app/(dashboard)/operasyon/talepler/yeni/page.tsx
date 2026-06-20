import Link from 'next/link'
import type { ComponentProps } from 'react'
import { createServiceClient } from '@/lib/supabase/service'
import OperationShell from '../../_components/OperationShell'
import { getCurrentAccess } from '@/lib/auth/authorization'
import { applyBranchScope, filterVisibleBranches, getLockedBranchId } from '@/lib/auth/branch-scope'
import { applyTenantScope, getCurrentTenantAccessFromSession } from '@/lib/auth/tenant-scope'
import TalepForm from './TalepForm'

type CustomerRow = {
  id: string
  full_name: string | null
  sube_id: string | null
}

type TalepFormProps = ComponentProps<typeof TalepForm>

export default async function YeniTalepPage() {
  const supabase = createServiceClient()
  const access = await getCurrentAccess()
  const tenantAccess = await getCurrentTenantAccessFromSession()

  let customersQuery = supabase
    .from('customers')
    .select('id, full_name, sube_id')
    .eq('is_active', true)
    .order('full_name')
  customersQuery = applyBranchScope(applyTenantScope(customersQuery, tenantAccess), access)

  let personellerQuery = supabase
    .from('personeller')
    .select('id, ad, soyad, sube_id, subeler(ad)')
    .eq('durum', 'aktif')
    .order('ad')
  personellerQuery = applyBranchScope(personellerQuery, access)

  const [{ data: customers }, { data: subeler }, { data: personeller }] = await Promise.all([
    customersQuery,
    supabase.from('subeler').select('id, ad').eq('aktif', true).order('ad'),
    personellerQuery,
  ])

  const customerRows = (customers ?? []) as CustomerRow[]
  const customerIds = customerRows.map(customer => customer.id)
  const { data: devices } = customerIds.length > 0
    ? await applyTenantScope(supabase
      .from('devices')
      .select('id, customer_id, custom_device_name, capacity, serial_number, device_types(name)')
      .eq('is_active', true)
      .in('customer_id', customerIds)
      .order('created_at', { ascending: false })
      .limit(500), tenantAccess)
    : { data: [] }

  const visibleSubeler = filterVisibleBranches((subeler ?? []) as { id: string; ad: string | null }[], access)
  const lockedSubeId = getLockedBranchId(access)
  const defaultSubeId = lockedSubeId ?? visibleSubeler.find(sube => sube.ad === 'Erzincan Merkez')?.id ?? visibleSubeler[0]?.id ?? ''

  return (
    <OperationShell active="talepler" title="Yeni Talep">
      <div className="mx-auto max-w-5xl space-y-5 p-6">
        <div>
          <Link href="/operasyon/talepler" className="text-sm text-gray-500 hover:text-gray-700">← Talepler</Link>
          <h1 className="mt-2 text-xl font-bold text-gray-900 dark:text-gray-100">Yeni Talep</h1>
        </div>

        <TalepForm
          customers={customerRows}
          devices={(devices ?? []) as TalepFormProps['devices']}
          subeler={visibleSubeler}
          personeller={(personeller ?? []) as TalepFormProps['personeller']}
          defaultSubeId={defaultSubeId}
          lockedSubeId={lockedSubeId}
        />
      </div>
    </OperationShell>
  )
}
