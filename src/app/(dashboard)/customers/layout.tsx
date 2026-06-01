import { requireModuleAccess } from '@/lib/auth/authorization'

export default async function CustomersLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess('customers')
  return children
}
