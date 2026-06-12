'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUserRole } from '@/lib/backup/authorization'
import { getCompanyStampSettings, saveCompanyStampSettings } from '@/lib/company-stamp'

const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const MAX_FILE_SIZE = 2 * 1024 * 1024

async function requireAdminAction() {
  const user = await getCurrentUserRole()
  if (!user) return { ok: false, message: 'Oturum gerekli.' }
  if (user.role !== 'Admin') return { ok: false, message: 'Bu ayarı değiştirme yetkiniz yok.' }
  return { ok: true, user }
}

function resultMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  return fallback
}

export async function saveCompanyStampAction(formData: FormData) {
  const auth = await requireAdminAction()
  if (!auth.ok) return auth

  try {
    const defaultStamped = formData.get('defaultStamped') === 'on'
    const file = formData.get('stamp')
    const current = await getCompanyStampSettings()
    let stampDataUrl = current.stampDataUrl
    let stampFileName = current.stampFileName

    if (file instanceof File && file.size > 0) {
      if (!ALLOWED_TYPES.has(file.type)) {
        return { ok: false, message: 'Kaşe görseli PNG, JPG, JPEG veya WEBP olmalı.' }
      }
      if (file.size > MAX_FILE_SIZE) {
        return { ok: false, message: 'Kaşe görseli en fazla 2 MB olabilir.' }
      }

      const buffer = Buffer.from(await file.arrayBuffer())
      stampDataUrl = `data:${file.type};base64,${buffer.toString('base64')}`
      stampFileName = file.name
    }

    await saveCompanyStampSettings({ stampDataUrl, stampFileName, defaultStamped })
    revalidatePath('/yonetim/firma-ayarlari')
    revalidatePath('/service-forms/[id]/pdf-bakim', 'page')
    revalidatePath('/service-forms/[id]/pdf-takip', 'page')
    return { ok: true, message: 'Kaşe ve imza ayarları kaydedildi.' }
  } catch (error) {
    return { ok: false, message: resultMessage(error, 'Kaşe ve imza ayarları kaydedilemedi.') }
  }
}

export async function deleteCompanyStampAction() {
  const auth = await requireAdminAction()
  if (!auth.ok) return auth

  try {
    const current = await getCompanyStampSettings()
    await saveCompanyStampSettings({
      stampDataUrl: null,
      stampFileName: null,
      defaultStamped: current.defaultStamped,
    })
    revalidatePath('/yonetim/firma-ayarlari')
    revalidatePath('/service-forms/[id]/pdf-bakim', 'page')
    revalidatePath('/service-forms/[id]/pdf-takip', 'page')
    return { ok: true, message: 'Kaşe görseli silindi.' }
  } catch (error) {
    return { ok: false, message: resultMessage(error, 'Kaşe görseli silinemedi.') }
  }
}
