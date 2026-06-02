import Link from 'next/link'
import type { ComponentProps } from 'react'
import { createServiceClient } from '@/lib/supabase/service'
import OperationShell from '../../_components/OperationShell'
import { getCurrentAccess } from '@/lib/auth/authorization'
import { applyBranchScope, filterVisibleBranches, getLockedBranchId } from '@/lib/auth/branch-scope'
import IsPlaniForm from './IsPlaniForm'

type IsPlaniFormProps = ComponentProps<typeof IsPlaniForm>

export default async function YeniIsPlaniPage() {
  const supabase = createServiceClient()
  const access = await getCurrentAccess()

  let customersQuery = supabase
    .from('customers')
    .select('id, full_name, sube_id')
    .eq('is_active', true)
    .order('full_name')
  customersQuery = applyBranchScope(customersQuery, access)

  let personellerQuery = supabase
    .from('personeller')
    .select('id, ad, soyad, sube_id')
    .eq('durum', 'aktif')
    .order('ad')
  personellerQuery = applyBranchScope(personellerQuery, access)

  const [{ data: customers }, { data: subeler }, { data: personeller }] = await Promise.all([
    customersQuery,
    supabase.from('subeler').select('id, ad').eq('aktif', true).order('ad'),
    personellerQuery,
  ])

  const visibleSubeler = filterVisibleBranches((subeler ?? []) as { id: string; ad: string | null }[], access)
  const lockedSubeId = getLockedBranchId(access)
  const defaultSubeId = lockedSubeId ?? visibleSubeler.find(sube => sube.ad === 'Erzincan Merkez')?.id ?? visibleSubeler[0]?.id ?? ''

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
        />
      </div>
    </OperationShell>
  )
}
