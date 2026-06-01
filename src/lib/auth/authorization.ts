import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import { APP_MODULES, moduleKeysWithAliases, type AppModuleKey } from './modules'
import { redirect } from 'next/navigation'

export type PermissionLevel = 'okuma' | 'yazma' | 'silme'

export type CurrentAccess = {
  userId: string
  email: string
  role: string | null
  roleId: string | null
  isAdmin: boolean
  branchIds: string[]
  singleBranchId: string | null
}

export function isAdminRole(role: string | null | undefined) {
  return role === 'Admin' || role === 'Super Admin' || role === 'Genel Admin'
}

export async function getCurrentAccess(): Promise<CurrentAccess | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const svc = createServiceClient()
  const { data: profil } = await svc
    .from('kullanici_profiller')
    .select('rol_id, sube_id, roller(ad)')
    .eq('id', user.id)
    .single()

  const role = (profil?.roller as { ad?: string } | null)?.ad ?? null
  const isAdmin = isAdminRole(role)

  const { data: branchRows } = await svc
    .from('kullanici_sube_yetkileri')
    .select('sube_id')
    .eq('kullanici_id', user.id)

  const branchIds = Array.from(new Set([
    ...((branchRows ?? []).map(row => row.sube_id).filter(Boolean) as string[]),
    ...(profil?.sube_id ? [profil.sube_id as string] : []),
  ]))

  return {
    userId: user.id,
    email: user.email ?? '',
    role,
    roleId: profil?.rol_id ?? null,
    isAdmin,
    branchIds,
    singleBranchId: !isAdmin && branchIds.length === 1 ? branchIds[0] : null,
  }
}

export async function hasModulePermission(module: AppModuleKey | string, level: PermissionLevel = 'okuma') {
  const access = await getCurrentAccess()
  if (!access) return false
  if (access.isAdmin) return true

  const svc = createServiceClient()
  const keys = moduleKeysWithAliases(module)
  const { data } = await svc
    .from('modul_izinleri')
    .select(level)
    .in('modul_adi', keys)
    .eq('rol_id', access.roleId ?? '')
    .eq(level, true)
    .limit(1)

  return (data?.length ?? 0) > 0
}

export async function getModulePermissionMap(access: CurrentAccess | null, level: PermissionLevel = 'okuma') {
  const keys = new Set(APP_MODULES.flatMap(module => moduleKeysWithAliases(module.key)))
  if (!access) return new Map<string, boolean>()
  if (access.isAdmin) return new Map(Array.from(keys).map(key => [key, true]))
  if (!access.roleId) return new Map<string, boolean>()

  const svc = createServiceClient()
  const { data } = await svc
    .from('modul_izinleri')
    .select(`modul_adi, ${level}`)
    .eq('rol_id', access.roleId)
    .eq(level, true)

  const map = new Map<string, boolean>()
  for (const row of data ?? []) {
    if (keys.has(row.modul_adi)) map.set(row.modul_adi, true)
  }
  return map
}

export function canReadModule(permissionMap: Map<string, boolean>, module: AppModuleKey | string) {
  return moduleKeysWithAliases(module).some(key => permissionMap.get(key) === true)
}

async function getProfileRoleId(userId: string) {
  const svc = createServiceClient()
  const { data } = await svc
    .from('kullanici_profiller')
    .select('rol_id')
    .eq('id', userId)
    .single()
  return data?.rol_id as string | null | undefined
}

export async function requireModuleAccess(module: AppModuleKey | string, level: PermissionLevel = 'okuma') {
  const access = await getCurrentAccess()
  if (!access) redirect('/login')
  if (access.isAdmin) return access
  if (!(await hasModulePermission(module, level))) redirect('/yetkisiz')
  return access
}

export function applyBranchScope<T extends { in: (column: string, values: string[]) => T; not: (column: string, operator: string, value: string) => T }>(
  query: T,
  access: CurrentAccess,
  column = 'sube_id',
) {
  if (access.isAdmin) return query
  if (access.branchIds.length === 0) return query.in(column, ['00000000-0000-0000-0000-000000000000'])
  return query.in(column, access.branchIds)
}

export function allowedBranchFilter(access: CurrentAccess, requested?: string | null) {
  if (access.isAdmin) return requested || null
  if (access.branchIds.length === 0) return '__none__'
  if (requested && access.branchIds.includes(requested)) return requested
  if (access.branchIds.length === 1) return access.branchIds[0]
  return null
}
