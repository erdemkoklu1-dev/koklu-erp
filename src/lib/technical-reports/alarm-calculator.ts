import { materialItem, mergeSameMaterials } from './material-list'
import type { MaterialListItem, TechnicalSetting } from './types'

type AlarmRoom = {
  kat?: string
  bolum_adi?: string
  bolum_tipi?: string
  alan_m2?: number
  en?: number
  boy?: number
  tavan_yuksekligi?: number
  ortam_tipi?: string
  asma_tavan?: boolean
  yukseltilmis_doseme?: boolean
  dedektor_tipi?: string
  manuel_not?: string
}

export type AlarmInput = {
  bina_tipi?: string
  sistem_tipi?: 'adresli' | 'konvansiyonel'
  kat_sayisi?: number
  toplam_alan?: number
  kullanim_amaci?: string
  mevcut_sistem_var?: boolean
  aciklama?: string
  bolumler?: AlarmRoom[]
}

function settingNumber(settings: TechnicalSetting[], name: string, fallback: number) {
  const found = settings.find(s => s.ayar_grubu === 'yangin_alarm' && s.ayar_adi === name)
  const parsed = Number(found?.ayar_degeri)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function detectorFor(room: AlarmRoom) {
  if (room.dedektor_tipi && room.dedektor_tipi !== 'Otomatik') return room.dedektor_tipi
  const type = `${room.bolum_tipi ?? ''} ${room.ortam_tipi ?? ''}`.toLocaleLowerCase('tr-TR')
  if (type.includes('mutfak') || type.includes('kazan') || type.includes('otopark')) return 'Isı Dedektörü'
  if (type.includes('server') || type.includes('pano')) return 'Kombine Dedektör'
  return 'Optik Duman Dedektörü'
}

function includesAny(value: string, words: string[]) {
  return words.some(word => value.includes(word))
}

export function calculateAlarmNeeds(input: AlarmInput, settings: TechnicalSetting[]) {
  const smokeCoverage = settingNumber(settings, 'duman_dedektoru_kapsama_alani', 60)
  const heatCoverage = settingNumber(settings, 'isi_dedektoru_kapsama_alani', 40)
  const sirenCoverage = settingNumber(settings, 'siren_kapsama_alani', 250)
  const loopMax = settingNumber(settings, 'adresli_loop_maksimum_cihaz', 120)
  const cableWaste = settingNumber(settings, 'kablo_fire_orani', 15)
  const rooms = input.bolumler?.length ? input.bolumler : [{ bolum_adi: 'Genel Alan', alan_m2: input.toplam_alan ?? 0 }]

  const bolum_sonuclari = rooms.map(room => {
    const area = Number(room.alan_m2 || ((room.en ?? 0) * (room.boy ?? 0)) || 0)
    const detector = detectorFor(room)
    const coverage = detector === 'Isı Dedektörü' ? heatCoverage : smokeCoverage
    const dedektor_adedi = Math.max(1, Math.ceil(area / coverage))
    return { ...room, alan_m2: area, onerilen_dedektor_tipi: detector, dedektor_adedi }
  })

  const totalArea = Number(input.toplam_alan || bolum_sonuclari.reduce((sum, r) => sum + r.alan_m2, 0) || 0)
  const floors = Math.max(new Set(rooms.map(r => r.kat || 'Genel')).size, Number(input.kat_sayisi || 1), 1)
  const detectorCount = bolum_sonuclari.reduce((sum, r) => sum + r.dedektor_adedi, 0)
  const exitOrCommonAreaCount = rooms.filter(room => {
    const text = `${room.bolum_adi ?? ''} ${room.bolum_tipi ?? ''} ${room.ortam_tipi ?? ''}`.toLocaleLowerCase('tr-TR')
    return includesAny(text, ['koridor', 'çıkış', 'cikis', 'merdiven', 'ortak', 'hol', 'lobi'])
  }).length
  const riskyAreaCount = rooms.filter(room => {
    const text = `${room.bolum_adi ?? ''} ${room.bolum_tipi ?? ''} ${room.ortam_tipi ?? ''}`.toLocaleLowerCase('tr-TR')
    return includesAny(text, ['depo', 'mutfak', 'kazan', 'pano', 'server', 'otopark', 'üretim', 'uretim'])
  }).length
  const buttonCount = Math.max(
    floors,
    Math.ceil(totalArea / 500),
    exitOrCommonAreaCount,
    Math.ceil(rooms.length / 10)
  ) + Math.ceil(riskyAreaCount / 8)
  const sirenCount = Math.max(
    floors,
    Math.ceil(totalArea / sirenCoverage),
    Math.ceil(rooms.length / 6)
  ) + Math.ceil(riskyAreaCount / 5)
  const totalDevices = detectorCount + buttonCount + sirenCount
  const loops = input.sistem_tipi === 'adresli' ? Math.max(1, Math.ceil(totalDevices / loopMax)) : 0
  const zones = input.sistem_tipi === 'konvansiyonel' ? Math.max(floors, Math.ceil(rooms.length / 4)) : 0
  const cable = Math.ceil((totalArea * 1.2 + floors * 35 + rooms.length * 8) * (1 + cableWaste / 100))

  const materials: MaterialListItem[] = []
  for (const result of bolum_sonuclari) {
    materials.push(materialItem('yangin_alarm_ihtiyac', result.onerilen_dedektor_tipi, 'Algılama', result.dedektor_adedi, 'adet', result.bolum_adi || 'Bölüm bazlı öneri'))
  }
  materials.push(
    materialItem('yangin_alarm_ihtiyac', 'Manuel Yangın Butonu', 'Alarm Ekipmanı', buttonCount),
    materialItem('yangin_alarm_ihtiyac', 'Siren / Flaşörlü Siren', 'Alarm Ekipmanı', sirenCount),
    materialItem('yangin_alarm_ihtiyac', input.sistem_tipi === 'konvansiyonel' ? 'Konvansiyonel Yangın Alarm Paneli' : 'Adresli Yangın Alarm Paneli', 'Panel', 1),
    materialItem('yangin_alarm_ihtiyac', 'Akü', 'Güç', 2),
    materialItem('yangin_alarm_ihtiyac', 'Yangın Alarm Kablosu', 'Kablo', cable, 'metre', `%${cableWaste} fire dahil yaklaşık metraj`)
  )
  if (loops > 1) materials.push(materialItem('yangin_alarm_ihtiyac', 'Adresli Loop Kartı / Kapasite', 'Panel', loops, 'loop'))
  if (zones > 0) materials.push(materialItem('yangin_alarm_ihtiyac', 'Konvansiyonel Bölge', 'Panel', zones, 'bölge'))

  return {
    calculation_result: {
      bolum_sonuclari,
      toplam_dedektor: detectorCount,
      buton_adedi: buttonCount,
      siren_adedi: sirenCount,
      buton_hesap_notu: `Kat: ${floors}, alan: ${totalArea} m², ortak/çıkış bölümü: ${exitOrCommonAreaCount}, riskli bölüm: ${riskyAreaCount}`,
      siren_hesap_notu: `Alan, kat, bölüm ve riskli alan yoğunluğuna göre yaklaşık öneridir.`,
      loop_sayisi: loops,
      bolge_sayisi: zones,
      kablo_metraj_tahmini: cable,
      uyari: 'Bu hesap teklif/keşif destek hesabıdır; nihai mühendislik projesi ve resmi onay yerine geçmez.',
    },
    material_list: mergeSameMaterials(materials),
  }
}
