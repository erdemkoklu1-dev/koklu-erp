function normalizeDateText(value: string): string {
  return value
    .replace(/[\u00AD\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
}

export function parseIncomingDate(value: unknown): string | null {
  if (!value) return null
  const text = normalizeDateText(String(value))
  const match = text.match(/(\d{1,2})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{4})/)
  if (match) {
    return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
  }
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)
  return iso ? iso[0] : null
}

export function findIncomingDateByLabels(text: string, labels: RegExp[]): string | null {
  const normalized = normalizeDateText(text)
  for (const label of labels) {
    const match = normalized.match(label)
    if (!match || match.index == null) continue
    const near = normalized.slice(match.index + match[0].length, match.index + match[0].length + 180)
    const parsed = parseIncomingDate(near)
    if (parsed) return parsed
  }
  return null
}
