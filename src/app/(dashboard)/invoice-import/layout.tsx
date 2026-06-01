import { requireModuleAccess } from '@/lib/auth/authorization'

export default async function InvoiceImportLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess('customer_import')
  return children
}
