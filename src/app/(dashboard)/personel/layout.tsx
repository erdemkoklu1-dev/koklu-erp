import { requireModuleAccess } from '@/lib/auth/authorization'

export default async function PersonelLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess('personnel')
  return children
}
