import type { KalemItem, TextLine } from '../parsePdfBuffer'

type Cell = { str: string; x: number }
const SUMMARY = /(?:Mal\s*\/?\s*Hizmet\s+Toplam|Ara\s+Toplam|Toplam\s+Vergi|Vergiler\s+Dahil|Ödenecek\s+Tutar)/iu
const HEADER = /(?:Ürün\s+Açıklaması|Hizmet\s*\/\s*Ürün\s+Adı|Mal\s+Hizmet|Malzeme\s*\/\s*Hizmet|Açıklama)/iu
const UNIT = /^(AD|ADET|KWH|KG|KGM|LT|LİTRE|M|MT|M2|M3|PAKET|KUTU|HİZMET|SAAT)$/iu
const fold = (value: string) => value.toLocaleUpperCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '')

function number(value: string): number | null {
  let raw = value.replace(/\s|TL|TRY|₺/giu, '').replace(/[^\d.,-]/g, '')
  if (!raw) return null
  const comma = raw.lastIndexOf(','); const dot = raw.lastIndexOf('.')
  if (comma >= 0 && dot >= 0) raw = comma > dot ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/,/g, '')
  else if (comma >= 0) raw = raw.replace(/\./g, '').replace(',', '.')
  else if ((raw.match(/\./g) ?? []).length > 1) { const p = raw.split('.'); raw = `${p.slice(0, -1).join('')}.${p.at(-1)}` }
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

function item(description: string, quantity: number, unit: string, unitPrice: number, lineTotal: number): KalemItem {
  return { urun_adi: description.replace(/\s+/g, ' ').trim(), miktar: quantity, birim: unit, birim_fiyat: unitPrice,
    iskonto_orani: 0, iskonto_tutari: 0, kdv_orani: 0, kdv_tutari: 0, satir_toplam: lineTotal }
}

function parseNumberedRow(cells: Cell[]): KalemItem | null {
  if (!/^\d{1,3}$/.test(cells[0]?.str.trim() ?? '')) return null
  const quantityCell = cells.findIndex((cell, index) => index > 0 && cell.x >= 140 && number(cell.str) !== null)
  if (quantityCell < 2) return null
  const description = cells.slice(1, quantityCell).map(cell => cell.str).join(' ').trim()
  if (!description || /Kartlı\s+Ödeme\s+Hizmetine\s+Konu\s+Toplam/iu.test(description)) return null
  const quantity = number(cells[quantityCell].str)
  if (quantity === null || quantity <= 0) return null
  const after = cells.slice(quantityCell + 1)
  const unitCell = after.find(cell => UNIT.test(cell.str.trim()))
  const monetary = after.filter(cell => /(?:TL|TRY|₺)/iu.test(cell.str) || /[.,]/.test(cell.str))
  const unitPrice = number(monetary[0]?.str ?? '') ?? 0
  const explicitTotal = number(monetary.at(-1)?.str ?? '')
  return item(description, quantity, unitCell?.str.trim() ?? 'Adet', unitPrice, explicitTotal ?? Math.round(quantity * unitPrice * 100) / 100)
}

/** Satıcıya değil kolon başlığı ve hücre tiplerine bağlı koordinat adapter'ı. */
export function parseIncomingLayoutLines(lines: TextLine[]): KalemItem[] {
  const items: KalemItem[] = []; let inTable = false; let unnumbered = false; let pendingDescription = ''
  for (const line of lines) {
    const folded = fold(line.text)
    if (!inTable && (HEADER.test(line.text) || /URUN ACIKLAMASI|HIZMET \/ URUN ADI|MAL HIZMET|ACIKLAMA/.test(folded)) && /MIKTAR|ADET|BIRIM FIYAT|FIYAT/.test(folded)) {
      inTable = true; unnumbered = /URUN ACIKLAMASI/.test(folded) && !/(?:SIRA|\bNO\b)/.test(folded); continue
    }
    if (!inTable) continue
    if (SUMMARY.test(line.text)) break
    const cells = line.items.filter(cell => cell.str.trim()).sort((a, b) => a.x - b.x)
    if (unnumbered) {
      const qtyIndex = cells.findIndex(cell => cell.x >= 150 && cell.x < 215 && number(cell.str) !== null)
      if (qtyIndex >= 1 || (qtyIndex === 0 && pendingDescription)) {
        const description = `${pendingDescription} ${cells.slice(0, qtyIndex).map(cell => cell.str).join(' ')}`.trim()
        const quantity = number(cells[qtyIndex].str); const unitPrice = number(cells[qtyIndex + 1]?.str ?? ''); const total = number(cells.at(-1)?.str ?? '')
        if (description && quantity !== null && unitPrice !== null && total !== null) { items.push(item(description, quantity, Number.isInteger(quantity) ? 'Adet' : 'KG', unitPrice, total)); pendingDescription = '' }
      } else if (cells.length === 1 && cells[0].x < 150) pendingDescription = `${pendingDescription} ${cells[0].str}`.trim()
      continue
    }
    const parsed = parseNumberedRow(cells); if (parsed) items.push(parsed)
  }
  return items
}
