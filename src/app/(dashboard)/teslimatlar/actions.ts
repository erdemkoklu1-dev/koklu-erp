'use server'

import { createElement } from 'react'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { renderToBuffer } from '@react-pdf/renderer'
import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'
import { createOnKayitFromTeslimatKalem, createTeslimat, deleteTeslimat, normalizeTeslimatInput, syncTeslimatSideEffects, updateTeslimat, TeslimatUpdateError } from '@/lib/teslimatlar'
import { getSetting } from '@/lib/settings'
import { getTeslimFormData, teslimFormFileName } from '@/lib/teslim-form-data'
import { TeslimFormPdfDocument } from '@/lib/teslim-form-pdf'
import { getCurrentAccess } from '@/lib/auth/authorization'
import { applyTenantScope, assertBranchBelongsToFirma, assertCustomerBelongsToFirma, getCurrentTenantAccessFromSession, requireCurrentFirmaId } from '@/lib/auth/tenant-scope'

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || fallback)
  }
  return fallback
}

function tenantScope<T>(query: T, tenantAccess: Awaited<ReturnType<typeof getCurrentTenantAccessFromSession>>) {
  return applyTenantScope(query as any, tenantAccess) as any
}

function revalidateTeslimatDeletePaths(id?: string) {
  revalidatePath('/teslimatlar/liste')
  revalidatePath('/teslimatlar')
  revalidatePath('/teslimatlar/bekleyenler')
  revalidatePath('/teslimatlar/gecikenler')
  revalidatePath('/teslimatlar/emanetler')
  revalidatePath('/teslimatlar/geri-teslim')
  revalidatePath('/teslimatlar/on-kayda-aktar')
  revalidatePath('/operasyon')
  revalidatePath('/operasyon/teslimatlar')
  revalidatePath('/dashboard')
  if (id) revalidatePath(`/teslimatlar/${id}`)
}

export async function createTeslimatAction(payload: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Oturum gerekli.' }

  try {
    const firmaId = await requireCurrentFirmaId()
    const raw = JSON.parse(payload)
    const input = normalizeTeslimatInput(raw)
    input.firma_id = firmaId
    await assertBranchBelongsToFirma(input.sube_id, firmaId)
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
          firma_id: firmaId,
          notes: addToCustomers ? null : 'Teslimat modülünde geçici müşteri olarak oluşturuldu.',
        })
        .select('id')
        .single()
      if (customerError) throw customerError
      input.customer_id = customer.id
    }
    await assertCustomerBelongsToFirma(input.customer_id, firmaId)
      const teslimat = await createTeslimat(input, user.id)
    return { ok: true, id: teslimat.id as string, message: 'Teslimat oluşturuldu.' }
  } catch (error) {
    return { ok: false, message: errorMessage(error, 'Teslimat oluşturulamadı.') }
  }
}

export async function goToTeslimat(id: string) {
  redirect(`/teslimatlar/${id}`)
}

export async function updateTeslimatAction(
  id: string,
  payload: string,
  options: { expectedUpdatedAt?: string | null; idempotencyKey?: string | null } = {},
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Oturum gerekli.' }

  try {
    const input = normalizeTeslimatInput(JSON.parse(payload))
    const tenantAccess = await getCurrentTenantAccessFromSession()
    const { data: mevcut, error: mevcutError } = await tenantScope(supabase
      .from('teslimatlar')
      .select('id, firma_id')
      .eq('id', id), tenantAccess)
      .maybeSingle()
    if (mevcutError) throw mevcutError
    if (!mevcut) throw new Error('Teslimat bulunamadı veya bu kayda erişim yetkiniz yok.')
    const firmaId = tenantAccess?.isSuperAdmin ? mevcut.firma_id : tenantAccess?.companyId
    if (firmaId) {
      input.firma_id = firmaId
      await assertBranchBelongsToFirma(input.sube_id, firmaId)
      await assertCustomerBelongsToFirma(input.customer_id, firmaId)
    }

    // Tek atomik RPC. Kalıcı yan etki bu çağrıdan ÖNCE başlatılmaz.
    const teslimat = await updateTeslimat(id, input, user.id, {
      expectedUpdatedAt: options.expectedUpdatedAt ?? null,
      idempotencyKey: options.idempotencyKey ?? null,
    })

    revalidatePath('/teslimatlar/liste')
    revalidatePath('/teslimatlar')
    revalidatePath('/teslimatlar/emanetler')
    revalidatePath('/teslimatlar/geri-teslim')
    revalidatePath(`/teslimatlar/${id}`)
    return {
      ok: true,
      id: teslimat.id,
      message: teslimat.replayed
        ? 'Bu kayıt zaten güncellenmişti.'
        : teslimat.onKayitStatus === 'failed'
          ? 'Teslimat güncellendi, ancak ön kayıt oluşturulamadı.'
          : 'Teslimat güncellendi.',
    }
  } catch (error) {
    if (error instanceof TeslimatUpdateError) {
      // Stabil kodlu hata; ham veritabanı mesajı kullanıcıya gösterilmez.
      return { ok: false, code: error.code, message: error.message }
    }
    return { ok: false, message: error instanceof Error ? error.message : 'Teslimat güncellenemedi.' }
  }
}

export async function deleteTeslimatAction(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Oturum gerekli.' }

  try {
    const access = await getCurrentAccess()
    if (!access) return { ok: false, message: 'Yetki bilgisi alınamadı.' }
    const tenantAccess = await getCurrentTenantAccessFromSession()
    const { data: teslimat, error: teslimatError } = await tenantScope(supabase
      .from('teslimatlar')
      .select('id, sube_id')
      .eq('id', id), tenantAccess)
      .maybeSingle()

    if (teslimatError || !teslimat) return { ok: false, message: 'Teslimat kaydı bulunamadı.' }
    if (!access.isAdmin && (!teslimat.sube_id || !access.branchIds.includes(teslimat.sube_id))) {
      return { ok: false, message: 'Bu teslimatı silme yetkiniz yok.' }
    }

    await deleteTeslimat(id, { userId: user.id })
    revalidateTeslimatDeletePaths(id)
    return { ok: true, message: 'Teslimat silindi.' }
  } catch (error) {
    console.error('[deleteTeslimatAction]', error)
    return { ok: false, message: errorMessage(error, 'Teslimat silinirken beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.') }
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

  const tenantAccess = await getCurrentTenantAccessFromSession()
  const { data: mevcut, error: mevcutError } = await tenantScope(supabase
    .from('teslimatlar')
    .select('durum')
    .eq('id', id), tenantAccess)
    .maybeSingle()
  if (mevcutError) throw mevcutError
  if (!mevcut) throw new Error('Teslimat bulunamadı veya bu kayda erişim yetkiniz yok.')

  if (mevcut.durum !== yeniDurum) {
    const { error: updateError } = await tenantScope(supabase
      .from('teslimatlar')
      .update({ durum: yeniDurum, updated_at: new Date().toISOString() })
      .eq('id', id), tenantAccess)
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

export async function geriTeslimYapAction(takipId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Oturum gerekli.' }

  const { data: takip, error: fetchError } = await supabase
    .from('geri_teslim_takipleri')
    .select('id, miktar')
    .eq('id', takipId)
    .single()
  if (fetchError || !takip) return { ok: false, message: 'Kayıt bulunamadı.' }

  const { error } = await supabase
    .from('geri_teslim_takipleri')
    .update({
      teslim_edilen_miktar: takip.miktar,
      durum: 'teslim_edildi',
      kapandi_at: new Date().toISOString(),
    })
    .eq('id', takipId)

  if (error) return { ok: false, message: error.message }

  revalidatePath('/teslimatlar/bekleyenler')
  revalidatePath('/teslimatlar/gecikenler')
  revalidatePath('/teslimatlar')
  return { ok: true, message: 'Teslim edildi olarak işaretlendi.' }
}

export async function emanetGeriAlAction(takipId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Oturum gerekli.' }

  const { data: takip, error: fetchError } = await supabase
    .from('emanet_takipleri')
    .select('id, miktar')
    .eq('id', takipId)
    .single()
  if (fetchError || !takip) return { ok: false, message: 'Kayıt bulunamadı.' }

  const { error } = await supabase
    .from('emanet_takipleri')
    .update({
      geri_alinan_miktar: takip.miktar,
      durum: 'kapandi',
      kapandi_at: new Date().toISOString(),
    })
    .eq('id', takipId)

  if (error) return { ok: false, message: error.message }

  revalidatePath('/teslimatlar/emanetler')
  revalidatePath('/teslimatlar/gecikenler')
  revalidatePath('/teslimatlar')
  return { ok: true, message: 'Emanet geri alındı olarak işaretlendi.' }
}

export async function saveTeslimImzaAction(teslimatId: string, payload: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Oturum gerekli.' }

  try {
    const raw = JSON.parse(payload) as Record<string, unknown>
    const imzaData = String(raw.imza_data ?? '')
    if (!imzaData.startsWith('data:image/png;base64,')) {
      return { ok: false, message: 'İmza verisi geçersiz.' }
    }

    const { error } = await supabase
      .from('teslimatlar')
      .update({
        musteri_imza_data: imzaData,
        imza_atan_ad_soyad: raw.imza_atan_ad_soyad ? String(raw.imza_atan_ad_soyad).trim() : null,
        imza_atan_unvan: raw.imza_atan_unvan ? String(raw.imza_atan_unvan).trim() : null,
        imza_tarihi: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', teslimatId)

    if (error) return { ok: false, message: error.message }
    revalidatePath(`/teslimatlar/${teslimatId}`)
    return { ok: true, message: 'Müşteri imzası kaydedildi.' }
  } catch (error) {
    return { ok: false, message: errorMessage(error, 'İmza kaydedilemedi.') }
  }
}

export async function teslimFormMailGonderAction(teslimatId: string, payload: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Oturum gerekli.' }

  const apiKey = await getSetting('resend_api_key', 'RESEND_API_KEY')
  if (!apiKey) return { ok: false, message: 'Resend API Key tanımlanmamış.' }

  try {
    const raw = JSON.parse(payload) as Record<string, unknown>
    const to = String(raw.to ?? '').trim()
    const subject = String(raw.subject ?? '').trim()
    const text = String(raw.text ?? '').trim()
    if (!to || !subject || !text) {
      return { ok: false, message: 'Alıcı, konu ve mail metni zorunlu.' }
    }

    const data = await getTeslimFormData(teslimatId)
    const pdfBuffer = await renderToBuffer(createElement(TeslimFormPdfDocument, { data }) as any)
    const resend = new Resend(apiKey)
    const result = await resend.emails.send({
      from: 'Köklü Yangın Söndürme <bilgi@koklu.com.tr>',
      to: [to],
      subject,
      text,
      attachments: [{
        filename: teslimFormFileName(data.teslimat.teslimat_no),
        content: pdfBuffer.toString('base64'),
      }],
    })

    if (result.error) return { ok: false, message: result.error.message }

    const { error } = await supabase
      .from('teslimatlar')
      .update({
        teslim_form_mail_gonderildi: true,
        teslim_form_mail_tarihi: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', teslimatId)
    if (error) return { ok: false, message: error.message }

    revalidatePath(`/teslimatlar/${teslimatId}`)
    return { ok: true, message: 'Teslim formu müşteriye mail olarak gönderildi.' }
  } catch (error) {
    return { ok: false, message: errorMessage(error, 'Mail gönderilemedi.') }
  }
}

export async function topluOnKaydaAktarAction(kalemIds: string[]) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'Oturum gerekli.' }

  const results: Array<{ ok: boolean; kalemId: string }> = []
  for (const kalemId of kalemIds) {
    try {
      const kalem = await supabase
        .from('teslimat_kalemleri')
        .select('id, aciklama, miktar, birim, birim_fiyat, toplam_tutar, teslimatlar(id, teslimat_no, teslimat_tarihi, durum, customer_id)')
        .eq('id', kalemId)
        .single()
      if (kalem.error || !kalem.data) { results.push({ ok: false, kalemId }); continue }
      const raw = kalem.data
      await createOnKayitFromTeslimatKalem(kalemId, {
        aciklama: String(raw.aciklama ?? ''),
        miktar: Number(raw.miktar ?? 1),
        birim_fiyat: Number(raw.birim_fiyat ?? 0),
        toplam_tutar: Number(raw.toplam_tutar ?? 0),
        notlar: null,
      })
      results.push({ ok: true, kalemId })
    } catch {
      results.push({ ok: false, kalemId })
    }
  }

  revalidatePath('/teslimatlar/on-kayda-aktar')
  revalidatePath('/cari-hesap/on-kayitlar')
  const basarili = results.filter(r => r.ok).length
  return { ok: basarili > 0, message: `${basarili}/${kalemIds.length} kalem ön kayda aktarıldı.` }
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
