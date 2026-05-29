import { formatDateTR } from './report-utils'

export const technicalReportLabels: Record<string, string> = {
  bina_tipi: 'Bina Tipi',
  sistem_tipi: 'Sistem Tipi',
  kat_sayisi: 'Kat Sayısı',
  toplam_alan: 'Toplam Alan',
  kullanim_amaci: 'Kullanım Amacı',
  mevcut_sistem_var: 'Mevcut Sistem',
  oda_sayisi: 'Oda Sayısı',
  calisan_sayisi: 'Çalışan Sayısı',
  ziyaretci_yogunlugu: 'Ziyaretçi Yoğunluğu',
  depo_var: 'Depo',
  mutfak_var: 'Mutfak',
  elektrik_pano_odasi_var: 'Elektrik Pano Odası',
  server_odasi_var: 'Server Odası',
  otopark_var: 'Otopark',
  uretim_alani_var: 'Üretim Alanı',
  oda_adi: 'Oda Adı',
  test_tarihi: 'Test Tarihi',
  oda_eni: 'Oda Eni',
  oda_boyu: 'Oda Boyu',
  oda_yuksekligi: 'Oda Yüksekliği',
  hacim: 'Hacim',
  net_korunan_hacim: 'Net Korunan Hacim',
  gaz_tipi: 'Gaz Tipi',
  hedef_tutma_suresi: 'Hedef Tutma Süresi',
  sonuc: 'Sonuç',
  musteri_giris_tipi: 'Müşteri Giriş Tipi',
}

const unitByKey: Record<string, string> = {
  toplam_alan: 'm²',
  alan_m2: 'm²',
  oda_eni: 'm',
  oda_boyu: 'm',
  oda_yuksekligi: 'm',
  hacim: 'm³',
  net_korunan_hacim: 'm³',
  hedef_tutma_suresi: 'dk',
}

export function formatTechnicalLabel(key: string) {
  return technicalReportLabels[key] ?? key
    .replaceAll('_', ' ')
    .replace(/\b\w/g, letter => letter.toLocaleUpperCase('tr-TR'))
}

export function formatTechnicalValue(value: unknown, key?: string): string {
  if (value === true) return 'Var'
  if (value === false) return 'Yok'
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'number') {
    const formatted = value.toLocaleString('tr-TR')
    return key && unitByKey[key] ? `${formatted} ${unitByKey[key]}` : formatted
  }
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return formatDateTR(value)
    return value
  }
  if (Array.isArray(value)) return `${value.length} kayıt`
  if (typeof value === 'object') return 'Detaylar rapor bölümlerinde gösterildi'
  return String(value)
}

export function getCompactInputRows(input: Record<string, any>, reportType: string) {
  const keysByType: Record<string, string[]> = {
    yangin_alarm_ihtiyac: ['bina_tipi', 'sistem_tipi', 'kat_sayisi', 'toplam_alan', 'kullanim_amaci', 'mevcut_sistem_var'],
    genel_ihtiyac_raporu: ['bina_tipi', 'toplam_alan', 'kat_sayisi', 'oda_sayisi', 'calisan_sayisi', 'ziyaretci_yogunlugu', 'depo_var', 'mutfak_var', 'elektrik_pano_odasi_var', 'server_odasi_var', 'otopark_var', 'uretim_alani_var'],
    oda_sizdirmazlik_testi: ['oda_adi', 'test_tarihi', 'oda_eni', 'oda_boyu', 'oda_yuksekligi', 'hacim', 'net_korunan_hacim', 'gaz_tipi', 'hedef_tutma_suresi', 'sonuc'],
  }

  return (keysByType[reportType] ?? Object.keys(input))
    .filter(key => input[key] !== undefined && input[key] !== null && input[key] !== '')
    .map(key => ({ label: formatTechnicalLabel(key), value: formatTechnicalValue(input[key], key) }))
}
