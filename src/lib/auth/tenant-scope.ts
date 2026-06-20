import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'

export const EMPTY_TENANT_ID = '00000000-0000-0000-0000-000000000000'

export type TenantAccess = {
  companyId: string | null
  isSuperAdmin: boolean
}

function isMissingTenantColumn(error: { code?: string; message?: string } | null | undefined) {
  return error?.code === '42703' || error?.message?.includes('firma_id') === true
}

export function resolveTenantFilter(access: TenantAccess | null, requested?: string | null) {
  if (!access) return EMPTY_TENANT_ID
  if (access.isSuperAdmin) return requested || null
  return access.companyId ?? EMPTY_TENANT_ID
}

export function applyTenantScope<T>(
  query: T,
  access: TenantAccess | null,
  requested?: string | null,
  column = 'firma_id',
) {
  const tenantId = resolveTenantFilter(access, requested)
  return tenantId ? (query as any).eq(column, tenantId) as T : query
}

export async function getCurrentTenantAccess(userId: string): Promise<TenantAccess> {
  const svc = createServiceClient()
  const { data, error } = await svc
    .from('kullanici_profiller')
    .select('firma_id, roller(ad)')
    .eq('id', userId)
    .maybeSingle()

  if (isMissingTenantColumn(error)) {
    return { companyId: null, isSuperAdmin: false }
  }

  if (error) throw error

  const role = (data?.roller as { ad?: string } | null)?.ad ?? null
  return {
    companyId: (data?.firma_id as string | null | undefined) ?? null,
    isSuperAdmin: role === 'Super Admin',
  }
}

export async function getCurrentTenantAccessFromSession(): Promise<TenantAccess | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null
  return getCurrentTenantAccess(user.id)
}

export function filterVisibleTenantRows<T extends { firma_id?: string | null }>(
  rows: T[],
  access: TenantAccess | null,
) {
  if (!access || access.isSuperAdmin) return rows
  return rows.filter(row => row.firma_id === access.companyId)
}

export async function requireCurrentFirmaId() {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    throw new Error('Oturum bulunamadı. Firma bilgisi alınamadı.')
  }

  const svc = createServiceClient()
  const { data: profile, error: profileError } = await svc
    .from('kullanici_profiller')
    .select('firma_id')
    .eq('id', user.id)
    .maybeSingle()

  if (isMissingTenantColumn(profileError)) {
    throw new Error('Kullanıcıya bağlı firma bulunamadı.')
  }

  if (profileError) {
    throw new Error(`[tenant_profile_read_failed] ${profileError.message}`)
  }

  if (!profile?.firma_id) {
    throw new Error('Kullanıcıya bağlı firma bulunamadı.')
  }

  return profile.firma_id as string
}

export function withFirmaId<T extends Record<string, unknown>>(payload: T, firmaId: string) {
  const { firma_id: _ignoredFirmaId, ...safePayload } = payload
  return { ...safePayload, firma_id: firmaId }
}

export async function assertBranchBelongsToFirma(subeId: string | null | undefined, firmaId: string) {
  if (!subeId) return
  const svc = createServiceClient()
  const { data, error } = await svc
    .from('subeler')
    .select('id, firma_id')
    .eq('id', subeId)
    .maybeSingle()

  if (error) throw new Error(`[tenant_branch_read_failed] ${error.message}`)
  if (!data) throw new Error('Seçilen şube bulunamadı.')
  if (data.firma_id !== firmaId) {
    throw new Error('Seçilen şube kullanıcının firmasına ait değil.')
  }
}

export async function assertCustomerBelongsToFirma(customerId: string | null | undefined, firmaId: string) {
  if (!customerId) return
  const svc = createServiceClient()
  const { data, error } = await svc
    .from('customers')
    .select('id, firma_id')
    .eq('id', customerId)
    .maybeSingle()

  if (error) throw new Error(`[tenant_customer_read_failed] ${error.message}`)
  if (!data) throw new Error('Seçilen müşteri bulunamadı.')
  if (data.firma_id !== firmaId) {
    throw new Error('Seçilen müşteri kullanıcının firmasına ait değil.')
  }
}

export async function assertDevicesBelongToFirma(deviceIds: Array<string | null | undefined>, firmaId: string) {
  const ids = Array.from(new Set(deviceIds.filter(Boolean))) as string[]
  if (ids.length === 0) return

  const svc = createServiceClient()
  const { data, error } = await svc
    .from('devices')
    .select('id, firma_id')
    .in('id', ids)

  if (error) throw new Error(`[tenant_device_read_failed] ${error.message}`)
  if ((data ?? []).length !== ids.length) throw new Error('Seçilen cihaz bulunamadı.')
  if ((data ?? []).some(row => row.firma_id !== firmaId)) {
    throw new Error('Seçilen cihaz kullanıcının firmasına ait değil.')
  }
}
