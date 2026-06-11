export type NormalizedTeslimatStatus = 'taslak' | 'sevkte' | 'tamamlandi' | 'cancelled' | string

export const TESLIMAT_CANCELLED_STATUS_ALIASES = ['iptal', 'İptal', 'cancelled', 'canceled'] as const

export function normalizeTeslimatStatus(value: unknown): NormalizedTeslimatStatus {
  const normalized = String(value ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replaceAll('ı', 'i')

  if (normalized === 'iptal' || normalized === 'cancelled' || normalized === 'canceled') return 'cancelled'
  if (normalized === 'tamamlandi') return 'tamamlandi'
  if (normalized === 'sevkte') return 'sevkte'
  if (normalized === 'taslak') return 'taslak'
  return normalized || 'taslak'
}

export function isCancelledTeslimatStatus(value: unknown) {
  return normalizeTeslimatStatus(value) === 'cancelled'
}

export function quotedTeslimatStatuses(values: readonly string[]) {
  return `(${values.map(value => `"${value.replaceAll('"', '\\"')}"`).join(',')})`
}
