import { requireModuleAccess } from '@/lib/auth/authorization'

export default async function TeknikRaporlarLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess('technical_reports')
  return children
}
