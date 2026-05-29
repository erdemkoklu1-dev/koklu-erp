export type TechnicalReportType =
  | 'yangin_alarm_ihtiyac'
  | 'genel_ihtiyac_raporu'
  | 'oda_sizdirmazlik_testi'

export type TechnicalReportStatus =
  | 'Taslak'
  | 'Hesaplandı'
  | 'Onaylandı'
  | 'Teklife Aktarıldı'
  | 'İptal'

export type MaterialListItem = {
  id: string
  urun_adi: string
  kategori: string
  miktar: number
  birim: string
  aciklama: string
  rapor_kaynagi: TechnicalReportType
  manuel_duzenlendi: boolean
}

export type TechnicalSetting = {
  ayar_grubu: string
  ayar_adi: string
  ayar_degeri: string
  birim?: string | null
}

export type TechnicalReportRow = {
  id: string
  rapor_no: string
  rapor_turu: TechnicalReportType
  baslik: string
  customer_id: string | null
  customer_name_snapshot: string
  sube_id: string
  lokasyon: string | null
  adres: string | null
  rapor_tarihi: string
  hazirlayan_personel_id: string | null
  durum: TechnicalReportStatus
  standart_profili: string | null
  input_data: any
  calculation_result: any
  material_list: MaterialListItem[]
  notes: string | null
  pdf_url: string | null
  created_at: string
  customers?: { full_name?: string | null; address?: string | null } | null
  subeler?: { ad?: string | null } | null
  personeller?: { ad?: string | null; soyad?: string | null } | null
}

export const REPORT_TYPE_LABELS: Record<TechnicalReportType, string> = {
  yangin_alarm_ihtiyac: 'Yangın Alarm Sistemi İhtiyaç Hesabı',
  genel_ihtiyac_raporu: 'Genel Keşif ve İhtiyaç Listesi Raporu',
  oda_sizdirmazlik_testi: 'Oda Sızdırmazlık Testi',
}

export const REPORT_TYPE_SUBTITLES: Record<TechnicalReportType, string> = {
  yangin_alarm_ihtiyac: 'Yangın algılama ve alarm sistemi ön keşif raporu',
  genel_ihtiyac_raporu: 'Yangın güvenliği mevcut durum ve ihtiyaç değerlendirme raporu',
  oda_sizdirmazlik_testi: 'Gazlı söndürme sistemi oda bütünlüğü ön değerlendirme raporu',
}
