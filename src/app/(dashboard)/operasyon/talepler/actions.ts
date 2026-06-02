'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getCurrentAccess } from '@/lib/auth/authorization'
import { resolveBranchFilter } from '@/lib/auth/branch-scope'
import { normalizeTalepStatus } from './status'

export type TalepFormState = {
  error?: string
}

function canAccessCreatedTalep(access: Awaited<ReturnType<typeof getCurrentAccess>>, subeId: string | null) {
  if (!access) return false
  if (access.isAdmin) return true
  return !!subeId && access.branchIds.includes(subeId)
}

function text(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? '').trim()
  return value || null
}

function dbTalepDurum(value: string | null) {
  const normalized = normalizeTalepStatus(value)
  if (normalized === 'new') return 'Yeni'
  if (normalized === 'in_progress') return 'İşleme Alındı'
  if (normalized === 'planned') return 'Planlandı'
  if (normalized === 'field') return 'Sahada'
  if (normalized === 'waiting') return 'Beklemede'
  if (normalized === 'completed') return 'Tamamlandı'
  if (normalized === 'cancelled') return 'İptal'
  return value || 'Yeni'
}

async function currentUserId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Oturum bulunamadı.')
  return user.id
}

async function nextTalepNo() {
  const svc = createServiceClient()
  const year = new Date().getFullYear()
  const pattern = `TP-${year}-%`
  const { data } = await svc
    .from('musteri_talepleri')
    .select('talep_no')
    .like('talep_no', pattern)
    .order('talep_no', { ascending: false })
    .limit(1)
    .maybeSingle()

  const lastNumber = data?.talep_no ? Number(String(data.talep_no).split('-').at(-1)) : 0
  const nextNumber = Number.isFinite(lastNumber) ? lastNumber + 1 : 1
  return `TP-${year}-${String(nextNumber).padStart(5, '0')}`
}

export async function createTalepAction(_prevState: TalepFormState, formData: FormData): Promise<TalepFormState> {
  const userId = await currentUserId()
  const svc = createServiceClient()
  const access = await getCurrentAccess()

  const customerId = text(formData, 'customer_id')
  const manualCustomerName = text(formData, 'manual_customer_name')
  const cihazId = text(formData, 'cihaz_id')
  const baslik = text(formData, 'baslik')
  const aciklama = text(formData, 'aciklama')
  const kategori = text(formData, 'kategori')
  const oncelik = text(formData, 'oncelik') ?? 'Normal'
  const requestedSubeId = text(formData, 'sube_id')
  const subeId = resolveBranchFilter(access, requestedSubeId)

  if ((!customerId && !manualCustomerName) || !baslik || !aciklama || !kategori) {
    return { error: 'Müşteri adı, başlık, kategori ve açıklama zorunludur.' }
  }
  if (!subeId) {
    return { error: 'Lütfen bu kaydın ait olduğu şubeyi seçin.' }
  }

  const [{ data: customer }, { data: cihaz }] = await Promise.all([
    customerId
      ? svc.from('customers').select('full_name, sube_id').eq('id', customerId).single()
      : Promise.resolve({ data: null }),
    cihazId
      ? svc.from('devices').select('custom_device_name, capacity, serial_number, device_types(name)').eq('id', cihazId).single()
      : Promise.resolve({ data: null }),
  ])

  if (customerId && !customer) {
    return { error: 'Seçilen müşteri bulunamadı.' }
  }
  if (customer?.sube_id && customer.sube_id !== subeId) {
    return { error: 'Seçilen müşteri ile şube bilgisi uyumlu değil.' }
  }

  const device = cihaz as { custom_device_name?: string | null; capacity?: number | null; serial_number?: string | null; device_types?: { name?: string | null } | { name?: string | null }[] | null } | null
  const deviceType = Array.isArray(device?.device_types) ? device.device_types[0] : device?.device_types
  const deviceName = device
    ? [device.custom_device_name ?? deviceType?.name ?? 'Cihaz', device.capacity ? `${device.capacity} Kg` : null, device.serial_number].filter(Boolean).join(' - ')
    : null

  const { data, error } = await svc
    .from('musteri_talepleri')
    .insert({
      talep_no: await nextTalepNo(),
      customer_id: customerId,
      customer_name_snapshot: customer?.full_name ?? manualCustomerName,
      cihaz_id: cihazId,
      cihaz_name_snapshot: deviceName,
      baslik,
      aciklama,
      kategori,
      oncelik,
      durum: dbTalepDurum(text(formData, 'durum')),
      hedef_tarih: text(formData, 'hedef_tarih'),
      sube_id: subeId,
      sorumlu_personel_id: text(formData, 'sorumlu_personel_id'),
      kaynak: text(formData, 'kaynak') ?? 'Telefon',
      notlar: text(formData, 'notlar'),
      created_by: userId,
      updated_by: userId,
    })
    .select('id, sube_id')
    .single()

  if (error) return { error: `Talep oluşturulamadı: ${error.message}` }
  if (!data?.id) return { error: 'Talep oluşturuldu ancak detay sayfası için kayıt ID bilgisi alınamadı.' }
  if (!canAccessCreatedTalep(access, data.sube_id)) {
    return { error: 'Talep kaydedildi ancak bu kullanıcı için detay erişimi doğrulanamadı. Lütfen talepler listesinden şube yetkisini kontrol edin.' }
  }

  revalidatePath('/operasyon')
  revalidatePath('/operasyon/talepler')
  revalidatePath(`/operasyon/talepler/${data.id}`)
  redirect(`/operasyon/talepler/${data.id}`)
}

export async function updateTalepDurumAction(formData: FormData) {
  const userId = await currentUserId()
  const id = text(formData, 'id')
  const durum = dbTalepDurum(text(formData, 'durum'))
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

export async function updateTalepAction(_prevState: TalepFormState, formData: FormData): Promise<TalepFormState> {
  const userId = await currentUserId()
  const id = text(formData, 'id')
  const baslik = text(formData, 'baslik')
  const aciklama = text(formData, 'aciklama')
  const kategori = text(formData, 'kategori')
  if (!id || !baslik || !aciklama || !kategori) {
    return { error: 'Talep, başlık, kategori ve açıklama zorunludur.' }
  }

  const svc = createServiceClient()
  const { error } = await svc
    .from('musteri_talepleri')
    .update({
      baslik,
      aciklama,
      kategori,
      oncelik: text(formData, 'oncelik') ?? 'Normal',
      durum: dbTalepDurum(text(formData, 'durum')),
      hedef_tarih: text(formData, 'hedef_tarih'),
      kaynak: text(formData, 'kaynak') ?? 'Telefon',
      notlar: text(formData, 'notlar'),
      updated_by: userId,
    })
    .eq('id', id)
    .is('deleted_at', null)

  if (error) return { error: `Talep güncellenemedi: ${error.message}` }

  revalidatePath('/operasyon')
  revalidatePath('/operasyon/talepler')
  revalidatePath(`/operasyon/talepler/${id}`)
  redirect(`/operasyon/talepler/${id}`)
}

export async function completeTalepAction(formData: FormData) {
  formData.set('durum', 'completed')
  await updateTalepDurumAction(formData)
}

export async function softDeleteTalepAction(formData: FormData) {
  const userId = await currentUserId()
  const id = text(formData, 'id')
  if (!id) throw new Error('Talep bulunamadı.')

  const svc = createServiceClient()
  const { error } = await svc
    .from('musteri_talepleri')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: userId,
      updated_by: userId,
    })
    .eq('id', id)

  if (error) throw new Error(`Talep silinemedi: ${error.message}`)

  revalidatePath('/operasyon')
  revalidatePath('/operasyon/talepler')
}
