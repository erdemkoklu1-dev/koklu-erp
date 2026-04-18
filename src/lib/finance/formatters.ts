export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return '₺0,00'
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
  }).format(amount)
}

export function formatCurrencyCompact(amount: number | null | undefined): string {
  if (amount == null) return '₺0'
  if (Math.abs(amount) >= 1_000_000)
    return '₺' + (amount / 1_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + 'M'
  if (Math.abs(amount) >= 1_000)
    return '₺' + (amount / 1_000).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + 'B'
  return formatCurrency(amount)
}

export function formatPercent(rate: number): string {
  return '%' + rate.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

export function formatTRDate(date: string | Date | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function formatTRDateFull(date: string | Date | null | undefined): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export const INVOICE_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  taslak:        { label: 'Taslak',           className: 'bg-gray-100 text-gray-600 border-gray-200' },
  kesildi:       { label: 'Kesildi',          className: 'bg-blue-50 text-blue-700 border-blue-200' },
  gonderildi:    { label: 'Gönderildi',       className: 'bg-purple-50 text-purple-700 border-purple-200' },
  kismi_odendi:  { label: 'Kısmi Ödendi',     className: 'bg-orange-50 text-orange-700 border-orange-200' },
  odendi:        { label: 'Ödendi',           className: 'bg-green-50 text-green-700 border-green-200' },
  iptal:         { label: 'İptal',            className: 'bg-red-50 text-red-600 border-red-200' },
  vergi_mahsup:  { label: 'Mahsup Edildi',    className: 'bg-violet-50 text-violet-700 border-violet-200' },
}

export const MONTHS_TR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
]

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  nakit:          'Nakit',
  havale_eft:     'Havale / EFT',
  kredi_karti:    'Kredi Kartı',
  cek:            'Çek',
  senet:          'Senet',
  diger:          'Diğer',
  vergi_mahsup:   'Vergi Borcuna Mahsup',
}

export const TAX_TYPE_LABELS: Record<string, string> = {
  kdv:              'KDV Beyannamesi',
  muhtasar:         'Muhtasar Beyanname',
  gelir_vergisi:    'Gelir Vergisi',
  kurumlar_vergisi: 'Kurumlar Vergisi',
  sgk_bildirimi:    'SGK Bildirimi',
  damga_vergisi:    'Damga Vergisi',
}

export const DECLARATION_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  hazirlanacak: { label: 'Hazırlanacak', className: 'bg-gray-100 text-gray-600 border-gray-200' },
  hazirlandi:   { label: 'Hazırlandı',   className: 'bg-blue-50 text-blue-700 border-blue-200' },
  verildi:      { label: 'Verildi',      className: 'bg-purple-50 text-purple-700 border-purple-200' },
  odendi:       { label: 'Ödendi',       className: 'bg-green-50 text-green-700 border-green-200' },
}
