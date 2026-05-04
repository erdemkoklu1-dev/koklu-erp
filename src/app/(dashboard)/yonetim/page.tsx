import { requireBackupPageAccess } from '@/lib/backup/authorization'
import { redirect } from 'next/navigation'

export default async function YonetimPage() {
  const user = await requireBackupPageAccess()
  redirect(user.role === 'Admin' ? '/yonetim/kullanicilar' : '/yonetim/yedekleme')
}
