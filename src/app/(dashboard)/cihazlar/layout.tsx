import { requireModuleAccess } from '@/lib/auth/authorization'

export default async function DevicesLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess('devices')
  return children
}
