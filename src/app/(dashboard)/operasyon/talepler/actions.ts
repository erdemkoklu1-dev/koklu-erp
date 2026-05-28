'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? '').trim()
  return value || null
}

async function currentUserId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Oturum bulunamadı.')
  return user.id
}

export async function createTalepAction(formData: FormData) {
  const userId = await currentUserId()
  const svc = createServiceClient()

  const customerId = text(formData, 'customer_id')
  const cihazId = text(formData, 'cihaz_id')
  const baslik = text(formData, 'baslik')
  const aciklama = text(formData, 'aciklama')
  const kategori = text(formData, 'kategori')
  const oncelik = text(formData, 'oncelik') ?? 'Normal'
  const subeId = text(formData, 'sube_id')

  if (!customerId || !baslik || !aciklama || !kategori) {
    throw new Error('Müşteri, başlık, kategori ve açıklama zorunludur.')
  }
  if (!subeId) {
    throw new Error('Lütfen bu kaydın ait olduğu şubeyi seçin.')
  }

  const [{ data: customer }, { data: cihaz }] = await Promise.all([
    svc.from('customers').select('full_name').eq('id', customerId).single(),
    cihazId
      ? svc.from('devices').select('custom_device_name, capacity, serial_number, device_types(name)').eq('id', cihazId).single()
      : Promise.resolve({ data: null }),
  ])

  const device = cihaz as any
  const deviceName = device
    ? [device.custom_device_name ?? device.device_types?.name ?? 'Cihaz', device.capacity ? `${device.capacity} Kg` : null, device.serial_number].filter(Boolean).join(' - ')
    : null

  const { data, error } = await svc
    .from('musteri_talepleri')
    .insert({
      talep_no: '',
      customer_id: customerId,
      customer_name_snapshot: customer?.full_name ?? null,
      cihaz_id: cihazId,
      cihaz_name_snapshot: deviceName,
      baslik,
      aciklama,
      kategori,
      oncelik,
      durum: text(formData, 'durum') ?? 'Yeni',
      hedef_tarih: text(formData, 'hedef_tarih'),
      sube_id: subeId,
      sorumlu_personel_id: text(formData, 'sorumlu_personel_id'),
      kaynak: text(formData, 'kaynak') ?? 'Telefon',
      notlar: text(formData, 'notlar'),
      created_by: userId,
      updated_by: userId,
    })
    .select('id')
    .single()

  if (error) throw new Error(`Talep oluşturulamadı: ${error.message}`)

  revalidatePath('/operasyon')
  revalidatePath('/operasyon/talepler')
  redirect(`/operasyon/talepler/${data.id}`)
}

export async function updateTalepDurumAction(formData: FormData) {
  const userId = await currentUserId()
  const id = text(formData, 'id')
  const durum = text(formData, 'durum')
  if (!id || !durum) throw new Error('Talep veya durum bulunamadı.')

  const svc = createServiceClient()
  const payload: Record<string, unknown> = { durum, updated_by: userId }
  if (durum === 'Tamamlandı') payload.tamamlanma_tarihi = new Date().toISOString()

  const { error } = await svc.from('musteri_talepleri').update(payload).eq('id', id)
  if (error) throw new Error(`Talep durumu güncellenemedi: ${error.message}`)

  revalidatePath('/operasyon')
  revalidatePath('/operasyon/talepler')
  revalidatePath(`/operasyon/talepler/${id}`)
}
