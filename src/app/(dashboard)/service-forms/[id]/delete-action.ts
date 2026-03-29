'use server'

import { createClient } from '@/lib/supabase/server'

export type DeleteServiceFormResult =
  | { ok: true }
  | { ok: false; error: string }

export async function deleteServiceForm(formId: string): Promise<DeleteServiceFormResult> {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { ok: false, error: 'Oturum bulunamadı. Lütfen tekrar giriş yapın.' }
  }

  const { error: itemsError } = await supabase
    .from('service_form_items')
    .delete()
    .eq('service_form_id', formId)

  if (itemsError) {
    return { ok: false, error: itemsError.message }
  }

  const { error: formError } = await supabase.from('service_forms').delete().eq('id', formId)

  if (formError) {
    return { ok: false, error: formError.message }
  }

  return { ok: true }
}
