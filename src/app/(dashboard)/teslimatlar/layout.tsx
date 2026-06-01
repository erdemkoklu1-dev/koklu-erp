import TabletModeShell from './TabletModeShell'
import { requireModuleAccess } from '@/lib/auth/authorization'

export default async function TeslimatlarLayout({ children }: { children: React.ReactNode }) {
  await requireModuleAccess('deliveries')
  return <TabletModeShell>{children}</TabletModeShell>
}
