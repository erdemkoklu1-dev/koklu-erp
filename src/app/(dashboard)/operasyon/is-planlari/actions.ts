'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getCurrentAccess } from '@/lib/auth/authorization'
import { resolveBranchFilter } from '@/lib/auth/branch-scope'
import { assertBranchBelongsToFirma, assertCustomerBelongsToFirma, requireCurrentFirmaId } from '@/lib/auth/tenant-scope'

export type IsPlaniFormState = {
  error?: string
}

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? '').trim()
  return value || null
}

function appendSourceDetails(notlar: string | null, phone: string | null, address: string | null) {
  const details = [
    phone ? `Telefon: ${phone}` : null,
    address ? `Adres: ${address}` : null,
  ].filter(Boolean)
  if (details.length === 0) return notlar
  return [notlar, details.join('\n')].filter(Boolean).join('\n\n')
}

function addInterval(date: Date, tekrarTipi: string, aralik: number) {
  const next = new Date(date)
  const step = Math.max(aralik, 1)
  if (tekrarTipi === 'Günlük') next.setDate(next.getDate() + step)
  else if (tekrarTipi === 'Haftalık') next.setDate(next.getDate() + (7 * step))
  else if (tekrarTipi === '15 Günde Bir') next.setDate(next.getDate() + (15 * step))
  else if (tekrarTipi === 'Aylık') next.setMonth(next.getMonth() + step)
  else if (tekrarTipi === '3 Ayda Bir') next.setMonth(next.getMonth() + (3 * step))
  else if (tekrarTipi === '6 Ayda Bir') next.setMonth(next.getMonth() + (6 * step))
  else if (tekrarTipi === 'Yıllık') next.setFullYear(next.getFullYear() + step)
  else next.setFullYear(next.getFullYear() + 100)
  return next
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10)
}

function generateDates(start: string, end: string | null, tekrarTipi: string, aralik: number, requestedCount: number) {
  const dates: string[] = []
  const first = new Date(`${start}T00:00:00`)
  if (Number.isNaN(first.getTime())) return dates

  const maxCount = Math.min(Math.max(requestedCount || 0, 1), 120)
  const endDate = end ? new Date(`${end}T00:00:00`) : null

  let cursor = first
  while (dates.length < maxCount) {
    if (endDate && cursor > endDate) break
    dates.push(dateOnly(cursor))
    if (tekrarTipi === 'Tek seferlik' || tekrarTipi === 'Özel') break
    cursor = addInterval(cursor, tekrarTipi, aralik)
  }

  return dates
}

async function currentUserId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Oturum bulunamadı.')
  return user.id
}

async function nextPlanNo() {
  const svc = createServiceClient()
  const year = new Date().getFullYear()
  const pattern = `IP-${year}-%`
  const { data } = await svc
    .from('is_planlari')
    .select('plan_no')
    .like('plan_no', pattern)
    .order('plan_no', { ascending: false })
    .limit(1)
    .maybeSingle()

  const lastNumber = data?.plan_no ? Number(String(data.plan_no).split('-').at(-1)) : 0
  const nextNumber = Number.isFinite(lastNumber) ? lastNumber + 1 : 1
  return `IP-${year}-${String(nextNumber).padStart(5, '0')}`
}

function missingSourceRequestColumn(error: { message?: string; code?: string } | null) {
  return error?.code === 'PGRST204' && error.message?.includes('source_request_id')
}

export async function createIsPlaniAction(_prevState: IsPlaniFormState, formData: FormData): Promise<IsPlaniFormState> {
  const userId = await currentUserId()
  const svc = createServiceClient()
  const access = await getCurrentAccess()
  const firmaId = await requireCurrentFirmaId()

  const baslik = text(formData, 'baslik')
  const customerId = text(formData, 'customer_id')
  const manualCustomerName = text(formData, 'manual_customer_name')
  const planTuru = text(formData, 'plan_turu')
  const baslangic = text(formData, 'baslangic_tarihi')
  const bitis = text(formData, 'bitis_tarihi')
  const planModu = text(formData, 'plan_modu') ?? 'periodic'
  const isSingle = planModu === 'single'
  const tekrarTipi = isSingle ? 'Tek seferlik' : text(formData, 'tekrar_tipi') ?? 'Tek seferlik'
  const tekrarAraligi = isSingle ? 1 : Number(text(formData, 'tekrar_araligi') ?? '1') || 1
  const isSayisi = isSingle ? 1 : Number(text(formData, 'is_sayisi') ?? '24') || 24
  const requestedSubeId = text(formData, 'sube_id')
  const subeId = resolveBranchFilter(access, requestedSubeId)
  const sourceRequestId = text(formData, 'source_request_id')
  const oncelik = text(formData, 'oncelik') ?? 'Normal'
  const notlar = appendSourceDetails(text(formData, 'notlar'), text(formData, 'source_phone'), text(formData, 'source_address'))

  if (!baslik || !planTuru || !baslangic) {
    return { error: 'Başlık, plan türü ve başlangıç tarihi zorunludur.' }
  }
  if (!subeId) {
    return { error: 'Lütfen bu kaydın ait olduğu şubeyi seçin.' }
  }

  await assertBranchBelongsToFirma(subeId, firmaId)
  await assertCustomerBelongsToFirma(customerId, firmaId)

  const { data: sourceRequest } = sourceRequestId
    ? await svc
      .from('musteri_talepleri')
      .select('id, sube_id, firma_id')
      .eq('id', sourceRequestId)
      .maybeSingle()
    : { data: null }

  if (sourceRequestId && !sourceRequest) {
    return { error: 'Kaynak talep bulunamadı.' }
  }
  if (sourceRequest?.sube_id && sourceRequest.sube_id !== subeId) {
    return { error: 'Kaynak talep ile iş planı şubesi uyumlu değil.' }
  }

  if (sourceRequest?.firma_id && sourceRequest.firma_id !== firmaId) {
    return { error: 'Kaynak talep kullanıcının firmasına ait değil.' }
  }

  const { data: customer } = customerId
    ? await svc.from('customers').select('full_name, sube_id, firma_id').eq('id', customerId).single()
    : { data: null }

  if (customerId && !customer) {
    return { error: 'Seçilen müşteri bulunamadı.' }
  }
  if (customer?.sube_id && customer.sube_id !== subeId) {
    return { error: 'Seçilen müşteri ile şube bilgisi uyumlu değil.' }
  }

  const dates = generateDates(baslangic, bitis, tekrarTipi, tekrarAraligi, isSayisi)

  const planPayload = {
    plan_no: await nextPlanNo(),
    baslik,
    aciklama: text(formData, 'aciklama'),
    customer_id: customerId,
    customer_name_snapshot: customer?.full_name ?? manualCustomerName,
    sube_id: subeId,
    sorumlu_personel_id: text(formData, 'sorumlu_personel_id'),
    plan_turu: planTuru,
    durum: text(formData, 'durum') ?? 'Aktif',
    baslangic_tarihi: baslangic,
    bitis_tarihi: bitis,
    tekrar_tipi: tekrarTipi,
    tekrar_araligi: tekrarAraligi,
    sonraki_is_tarihi: dates[0] ?? baslangic,
    toplam_is_sayisi: dates.length,
    tamamlanan_is_sayisi: 0,
    iptal_is_sayisi: 0,
    source_request_id: sourceRequestId,
    notlar,
    created_by: userId,
    updated_by: userId,
    firma_id: firmaId,
  }

  let { data: plan, error } = await svc
    .from('is_planlari')
    .insert(planPayload)
    .select('id')
    .single()

  if (missingSourceRequestColumn(error)) {
    const { source_request_id: _sourceRequestId, ...fallbackPayload } = planPayload
    const fallbackResult = await svc
      .from('is_planlari')
      .insert(fallbackPayload)
      .select('id')
      .single()
    plan = fallbackResult.data
    error = fallbackResult.error
  }

  if (error) return { error: `İş planı oluşturulamadı: ${error.message}` }

  if (!plan) return { error: 'İş planı oluşturuldu ancak kayıt bilgisi alınamadı.' }

  if (dates.length > 0) {
    const rows = dates.map((planlananTarih, index) => ({
      is_plani_id: plan.id,
      sira_no: index + 1,
      baslik,
      aciklama: text(formData, 'aciklama'),
      customer_id: customerId,
      planlanan_tarih: planlananTarih,
      hedef_tarih: planlananTarih,
      durum: 'Bekliyor',
      oncelik,
      sube_id: subeId,
      atanan_personel_id: text(formData, 'sorumlu_personel_id'),
      ilgili_talep_id: sourceRequestId,
      notlar,
      created_by: userId,
      updated_by: userId,
      firma_id: firmaId,
    }))
    const { error: jobsError } = await svc.from('planli_isler').insert(rows)
    if (jobsError) return { error: `Planlı işler oluşturulamadı: ${jobsError.message}` }
  }

  if (sourceRequestId) {
    const { error: requestError } = await svc
      .from('musteri_talepleri')
      .update({
        durum: 'İş Planına Aktarıldı',
        ilgili_is_plani_id: plan.id,
        updated_by: userId,
      })
      .eq('id', sourceRequestId)

    if (requestError) return { error: `Kaynak talep güncellenemedi: ${requestError.message}` }
  }

  revalidatePath('/operasyon')
  revalidatePath('/operasyon/is-planlari')
  if (sourceRequestId) revalidatePath('/operasyon/talepler')
  redirect(`/operasyon/is-planlari/${plan.id}`)
}

export async function updatePlanliIsDurumAction(formData: FormData) {
  const userId = await currentUserId()
  const id = text(formData, 'id')
  const planId = text(formData, 'is_plani_id')
  const durum = text(formData, 'durum')
  if (!id || !planId || !durum) throw new Error('Planlı iş veya durum bulunamadı.')

  const svc = createServiceClient()
  const payload: Record<string, unknown> = { durum, updated_by: userId }
  if (durum === 'Tamamlandı') payload.tamamlanma_tarihi = new Date().toISOString()

  const { error } = await svc.from('planli_isler').update(payload).eq('id', id)
  if (error) throw new Error(`Planlı iş güncellenemedi: ${error.message}`)

  const { data: rows } = await svc
    .from('planli_isler')
    .select('durum, planlanan_tarih')
    .eq('is_plani_id', planId)

  const tamamlanan = (rows ?? []).filter(row => row.durum === 'Tamamlandı').length
  const iptal = (rows ?? []).filter(row => row.durum === 'İptal').length
  const sonraki = (rows ?? [])
    .filter(row => !['Tamamlandı', 'İptal'].includes(row.durum))
    .map(row => row.planlanan_tarih)
    .filter(Boolean)
    .sort()[0] ?? null

  await svc
    .from('is_planlari')
    .update({
      toplam_is_sayisi: rows?.length ?? 0,
      tamamlanan_is_sayisi: tamamlanan,
      iptal_is_sayisi: iptal,
      sonraki_is_tarihi: sonraki,
      updated_by: userId,
    })
    .eq('id', planId)

  revalidatePath('/operasyon')
  revalidatePath('/operasyon/is-planlari')
  revalidatePath(`/operasyon/is-planlari/${planId}`)
}
