export type TalepStatusKey = 'new' | 'in_progress' | 'waiting' | 'completed' | 'cancelled' | 'planned' | 'field' | 'transferred' | 'quoted' | 'unknown'

export const TALEP_STATUS_OPTIONS: Array<{ value: TalepStatusKey; label: string }> = [
  { value: 'new', label: 'Yeni' },
  { value: 'in_progress', label: 'İşleme Alındı' },
  { value: 'planned', label: 'Planlandı' },
  { value: 'field', label: 'Sahada' },
  { value: 'waiting', label: 'Beklemede' },
  { value: 'completed', label: 'Tamamlandı' },
  { value: 'cancelled', label: 'İptal' },
]

const STATUS_ALIASES: Record<TalepStatusKey, string[]> = {
  new: ['new', 'Yeni', 'yeni', 'open', 'açık', 'Açık'],
  in_progress: ['in_progress', 'in-progress', 'processing', 'İşleme Alındı', 'işleme alındı', 'Isleme Alindi', 'isleme_alindi'],
  planned: ['planned', 'Planlandı', 'planlandı', 'Planlandi', 'planlandi'],
  field: ['field', 'Sahada', 'sahada'],
  waiting: ['waiting', 'Beklemede', 'beklemede', 'pending'],
  completed: ['completed', 'done', 'closed', 'Tamamlandı', 'tamamlandı', 'Tamamlandi', 'tamamlandi'],
  cancelled: ['cancelled', 'canceled', 'İptal', 'iptal', 'Iptal'],
  transferred: ['Teslimata Aktarıldı', 'İş Planına Aktarıldı', 'transferred'],
  quoted: ['Teklif Verildi', 'quoted'],
  unknown: [],
}

const ALIAS_TO_KEY = new Map<string, TalepStatusKey>(
  Object.entries(STATUS_ALIASES).flatMap(([key, aliases]) =>
    aliases.map(alias => [alias.toLocaleLowerCase('tr-TR'), key as TalepStatusKey]),
  ),
)

export function normalizeTalepStatus(value: string | null | undefined): TalepStatusKey {
  if (!value) return 'unknown'
  return ALIAS_TO_KEY.get(value.trim().toLocaleLowerCase('tr-TR')) ?? 'unknown'
}

export function talepStatusLabel(value: string | null | undefined) {
  const key = normalizeTalepStatus(value)
  return TALEP_STATUS_OPTIONS.find(option => option.value === key)?.label ?? value ?? '-'
}

export function talepStatusAliases(key: TalepStatusKey) {
  return STATUS_ALIASES[key] ?? []
}

export function isOpenTalepStatus(value: string | null | undefined) {
  return !['completed', 'cancelled'].includes(normalizeTalepStatus(value))
}
