'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'

const DELETE_ALLOWED_ROLES = new Set(['Admin', 'Yonetici', 'Yönetici'])

async function canDeleteHistoryRecord() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const svc = createServiceClient()
  const { data } = await svc
    .from('kullanici_profiller')
    .select('roller(ad)')
    .eq('id', user.id)
    .single()

  const role = (data?.roller as { ad?: string } | null)?.ad ?? null
  return DELETE_ALLOWED_ROLES.has(role ?? '')
}

export async function deleteHatirlatmaKaydi(id: string) {
  if (!id) return { ok: false, message: 'Kayit secilemedi.' }
  if (!await canDeleteHistoryRecord()) {
    return { ok: false, message: 'Bu kaydi silme yetkiniz yok.' }
  }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('hatirlatma_kayitlari')
    .delete()
    .eq('id', id)

  if (error) return { ok: false, message: error.message }

  revalidatePath('/hatirlatmalar/gecmis')
  return { ok: true, message: 'Kayit silindi.' }
}
