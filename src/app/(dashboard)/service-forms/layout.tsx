import { requireModuleAccess } from '@/lib/auth/authorization'

export default async function ServiceFormsLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess('service_forms')
  return children
}
