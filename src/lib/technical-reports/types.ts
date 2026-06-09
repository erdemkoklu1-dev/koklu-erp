import { technicalReportTypeLabels } from './reportTypeLabels'

export type TechnicalReportType =
  | 'yangin_alarm_ihtiyac'
  | 'genel_ihtiyac_raporu'
  | 'oda_sizdirmazlik_testi'
  | 'havalandirma_test_raporu'
  | 'yangin_dolabi_hidrant_pompa'
  | 'sulu_sistem_hidrolik_hesap'

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
  id?: string
  ayar_grubu: string
  ayar_adi: string
  ayar_degeri: string
  birim?: string | null
  aciklama?: string | null
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
  teklif_id: string | null
  teslimat_id: string | null
  talep_id: string | null
  created_at: string
  customers?: { full_name?: string | null; address?: string | null } | null
  subeler?: { ad?: string | null } | null
  personeller?: { ad?: string | null; soyad?: string | null } | null
}

export const REPORT_TYPE_LABELS: Record<TechnicalReportType, string> = Object.fromEntries(
  Object.entries(technicalReportTypeLabels).map(([type, value]) => [type, value.title])
) as Record<TechnicalReportType, string>

export const REPORT_TYPE_SUBTITLES: Record<TechnicalReportType, string> = Object.fromEntries(
  Object.entries(technicalReportTypeLabels).map(([type, value]) => [type, value.subtitle])
) as Record<TechnicalReportType, string>
