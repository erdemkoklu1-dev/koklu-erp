import { requireModuleAccess } from '@/lib/auth/authorization'

export default async function AraclarLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess('agents')
  return children
}
