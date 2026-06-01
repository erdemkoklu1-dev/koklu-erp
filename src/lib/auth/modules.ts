export type AppModuleKey =
  | 'dashboard'
  | 'customers'
  | 'devices'
  | 'service_forms'
  | 'factory'
  | 'deliveries'
  | 'operations'
  | 'operation_requests'
  | 'operation_work_plans'
  | 'reminders'
  | 'price_offers'
  | 'proforma_invoices'
  | 'current_account'
  | 'invoices'
  | 'outgoing_invoices'
  | 'incoming_invoices'
  | 'customer_current'
  | 'supplier_current'
  | 'suppliers'
  | 'agents'
  | 'branches'
  | 'personnel'
  | 'customer_import'
  | 'invoice_import'
  | 'technical_reports'
  | 'technical_calculations'
  | 'water_system_reports'
  | 'room_integrity_test'
  | 'fire_alarm_calculation'
  | 'general_need_report'
  | 'management'
  | 'users'
  | 'roles'
  | 'settings'
  | 'logs'

export interface AppModuleDefinition {
  key: AppModuleKey
  label: string
  group: string
  aliases?: string[]
}

export const APP_MODULES: AppModuleDefinition[] = [
  { key: 'dashboard', label: 'Anasayfa', group: 'Genel' },
  { key: 'customers', label: 'Müşteriler', group: 'Müşteri Yönetimi', aliases: ['musteriler'] },
  { key: 'devices', label: 'Cihazlar', group: 'Müşteri Yönetimi', aliases: ['cihazlar'] },
  { key: 'service_forms', label: 'Servis Formları', group: 'Operasyon', aliases: ['servis_formlari'] },
  { key: 'deliveries', label: 'Teslimatlar', group: 'Operasyon' },
  { key: 'operations', label: 'Operasyon', group: 'Operasyon' },
  { key: 'operation_requests', label: 'Talepler', group: 'Operasyon' },
  { key: 'operation_work_plans', label: 'İş Planları', group: 'Operasyon' },
  { key: 'reminders', label: 'Hatırlatmalar', group: 'Operasyon', aliases: ['hatirlatmalar'] },
  { key: 'price_offers', label: 'Fiyat Teklifleri', group: 'Satış', aliases: ['fiyat_teklifleri'] },
  { key: 'proforma_invoices', label: 'Proforma Fatura', group: 'Satış' },
  { key: 'current_account', label: 'Cari Hesap', group: 'Finans', aliases: ['cari_hesap'] },
  { key: 'invoices', label: 'Faturalar', group: 'Finans', aliases: ['faturalar'] },
  { key: 'outgoing_invoices', label: 'Giden Faturalar', group: 'Finans', aliases: ['faturalar'] },
  { key: 'incoming_invoices', label: 'Gelen Faturalar', group: 'Finans', aliases: ['faturalar'] },
  { key: 'customer_current', label: 'Müşteri Cari', group: 'Finans' },
  { key: 'supplier_current', label: 'Tedarikçi Cari', group: 'Finans' },
  { key: 'suppliers', label: 'Tedarikçiler', group: 'Finans' },
  { key: 'agents', label: 'Aracılar', group: 'Finans', aliases: ['aracilar'] },
  { key: 'invoice_import', label: 'Fatura Yükle', group: 'Finans' },
  { key: 'technical_reports', label: 'Teknik Hesap & Raporlar', group: 'Teknik' },
  { key: 'technical_calculations', label: 'Teknik Hesaplar', group: 'Teknik' },
  { key: 'water_system_reports', label: 'Sulu Sistem Raporları', group: 'Teknik' },
  { key: 'room_integrity_test', label: 'Oda Sızdırmazlık Testi', group: 'Teknik' },
  { key: 'fire_alarm_calculation', label: 'Yangın Alarm Hesabı', group: 'Teknik' },
  { key: 'general_need_report', label: 'Genel İhtiyaç Raporu', group: 'Teknik' },
  { key: 'branches', label: 'Şubeler', group: 'Yönetim', aliases: ['subeler'] },
  { key: 'personnel', label: 'Personel', group: 'Yönetim', aliases: ['personel'] },
  { key: 'customer_import', label: 'Müşteri İçe Aktar', group: 'Yönetim', aliases: ['musteriler'] },
  { key: 'factory', label: 'Fabrika', group: 'Yönetim', aliases: ['fabrika'] },
  { key: 'management', label: 'Yönetim', group: 'Yönetim', aliases: ['yonetim'] },
  { key: 'users', label: 'Kullanıcılar', group: 'Yönetim', aliases: ['yonetim'] },
  { key: 'roles', label: 'Roller', group: 'Yönetim', aliases: ['yonetim'] },
  { key: 'settings', label: 'Ayarlar', group: 'Yönetim', aliases: ['yonetim'] },
  { key: 'logs', label: 'Loglar', group: 'Yönetim', aliases: ['yonetim'] },
]

export function moduleKeysWithAliases(key: AppModuleKey | string): string[] {
  const found = APP_MODULES.find(module => module.key === key)
  return found ? [found.key, ...(found.aliases ?? [])] : [key]
}
