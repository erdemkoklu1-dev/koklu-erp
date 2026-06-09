import type { MaterialListItem, TechnicalSetting } from './types'

export type VentilationSectionType = 'dairesel' | 'dikdortgen' | 'kare' | 'manuel'
export type VentilationEvaluationMode = 'otomatik' | 'manuel'
export type VentilationEvaluation = 'Uygun' | 'Şartlı Uygun' | 'Uygun Değil' | 'Manuel Değerlendirme'

export type VentilationMeasurementSet = {
  ust: number
  alt: number
  sag: number
  sol: number
  orta: number
}

export type VentilationTestInput = {
  firma_kurum: string
  test_tarihi: string
  test_yapilan_mahal: string
  sistem_tipi: string
  tekniker_ad_soyad: string
  ekipnet_no: string
  cihaz_marka: string
  cihaz_model: string
  cihaz_seri_no: string
  kesit_tipi: VentilationSectionType
  manuel_kesit_adi: string
  dairesel_cap_mm: number
  dikdortgen_en_mm: number
  dikdortgen_boy_mm: number
  kare_kenar_mm: number
  manuel_kesit_alani_m2: number
  havalandirma_uzunlugu_m: number
  dirsek_sayisi: number
  giris_olcumleri: VentilationMeasurementSet
  cikis_olcumleri: VentilationMeasurementSet
  cikis_olcumu_yapilamadi: boolean
  sanal_cikis_hesabi: boolean
  degerlendirme_modu: VentilationEvaluationMode
  manuel_degerlendirme: string
  olcum_notlari: string
}

export const ventilationDefaultSettings = [
  ['havalandirma_minimum_hiz', '2.5', 'm/s', 'Havalandırma testinde otomatik uygunluk için minimum ortalama çıkış hızı.'],
  ['havalandirma_maksimum_kayip_orani', '25', '%', 'Giriş ve çıkış debisi arasındaki kabul edilebilir maksimum kayıp oranı.'],
  ['havalandirma_varsayilan_kayip_orani', '12', '%', 'Çıkış ölçümü yapılamadığında sanal çıkış için kullanılan varsayılan kayıp oranı.'],
  ['havalandirma_dirsek_kayip_orani', '2', '%/adet', 'Sanal çıkış hesabında her dirsek için eklenen tahmini kayıp.'],
  ['havalandirma_metre_kayip_orani', '0.15', '%/m', 'Sanal çıkış hesabında her metre kanal için eklenen tahmini kayıp.'],
] as const

function settingNumber(settings: TechnicalSetting[], key: string, fallback: number) {
  const row = settings.find(setting => setting.ayar_grubu === 'havalandirma_test' && setting.ayar_adi === key)
  const parsed = Number(String(row?.ayar_degeri ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : fallback
}

function round(value: number, digits = 2) {
  if (!Number.isFinite(value)) return 0
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function values(set: VentilationMeasurementSet) {
  return [set.ust, set.alt, set.sag, set.sol, set.orta].filter(value => Number.isFinite(value) && value > 0)
}

function average(set: VentilationMeasurementSet) {
  const rows = values(set)
  if (!rows.length) return 0
  return rows.reduce((sum, value) => sum + value, 0) / rows.length
}

function minMax(input: VentilationMeasurementSet, fallback?: VentilationMeasurementSet) {
  const rows = [...values(input), ...(fallback ? values(fallback) : [])]
  return {
    min: rows.length ? Math.min(...rows) : 0,
    max: rows.length ? Math.max(...rows) : 0,
  }
}

function sectionArea(input: VentilationTestInput) {
  if (input.kesit_tipi === 'dairesel') {
    const diameterM = input.dairesel_cap_mm / 1000
    return Math.PI * diameterM * diameterM / 4
  }
  if (input.kesit_tipi === 'dikdortgen') {
    return (input.dikdortgen_en_mm / 1000) * (input.dikdortgen_boy_mm / 1000)
  }
  if (input.kesit_tipi === 'kare') {
    const sideM = input.kare_kenar_mm / 1000
    return sideM * sideM
  }
  return input.manuel_kesit_alani_m2
}

function sectionLabel(input: VentilationTestInput) {
  if (input.kesit_tipi === 'dairesel') return `Dairesel Ø${input.dairesel_cap_mm || 0} mm`
  if (input.kesit_tipi === 'dikdortgen') return `Dikdörtgen ${input.dikdortgen_en_mm || 0} x ${input.dikdortgen_boy_mm || 0} mm`
  if (input.kesit_tipi === 'kare') return `Kare ${input.kare_kenar_mm || 0} x ${input.kare_kenar_mm || 0} mm`
  return input.manuel_kesit_adi || 'Manuel kesit alanı'
}

export function calculateVentilationTest(input: VentilationTestInput, settings: TechnicalSetting[]) {
  const minimumSpeed = settingNumber(settings, 'havalandirma_minimum_hiz', 2.5)
  const maximumLossRatio = settingNumber(settings, 'havalandirma_maksimum_kayip_orani', 25)
  const defaultLossRatio = settingNumber(settings, 'havalandirma_varsayilan_kayip_orani', 12)
  const elbowLossRatio = settingNumber(settings, 'havalandirma_dirsek_kayip_orani', 2)
  const meterLossRatio = settingNumber(settings, 'havalandirma_metre_kayip_orani', 0.15)

  const girisOrtalamaHiz = average(input.giris_olcumleri)
  const measuredExitAverage = average(input.cikis_olcumleri)
  const estimatedLossRatio = Math.min(
    95,
    Math.max(0, defaultLossRatio + input.dirsek_sayisi * elbowLossRatio + input.havalandirma_uzunlugu_m * meterLossRatio)
  )
  const sanalCikisKullanildi = input.cikis_olcumu_yapilamadi && input.sanal_cikis_hesabi
  const cikisOrtalamaHiz = sanalCikisKullanildi
    ? girisOrtalamaHiz * (1 - estimatedLossRatio / 100)
    : measuredExitAverage

  const minMaxSpeed = minMax(input.giris_olcumleri, sanalCikisKullanildi ? undefined : input.cikis_olcumleri)
  const kesitAlaniM2 = sectionArea(input)
  const girisDebiM3S = girisOrtalamaHiz * kesitAlaniM2
  const cikisDebiM3S = cikisOrtalamaHiz * kesitAlaniM2
  const kayipOrani = girisDebiM3S > 0 ? ((girisDebiM3S - cikisDebiM3S) / girisDebiM3S) * 100 : 0

  let degerlendirme: VentilationEvaluation = 'Uygun Değil'
  if (input.degerlendirme_modu === 'manuel') {
    degerlendirme = 'Manuel Değerlendirme'
  } else if (cikisOrtalamaHiz >= minimumSpeed && kayipOrani <= maximumLossRatio && !sanalCikisKullanildi) {
    degerlendirme = 'Uygun'
  } else if (cikisOrtalamaHiz >= minimumSpeed * 0.8 && kayipOrani <= maximumLossRatio + 10) {
    degerlendirme = 'Şartlı Uygun'
  }

  const oneriler: string[] = []
  if (cikisOrtalamaHiz < minimumSpeed) {
    oneriler.push(`Çıkış ortalama hızı ${minimumSpeed} m/s altındadır; fan kapasitesi, filtre kirliliği ve kanal tıkanıklığı kontrol edilmelidir.`)
  }
  if (kayipOrani > maximumLossRatio) {
    oneriler.push(`Giriş/çıkış kayıp oranı %${maximumLossRatio} sınırını aşıyor; dirsekler, kaçak noktaları ve kesit daralmaları incelenmelidir.`)
  }
  if (sanalCikisKullanildi) {
    oneriler.push('Çıkış ölçümü yapılamadığı için sanal çıkış hesabı kullanıldı; erişim sağlandığında fiili çıkış ölçümü ile rapor güncellenmelidir.')
  }
  if (!oneriler.length) oneriler.push('Ölçülen değerler seçili teknik parametrelerle uyumludur; periyodik takip önerilir.')

  const otomatik_degerlendirme = sanalCikisKullanildi
    ? 'Çıkış ölçümü yapılamadığı için sonuç tahmini sanal çıkış hesabına göre şartlı değerlendirilmiştir.'
    : `Ortalama çıkış hızı ve kayıp oranı teknik ayar eşikleriyle karşılaştırılarak ${degerlendirme.toLocaleLowerCase('tr-TR')} sonucu üretildi.`

  return {
    calculation_result: {
      kesit_tipi: input.kesit_tipi,
      kesit_aciklama: sectionLabel(input),
      kesit_alani_m2: round(kesitAlaniM2, 4),
      giris_ortalama_hiz_ms: round(girisOrtalamaHiz),
      cikis_ortalama_hiz_ms: round(cikisOrtalamaHiz),
      ortalama_hiz_ms: round((girisOrtalamaHiz + cikisOrtalamaHiz) / 2),
      minimum_hiz_ms: round(minMaxSpeed.min),
      maksimum_hiz_ms: round(minMaxSpeed.max),
      giris_debi_m3_s: round(girisDebiM3S, 3),
      giris_debi_m3_h: round(girisDebiM3S * 3600),
      cikis_debi_m3_s: round(cikisDebiM3S, 3),
      cikis_debi_m3_h: round(cikisDebiM3S * 3600),
      kayip_orani_yuzde: round(kayipOrani),
      tahmini_kayip_orani_yuzde: round(estimatedLossRatio),
      sanal_cikis_kullanildi: sanalCikisKullanildi,
      minimum_hiz_esigi_ms: minimumSpeed,
      maksimum_kayip_esigi_yuzde: maximumLossRatio,
      degerlendirme,
      otomatik_degerlendirme,
      manuel_degerlendirme: input.manuel_degerlendirme,
      oneriler,
      uyari: sanalCikisKullanildi
        ? 'Bu raporda çıkış ölçümü yapılamadığı için çıkış değerleri tahmini sanal çıkış hesabıyla üretilmiştir; nihai kabul yerine geçmez.'
        : 'Bu rapor saha ölçüm değerlerine göre hazırlanmış teknik değerlendirme çıktısıdır.',
    },
    material_list: [] as MaterialListItem[],
  }
}
