import type { MaterialListItem, TechnicalReportType } from './types'

export function materialItem(
  raporKaynagi: TechnicalReportType,
  urunAdi: string,
  kategori: string,
  miktar: number,
  birim = 'adet',
  aciklama = ''
): MaterialListItem {
  return {
    id: crypto.randomUUID(),
    urun_adi: urunAdi,
    kategori,
    miktar: Math.max(0, Math.ceil(Number.isFinite(miktar) ? miktar : 0)),
    birim,
    aciklama,
    rapor_kaynagi: raporKaynagi,
    manuel_duzenlendi: false,
  }
}

export function mergeSameMaterials(items: MaterialListItem[]): MaterialListItem[] {
  const map = new Map<string, MaterialListItem>()
  for (const item of items) {
    const key = `${item.urun_adi}|${item.kategori}|${item.birim}`
    const existing = map.get(key)
    if (existing) {
      existing.miktar += item.miktar
      if (item.aciklama && !existing.aciklama.includes(item.aciklama)) {
        existing.aciklama = [existing.aciklama, item.aciklama].filter(Boolean).join('; ')
      }
    } else {
      map.set(key, { ...item })
    }
  }
  return [...map.values()]
}
