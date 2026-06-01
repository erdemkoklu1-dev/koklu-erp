import type { TechnicalReportType } from './types'

export const technicalReportTypeLabels = {
  yangin_alarm_ihtiyac: {
    title: 'Yangın Alarm Sistemi İhtiyaç Hesabı',
    subtitle: 'Yangın algılama ve alarm sistemi ön keşif raporu',
    prefix: 'YAIR',
  },
  genel_ihtiyac_raporu: {
    title: 'Genel Keşif ve İhtiyaç Listesi Raporu',
    subtitle: 'Yangın güvenliği mevcut durum ve ihtiyaç değerlendirme raporu',
    prefix: 'GIR',
  },
  oda_sizdirmazlik_testi: {
    title: 'Oda Sızdırmazlık Test Raporu',
    subtitle: 'Gazlı söndürme sistemi oda bütünlüğü ön değerlendirme raporu',
    prefix: 'OST',
  },
  yangin_dolabi_hidrant_pompa: {
    title: 'Yangın Dolabı, Hidrant ve Yangın Pompası Ön Hesabı',
    subtitle: 'Sulu yangın söndürme sistemi ön keşif, debi, basınç ve ihtiyaç listesi raporu',
    prefix: 'YSP',
  },
} satisfies Record<TechnicalReportType, { title: string; subtitle: string; prefix: string }>

export function getTechnicalReportTypeLabel(type: TechnicalReportType) {
  return technicalReportTypeLabels[type]?.title ?? type
}

export function getTechnicalReportTypeSubtitle(type: TechnicalReportType) {
  return technicalReportTypeLabels[type]?.subtitle ?? ''
}

export function getTechnicalReportTypePrefix(type: TechnicalReportType) {
  return technicalReportTypeLabels[type]?.prefix ?? 'TR'
}
