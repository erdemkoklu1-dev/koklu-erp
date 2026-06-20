'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { applyTenantScope, getCurrentTenantAccessFromSession } from '@/lib/auth/tenant-scope'

export async function deleteServiceForm(formId: string) {
  const supabase = await createClient()
  const tenantAccess = await getCurrentTenantAccessFromSession()
  let formReadQuery = supabase.from('service_forms').select('id').eq('id', formId)
  formReadQuery = applyTenantScope(formReadQuery, tenantAccess)
  const { data: form } = await formReadQuery.maybeSingle()
  if (!form) return { ok: false, error: 'Servis formu bulunamadı veya bu kayda erişim yetkiniz yok.' }

  // 1. Önce bağlı tüm alt kayıtları sil
  const { error: itemsError } = await supabase
    .from('service_form_items')
    .delete()
    .eq('service_form_id', formId)

  if (itemsError) {
    console.error('Items silinemedi:', itemsError)
    return { ok: false, error: itemsError.message }
  }

  // 2. Eğer fotoğraf/dosya tablosu varsa onu da sil
  // const { error: photosError } = await supabase
  //   .from('service_form_photos')
  //   .delete()
  //   .eq('service_form_id', formId)

  // 3. Ana formu sil
  let formDeleteQuery = supabase
    .from('service_forms')
    .delete()
    .eq('id', formId)
  formDeleteQuery = applyTenantScope(formDeleteQuery, tenantAccess)
  const { error: formError } = await formDeleteQuery

  if (formError) {
    console.error('Form silinemedi:', formError)
    return { ok: false, error: formError.message }
  }

  revalidatePath('/service-forms')
  redirect('/service-forms')
}
