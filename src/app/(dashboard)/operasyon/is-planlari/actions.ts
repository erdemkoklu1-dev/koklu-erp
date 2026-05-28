'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? '').trim()
  return value || null
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

export async function createIsPlaniAction(formData: FormData) {
  const userId = await currentUserId()
  const svc = createServiceClient()

  const baslik = text(formData, 'baslik')
  const customerId = text(formData, 'customer_id')
  const planTuru = text(formData, 'plan_turu')
  const baslangic = text(formData, 'baslangic_tarihi')
  const bitis = text(formData, 'bitis_tarihi')
  const tekrarTipi = text(formData, 'tekrar_tipi') ?? 'Tek seferlik'
  const tekrarAraligi = Number(text(formData, 'tekrar_araligi') ?? '1') || 1
  const isSayisi = Number(text(formData, 'is_sayisi') ?? '24') || 24
  const subeId = text(formData, 'sube_id')

  if (!baslik || !planTuru || !baslangic) {
    throw new Error('Başlık, plan türü ve başlangıç tarihi zorunludur.')
  }
  if (!subeId) {
    throw new Error('Lütfen bu kaydın ait olduğu şubeyi seçin.')
  }

  const { data: customer } = customerId
    ? await svc.from('customers').select('full_name').eq('id', customerId).single()
    : { data: null }

  const dates = generateDates(baslangic, bitis, tekrarTipi, tekrarAraligi, isSayisi)

  const { data: plan, error } = await svc
    .from('is_planlari')
    .insert({
      plan_no: '',
      baslik,
      aciklama: text(formData, 'aciklama'),
      customer_id: customerId,
      customer_name_snapshot: customer?.full_name ?? null,
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
      notlar: text(formData, 'notlar'),
      created_by: userId,
      updated_by: userId,
    })
    .select('id')
    .single()

  if (error) throw new Error(`İş planı oluşturulamadı: ${error.message}`)

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
      oncelik: 'Normal',
      sube_id: subeId,
      atanan_personel_id: text(formData, 'sorumlu_personel_id'),
      notlar: text(formData, 'notlar'),
      created_by: userId,
      updated_by: userId,
    }))
    const { error: jobsError } = await svc.from('planli_isler').insert(rows)
    if (jobsError) throw new Error(`Planlı işler oluşturulamadı: ${jobsError.message}`)
  }

  revalidatePath('/operasyon')
  revalidatePath('/operasyon/is-planlari')
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

  const tamamlanan = (rows ?? []).filter(r => r.durum === 'Tamamlandı').length
  const iptal = (rows ?? []).filter(r => r.durum === 'İptal').length
  const sonraki = (rows ?? [])
    .filter(r => !['Tamamlandı', 'İptal'].includes(r.durum))
    .map(r => r.planlanan_tarih)
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
