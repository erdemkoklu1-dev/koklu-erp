import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { BACKUP_ALLOWED_ROLES } from './config'

export type AuthorizedBackupUser = {
  id: string
  email: string
  name: string | null
  role: string | null
}

export function isBackupRole(role: string | null | undefined) {
  return BACKUP_ALLOWED_ROLES.includes(role ?? '')
}

export async function getCurrentUserRole() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const svc = createServiceClient()
  const { data: profil } = await svc
    .from('kullanici_profiller')
    .select('ad_soyad, roller(ad)')
    .eq('id', user.id)
    .single()

  const role = (profil?.roller as { ad?: string } | null)?.ad ?? null

  return {
    id: user.id,
    email: user.email ?? '',
    name: profil?.ad_soyad ?? null,
    role,
  }
}

export async function requireBackupUser(): Promise<AuthorizedBackupUser> {
  const user = await getCurrentUserRole()
  if (!user) {
    throw new Response('Oturum gerekli', { status: 401 })
  }
  if (!isBackupRole(user.role)) {
    throw new Response('Yetkisiz', { status: 403 })
  }
  return user
}

export async function requireBackupPageAccess() {
  const user = await getCurrentUserRole()
  if (!user) redirect('/login')
  if (!isBackupRole(user.role)) redirect('/yetkisiz')
  return user
}

export async function requireAdminPageAccess() {
  const user = await getCurrentUserRole()
  if (!user) redirect('/login')
  if (user.role !== 'Admin') redirect('/yetkisiz')
  return user
}
