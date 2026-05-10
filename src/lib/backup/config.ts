export const BACKUP_ALLOWED_ROLES = ['Admin', 'Yonetici', 'Yönetici']

export type BackupTableKey =
  | 'customers'
  | 'devices'
  | 'service_forms'
  | 'service_form_items'
  | 'faturalar'
  | 'gelen_faturalar'
  | 'payments'
  | 'invoice_items'
  | 'teklifler'
  | 'teklif_kalemleri'
  | 'hatirlatma_kayitlari'
  | 'hatirlatma_susturmalar'
  | 'mutabakat_formlari'
  | 'aracilar'
  | 'fatura_aracilar'
  | 'subeler'
  | 'personeller'
  | 'urunler'
  | 'sistem_ayarlari'

export type BackupTableConfig = {
  key: BackupTableKey
  table: string
  label: string
  orderBy?: string
  filters?: Array<{ column: string; value: string }>
  sensitive?: boolean
}

export const BACKUP_TABLES: BackupTableConfig[] = [
  { key: 'customers', table: 'customers', label: 'Musteriler', orderBy: 'created_at' },
  { key: 'devices', table: 'devices', label: 'Musteri cihazlari', orderBy: 'created_at' },
  { key: 'service_forms', table: 'service_forms', label: 'Servis formlari', orderBy: 'created_at' },
  { key: 'service_form_items', table: 'service_form_items', label: 'Servis form kalemleri' },
  { key: 'faturalar', table: 'invoices', label: 'Giden faturalar', orderBy: 'created_at', filters: [{ column: 'invoice_type', value: 'satis' }] },
  { key: 'gelen_faturalar', table: 'invoices', label: 'Gelen faturalar', orderBy: 'created_at', filters: [{ column: 'invoice_type', value: 'alis' }] },
  { key: 'payments', table: 'payments', label: 'Odemeler', orderBy: 'payment_date' },
  { key: 'invoice_items', table: 'invoice_items', label: 'Fatura kalemleri', orderBy: 'created_at' },
  { key: 'teklifler', table: 'teklifler', label: 'Teklifler', orderBy: 'created_at' },
  { key: 'teklif_kalemleri', table: 'teklif_kalemleri', label: 'Teklif kalemleri', orderBy: 'created_at' },
  { key: 'hatirlatma_kayitlari', table: 'hatirlatma_kayitlari', label: 'Hatirlatma kayitlari', orderBy: 'created_at' },
  { key: 'hatirlatma_susturmalar', table: 'hatirlatma_susturmalar', label: 'Hatirlatma susturmalar', orderBy: 'created_at' },
  { key: 'mutabakat_formlari', table: 'mutabakat_formlari', label: 'Mutabakat formlari', orderBy: 'created_at' },
  { key: 'aracilar', table: 'brokers', label: 'Aracilar', orderBy: 'created_at' },
  { key: 'fatura_aracilar', table: 'invoice_brokers', label: 'Fatura aracilari', orderBy: 'created_at' },
  { key: 'subeler', table: 'subeler', label: 'Subeler', orderBy: 'created_at' },
  { key: 'personeller', table: 'personeller', label: 'Personeller', orderBy: 'created_at' },
  { key: 'urunler', table: 'urunler', label: 'Urunler', orderBy: 'created_at' },
  { key: 'sistem_ayarlari', table: 'app_settings', label: 'Sistem ayarlari', sensitive: true },
]

export const TABLE_EXPORT_GROUPS = [
  { key: 'customers', label: 'Sadece musteriler', tables: ['customers', 'devices'] },
  { key: 'faturalar', label: 'Sadece giden faturalar', tables: ['faturalar', 'invoice_items', 'payments'] },
  { key: 'gelen_faturalar', label: 'Sadece gelen faturalar', tables: ['gelen_faturalar'] },
  { key: 'service_forms', label: 'Sadece servis formlari', tables: ['service_forms', 'service_form_items'] },
  { key: 'payments', label: 'Sadece odemeler', tables: ['payments'] },
  { key: 'personeller', label: 'Sadece personel', tables: ['personeller'] },
  { key: 'teklifler', label: 'Sadece teklifler', tables: ['teklifler', 'teklif_kalemleri'] },
  { key: 'hatirlatmalar', label: 'Sadece hatirlatmalar', tables: ['customers', 'devices', 'hatirlatma_kayitlari', 'hatirlatma_susturmalar'] },
  { key: 'urunler', label: 'Sadece urunler', tables: ['urunler'] },
] as const

export const FULL_BACKUP_TABLE_KEYS = BACKUP_TABLES.map(table => table.key)

export const BACKUP_STORAGE_BUCKET = 'backups'
