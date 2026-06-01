import { requireModuleAccess } from '@/lib/auth/authorization'

export default async function FiyatTeklifleriLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess('price_offers')
  return children
}
