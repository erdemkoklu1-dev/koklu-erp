'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { applyTenantScope, getCurrentTenantAccessFromSession } from '@/lib/auth/tenant-scope'

type ActionResult<T = undefined> = T extends undefined
  ? { ok: true; message?: string } | { ok: false; message: string }
  : { ok: true } & T | { ok: false; message: string }

function tenantScope<T>(query: T, tenantAccess: Awaited<ReturnType<typeof getCurrentTenantAccessFromSession>>) {
  return applyTenantScope(query as any, tenantAccess) as any
}

export async function deleteTeklifAction(id: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Oturum gerekli.' }

  const tenantAccess = await getCurrentTenantAccessFromSession()
  const { data: teklif, error: readError } = await tenantScope(supabase
    .from('teklifler')
    .select('id')
    .eq('id', id), tenantAccess)
    .maybeSingle()

  if (readError) return { ok: false, message: readError.message }
  if (!teklif) return { ok: false, message: 'Teklif bulunamadı veya bu kayda erişim yetkiniz yok.' }

  const { error: kalemError } = await tenantScope(supabase
    .from('teklif_kalemleri')
    .delete()
    .eq('teklif_id', id), tenantAccess)
  if (kalemError) return { ok: false, message: 'Teklif kalemleri silinemedi.' }

  const { error: teklifError } = await tenantScope(supabase
    .from('teklifler')
    .delete()
    .eq('id', id), tenantAccess)
  if (teklifError) {
    return {
      ok: false,
      message: teklifError.code === '23503'
        ? 'Bu teklif bağlı kayıtlar nedeniyle silinemiyor.'
        : 'Teklif silinemedi.',
    }
  }

  revalidatePath('/fiyat-teklifleri')
  revalidatePath(`/fiyat-teklifleri/${id}`)
  return { ok: true, message: 'Teklif silindi.' }
}

export async function updateTeklifDurumAction(id: string, durum: string): Promise<ActionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Oturum gerekli.' }

  if (!['taslak', 'gonderildi', 'bekliyor', 'kazanildi', 'kaybedildi', 'iptal'].includes(durum)) {
    return { ok: false, message: 'Durum geçersiz.' }
  }

  const tenantAccess = await getCurrentTenantAccessFromSession()
  const { data: teklif, error: readError } = await tenantScope(supabase
    .from('teklifler')
    .select('id')
    .eq('id', id), tenantAccess)
    .maybeSingle()

  if (readError) return { ok: false, message: readError.message }
  if (!teklif) return { ok: false, message: 'Teklif bulunamadı veya bu kayda erişim yetkiniz yok.' }

  const { error } = await tenantScope(supabase
    .from('teklifler')
    .update({ durum })
    .eq('id', id), tenantAccess)

  if (error) return { ok: false, message: error.message }
  revalidatePath('/fiyat-teklifleri')
  revalidatePath(`/fiyat-teklifleri/${id}`)
  return { ok: true }
}

export async function getTeklifDurumAction(id: string): Promise<ActionResult<{ teklif: { durum: string; teklif_no: string } }>> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Oturum gerekli.' }

  const tenantAccess = await getCurrentTenantAccessFromSession()
  const { data, error } = await tenantScope(supabase
    .from('teklifler')
    .select('durum, teklif_no')
    .eq('id', id), tenantAccess)
    .maybeSingle()

  if (error) return { ok: false, message: error.message }
  if (!data) return { ok: false, message: 'Teklif bulunamadı veya bu kayda erişim yetkiniz yok.' }
  return { ok: true, teklif: data }
}
