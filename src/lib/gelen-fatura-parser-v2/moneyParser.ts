function normalizeDashes(value: string): string {
  return value.replace(/[\u00AD\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
}

export function parseIncomingMoney(value: unknown): number | null {
  if (value == null) return null

  let text = normalizeDashes(String(value))
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/(?:TRY|TRL|TL|\u20BA)/gi, '')
    .replace(/%/g, '')
    .replace(/\s+/g, '')
    .replace(/[^\d.,-]/g, '')

  if (!text || text === '-' || text === ',' || text === '.') return null

  const negative = text.startsWith('-')
  text = text.replace(/-/g, '')

  const dotPos = text.lastIndexOf('.')
  const commaPos = text.lastIndexOf(',')

  if (dotPos !== -1 && commaPos !== -1) {
    text = dotPos > commaPos
      ? text.replace(/,/g, '')
      : text.replace(/\./g, '').replace(',', '.')
  } else if (commaPos !== -1) {
    const parts = text.split(',')
    const last = parts[parts.length - 1]
    text = parts.length > 1 && last.length === 3 && parts.slice(0, -1).every(p => /^\d{1,3}$/.test(p))
      ? parts.join('')
      : text.replace(',', '.')
  } else if (dotPos !== -1) {
    const parts = text.split('.')
    if (parts.length > 1 && parts.slice(1).every(p => /^\d{3}$/.test(p))) {
      text = parts.join('')
    }
  }

  const parsed = Number.parseFloat(text)
  if (!Number.isFinite(parsed)) return null
  const signed = negative ? -parsed : parsed
  return Math.round(signed * 100) / 100
}
