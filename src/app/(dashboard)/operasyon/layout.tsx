import { requireModuleAccess } from '@/lib/auth/authorization'

export default async function OperasyonLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess('operations')
  return children
}
