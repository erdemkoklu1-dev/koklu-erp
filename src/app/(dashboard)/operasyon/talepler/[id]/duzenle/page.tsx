import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import { getCurrentAccess, type CurrentAccess } from '@/lib/auth/authorization'
import OperationShell from '../../../_components/OperationShell'
import TalepDuzenleForm from './TalepDuzenleForm'

function canAccessTalep(access: CurrentAccess | null, subeId: string | null) {
  if (!access) return false
  if (access.isAdmin) return true
  return !!subeId && access.branchIds.includes(subeId)
}

export default async function TalepDuzenlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()
  const access = await getCurrentAccess()
  const { data: talep, error } = await supabase
    .from('musteri_talepleri')
    .select('id, baslik, aciklama, kategori, oncelik, durum, hedef_tarih, kaynak, notlar, sube_id')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Talep düzenleme bilgisi alınamadı: ${error.message}`)
  if (!talep || !canAccessTalep(access, talep.sube_id)) notFound()

  return (
    <OperationShell active="talepler" title="Talep Düzenle">
      <div className="mx-auto max-w-5xl space-y-5 p-6">
        <div>
          <Link href={`/operasyon/talepler/${talep.id}`} className="text-sm text-gray-500 hover:text-gray-700">← Talep Detayı</Link>
          <h1 className="mt-2 text-xl font-bold text-gray-900 dark:text-gray-100">Talep Düzenle</h1>
        </div>
        <TalepDuzenleForm talep={talep} />
      </div>
    </OperationShell>
  )
}
