'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function deleteServiceForm(formId: string) {
  const supabase = await createClient()

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
  const { error: formError } = await supabase
    .from('service_forms')
    .delete()
    .eq('id', formId)

  if (formError) {
    console.error('Form silinemedi:', formError)
    return { ok: false, error: formError.message }
  }

  revalidatePath('/service-forms')
  redirect('/service-forms')
}