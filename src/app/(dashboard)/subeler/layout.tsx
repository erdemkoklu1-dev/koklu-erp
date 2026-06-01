import { requireModuleAccess } from '@/lib/auth/authorization'

export default async function SubelerLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess('branches')
  return children
}
