import { requireModuleAccess } from '@/lib/auth/authorization'

export default async function FabrikaLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess('factory')
  return children
}
