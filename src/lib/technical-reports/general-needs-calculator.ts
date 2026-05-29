import { materialItem, mergeSameMaterials } from './material-list'
import type { MaterialListItem, TechnicalSetting } from './types'

export type ExistingDeviceInput = {
  cihaz_tipi?: string
  kapasite?: string
  adet?: number
  durum?: 'Geçerli' | 'Bakım Gerekli' | 'Tarihi Geçmiş' | 'Kullanılamaz'
  son_kontrol_tarihi?: string
  aciklama?: string
}

export type GeneralNeedsInput = {
  bina_tipi?: string
  toplam_alan?: number
  kat_sayisi?: number
  oda_sayisi?: number
  calisan_sayisi?: number
  ziyaretci_yogunlugu?: string
  depo_var?: boolean
  mutfak_var?: boolean
  elektrik_pano_odasi_var?: boolean
  server_odasi_var?: boolean
  otopark_var?: boolean
  uretim_alani_var?: boolean
  mevcut_sistemler?: Record<string, boolean>
  mevcut_cihazlar?: ExistingDeviceInput[]
}

function settingNumber(settings: TechnicalSetting[], name: string, fallback: number) {
  const found = settings.find(s => s.ayar_grubu === 'genel_ihtiyac' && s.ayar_adi === name)
  const parsed = Number(found?.ayar_degeri)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function isValidExistingDevice(device: ExistingDeviceInput) {
  if (device.durum !== 'Geçerli') return false
  if (!device.son_kontrol_tarihi) return false
  const checkedAt = new Date(device.son_kontrol_tarihi)
  if (Number.isNaN(checkedAt.getTime())) return false
  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  return checkedAt >= oneYearAgo
}

function normalizeProduct(value?: string) {
  return (value ?? '').toLocaleLowerCase('tr-TR')
    .replaceAll('ı', 'i')
    .replaceAll('İ', 'i')
    .replaceAll('ğ', 'g')
    .replaceAll('ü', 'u')
    .replaceAll('ş', 's')
    .replaceAll('ö', 'o')
    .replaceAll('ç', 'c')
}

function matchesProduct(device: ExistingDeviceInput, productName: string) {
  const haystack = normalizeProduct(`${device.cihaz_tipi ?? ''} ${device.kapasite ?? ''}`)
  const product = normalizeProduct(productName)
  if (product.includes('kkt')) return haystack.includes('kkt') && (product.includes('6 kg') ? haystack.includes('6') : product.includes('12 kg') ? haystack.includes('12') : true)
  if (product.includes('co2')) return haystack.includes('co2') && (product.includes('5 kg') ? haystack.includes('5') : true)
  if (product.includes('kopuk')) return (haystack.includes('kopuk') || haystack.includes('foam')) && (product.includes('12 kg') ? haystack.includes('12') : true)
  if (product.includes('battaniye')) return haystack.includes('battaniye')
  if (product.includes('davlumbaz')) return haystack.includes('davlumbaz')
  if (product.includes('gazli')) return haystack.includes('gazli') || haystack.includes('fm') || haystack.includes('novec')
  if (product.includes('pano')) return haystack.includes('pano') || haystack.includes('aerosol')
  return haystack.includes(product)
}

function validExistingCount(devices: ExistingDeviceInput[], productName: string) {
  return devices
    .filter(isValidExistingDevice)
    .filter(device => matchesProduct(device, productName))
    .reduce((sum, device) => sum + Math.max(0, Number(device.adet || 0)), 0)
}

function addNeed(
  materials: MaterialListItem[],
  suggestions: Array<{ baslik: string; oncelik: 'Kritik' | 'Önemli' | 'Önerilir'; aciklama: string }>,
  existingDevices: ExistingDeviceInput[],
  productName: string,
  category: string,
  needed: number,
  priority: 'Kritik' | 'Önemli' | 'Önerilir',
  reason: string,
  unit = 'adet'
) {
  const validExisting = validExistingCount(existingDevices, productName)
  const missing = Math.max(0, Math.ceil(needed) - validExisting)
  if (missing <= 0) return
  suggestions.push({
    baslik: productName,
    oncelik: priority,
    aciklama: `${reason}. Eksik: ${missing} ${unit}.`,
  })
  materials.push(materialItem('genel_ihtiyac_raporu', productName, category, missing, unit, reason))
}

export function calculateGeneralNeeds(input: GeneralNeedsInput, settings: TechnicalSetting[]) {
  const area = Number(input.toplam_alan || 0)
  const floors = Math.max(1, Number(input.kat_sayisi || 1))
  const rooms = Math.max(0, Number(input.oda_sayisi || 0))
  const extinguisherRatio = settingNumber(settings, 'yangin_tupu_alan_orani', 250)
  const systems = input.mevcut_sistemler ?? {}
  const existingDevices = Array.isArray(input.mevcut_cihazlar) ? input.mevcut_cihazlar : []
  const suggestions: Array<{ baslik: string; oncelik: 'Kritik' | 'Önemli' | 'Önerilir'; aciklama: string }> = []
  const materials: MaterialListItem[] = []

  const baseKkt = Math.max(floors, Math.ceil(area / extinguisherRatio), Math.ceil(rooms / 6))
  addNeed(materials, suggestions, existingDevices, '6 Kg KKT Yangın Söndürme Cihazı', 'Taşınabilir Söndürme', baseKkt, 'Kritik', 'Genel alan, kat ve oda yoğunluğu için temel taşınabilir söndürme ihtiyacı')

  if (input.depo_var) {
    addNeed(materials, suggestions, existingDevices, '6 Kg KKT Yangın Söndürme Cihazı', 'Taşınabilir Söndürme', 1, 'Önemli', 'Depo alanı için ilave KKT cihazı')
  }
  if (input.uretim_alani_var) {
    addNeed(materials, suggestions, existingDevices, '6 Kg KKT Yangın Söndürme Cihazı', 'Taşınabilir Söndürme', Math.max(2, Math.ceil(area / 500)), 'Önemli', 'Üretim alanı ilave KKT')
    addNeed(materials, suggestions, existingDevices, '12 Kg Köpüklü Yangın Söndürme Cihazı', 'Taşınabilir Söndürme', 1, 'Önerilir', 'Üretim/sıvı riskleri için köpüklü cihaz')
    if (area >= 750) addNeed(materials, suggestions, existingDevices, '50 Kg KKT Arabalı Yangın Söndürme Cihazı', 'Arabalı Söndürme', 1, 'Önerilir', 'Geniş saha için arabalı cihaz')
  }
  if (input.mutfak_var) {
    addNeed(materials, suggestions, existingDevices, '5 Kg CO2 Yangın Söndürme Cihazı', 'Elektrik Yangınları', 1, 'Önemli', 'Mutfak ilk müdahale CO2')
    addNeed(materials, suggestions, existingDevices, 'Yangın Battaniyesi', 'Mutfak Güvenliği', 1, 'Önemli', 'Mutfak ilk müdahale')
    addNeed(materials, suggestions, existingDevices, 'Davlumbaz Söndürme Sistemi Keşif Kalemi', 'Özel Sistem', systems.davlumbaz_sondurme ? 0 : 1, 'Kritik', 'Davlumbaz hattı keşfi', 'set')
  }
  if (input.elektrik_pano_odasi_var) {
    addNeed(materials, suggestions, existingDevices, '5 Kg CO2 Yangın Söndürme Cihazı', 'Elektrik Yangınları', 1, 'Kritik', 'Pano odası CO2')
    addNeed(materials, suggestions, existingDevices, 'Pano İçi Aerosol Söndürme Sistemi', 'Özel Sistem', systems.pano_sondurme ? 0 : 1, 'Önerilir', 'Pano içi lokal söndürme', 'set')
  }
  if (input.server_odasi_var) {
    addNeed(materials, suggestions, existingDevices, '5 Kg CO2 Yangın Söndürme Cihazı', 'Elektrik Yangınları', 1, 'Kritik', 'Server odası CO2')
    addNeed(materials, suggestions, existingDevices, 'Gazlı Söndürme Sistemi Keşif Kalemi', 'Gazlı Söndürme', systems.gazli_sondurme ? 0 : 1, 'Önemli', 'Server odası gazlı sistem keşfi', 'set')
  }
  if (input.otopark_var) {
    addNeed(materials, suggestions, existingDevices, '6 Kg KKT Yangın Söndürme Cihazı', 'Taşınabilir Söndürme', Math.max(2, Math.ceil(area / 600)), 'Önemli', 'Otopark ilave KKT')
  }

  if (!systems.yangin_alarm) {
    suggestions.push({ baslik: 'Yangın alarm sistemi ihtiyacı', oncelik: 'Kritik', aciklama: 'Alarm sistemi keşfi önerilir.' })
    materials.push(materialItem('genel_ihtiyac_raporu', 'Yangın Alarm Sistemi Keşif Kalemi', 'Alarm', 1, 'set'))
  }
  if (!systems.yangin_dolabi && area > 500) {
    suggestions.push({ baslik: 'Yangın dolabı ihtiyacı', oncelik: 'Önemli', aciklama: 'Kat/risk durumuna göre değerlendirilmelidir.' })
    materials.push(materialItem('genel_ihtiyac_raporu', 'Yangın Dolabı', 'Sulu Söndürme', floors))
  }
  if (!systems.acil_aydinlatma) {
    suggestions.push({ baslik: 'Acil aydınlatma ihtiyacı', oncelik: 'Önemli', aciklama: 'Kaçış yolları için önerilir.' })
    materials.push(materialItem('genel_ihtiyac_raporu', 'Acil Aydınlatma Armatürü', 'Acil Aydınlatma', Math.max(floors, Math.ceil(area / 200))))
  }
  if (!systems.yonlendirme_levhasi) {
    suggestions.push({ baslik: 'Yönlendirme levhası ihtiyacı', oncelik: 'Önemli', aciklama: 'Çıkış yönlendirmeleri tamamlanmalı.' })
    materials.push(materialItem('genel_ihtiyac_raporu', 'Acil Çıkış Yönlendirme Levhası', 'Levha', Math.max(floors * 2, 2)))
  }
  if (!systems.periyodik_bakim) {
    suggestions.push({ baslik: 'Periyodik bakım ihtiyacı', oncelik: 'Önemli', aciklama: 'Bakım gereken/geçmiş cihazlar ihtiyaçtan düşülmedi.' })
  }

  return {
    calculation_result: {
      oneriler: suggestions,
      gecerli_mevcut_cihaz_sayisi: existingDevices.filter(isValidExistingDevice).reduce((sum, device) => sum + Math.max(0, Number(device.adet || 0)), 0),
      uyari: 'Bu rapor keşif ve teklif hazırlığı için ön değerlendirmedir; nihai mühendislik/proje onayı yerine geçmez.',
    },
    material_list: mergeSameMaterials(materials),
  }
}
