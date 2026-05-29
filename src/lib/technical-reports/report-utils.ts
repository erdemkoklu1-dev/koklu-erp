import type { TechnicalReportType } from './types'

export function formatDateTR(value?: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('tr-TR')
}

export function createReportNo(type: TechnicalReportType) {
  const prefix: Record<TechnicalReportType, string> = {
    yangin_alarm_ihtiyac: 'YAIR',
    genel_ihtiyac_raporu: 'GIR',
    oda_sizdirmazlik_testi: 'OST',
  }
  const now = new Date()
  const date = now.toISOString().slice(0, 10).replaceAll('-', '')
  const time = `${now.getHours()}${now.getMinutes()}${now.getSeconds()}`.padStart(6, '0')
  return `${prefix[type]}-${date}-${time}`
}

export function personName(person?: { ad?: string | null; soyad?: string | null } | null) {
  return [person?.ad, person?.soyad].filter(Boolean).join(' ') || '-'
}
