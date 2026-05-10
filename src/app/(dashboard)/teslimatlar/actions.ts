'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createOnKayitFromTeslimatKalem, createTeslimat, deleteTeslimat, normalizeTeslimatInput, syncTeslimatSideEffects, updateTeslimat } from '@/lib/teslimatlar'

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || fallback)
  }
  return fallback
}

export async function createTeslimatAction(payload: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Oturum gerekli.' }

  try {
    const raw = JSON.parse(payload)
    const input = normalizeTeslimatInput(raw)
    const manualCustomer = raw?.manual_customer
    if (!input.customer_id && manualCustomer?.full_name?.trim()) {
      const addToCustomers = Boolean(manualCustomer.add_to_customers)
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .insert({
          full_name: String(manualCustomer.full_name).trim(),
          type: 'company',
          phone: manualCustomer.phone || null,
          address: manualCustomer.address || null,
          authorized_person: manualCustomer.authorized_person || null,
          sube_id: input.sube_id,
          is_active: addToCustomers,
          notes: addToCustomers ? null : 'Teslimat modülünde geçici müşteri olarak oluşturuldu.',
        })
        .select('id')
        .single()
      if (customerError) throw customerError
      input.customer_id = customer.id
    }
      const teslimat = await createTeslimat(input, user.id)
    return { ok: true, id: teslimat.id as string, message: 'Teslimat oluşturuldu.' }
  } catch (error) {
    return { ok: false, message: errorMessage(error, 'Teslimat oluşturulamadı.') }
  }
}

export async function goToTeslimat(id: string) {
  redirect(`/teslimatlar/${id}`)
}

export async function updateTeslimatAction(id: string, payload: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Oturum gerekli.' }

  try {
    const input = normalizeTeslimatInput(JSON.parse(payload))
    const teslimat = await updateTeslimat(id, input, user.id)
    revalidatePath('/teslimatlar/liste')
    revalidatePath(`/teslimatlar/${id}`)
    return { ok: true, id: teslimat.id as string, message: 'Teslimat güncellendi.' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Teslimat güncellenemedi.' }
  }
}

export async function deleteTeslimatAction(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Oturum gerekli.' }

  try {
    await deleteTeslimat(id)
    revalidatePath('/teslimatlar/liste')
    revalidatePath('/teslimatlar')
    return { ok: true, message: 'Teslimat silindi.' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Teslimat silinemedi.' }
  }
}

export async function updateTeslimatDurumAction(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Oturum gerekli.')

  const id = String(formData.get('id') ?? '')
  const yeniDurum = String(formData.get('durum') ?? '')
  if (!id) throw new Error('Teslimat bulunamadı.')
  if (!['taslak', 'sevkte', 'tamamlandi', 'iptal'].includes(yeniDurum)) {
    throw new Error('Durum geçersiz.')
  }

  const { data: mevcut, error: mevcutError } = await supabase
    .from('teslimatlar')
    .select('durum')
    .eq('id', id)
    .single()
  if (mevcutError) throw mevcutError

  if (mevcut.durum !== yeniDurum) {
    const { error: updateError } = await supabase
      .from('teslimatlar')
      .update({ durum: yeniDurum, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (updateError) throw updateError

      await supabase.from('teslimat_durum_gecmisi').insert({
        teslimat_id: id,
        eski_durum: mevcut.durum,
        yeni_durum: yeniDurum,
        aciklama: 'Durum değiştirildi',
        created_by: user.id,
      })

      if (yeniDurum === 'tamamlandi') {
        await syncTeslimatSideEffects(id)
      }
    }

  revalidatePath('/teslimatlar')
  revalidatePath('/teslimatlar/liste')
  revalidatePath('/teslimatlar/on-kayda-aktar')
  revalidatePath(`/teslimatlar/${id}`)
}

export async function manuelOnKaydaAktarAction(kalemId: string, payload: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Oturum gerekli.' }

  try {
    const raw = JSON.parse(payload)
    const result = await createOnKayitFromTeslimatKalem(kalemId, {
      aciklama: String(raw.aciklama ?? ''),
      miktar: Number(raw.miktar ?? 0),
      birim_fiyat: Number(raw.birim_fiyat ?? 0),
      toplam_tutar: Number(raw.toplam_tutar ?? 0),
      notlar: raw.notlar ? String(raw.notlar) : null,
    })
    revalidatePath('/teslimatlar/on-kayda-aktar')
    revalidatePath('/cari-hesap/on-kayitlar')
    return {
      ok: true,
      id: result.id,
      message: result.created ? 'Ön kayıt oluşturuldu.' : 'Bu kalem daha önce ön kayda aktarılmış.',
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Ön kayıt oluşturulamadı.' }
  }
}
