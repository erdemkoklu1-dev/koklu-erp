import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import AdmZip from 'adm-zip'

import { parsePdfBuffer } from '../src/lib/parsePdfBuffer.ts'

const EXPECTED: Record<string, { date: string; items: number; total: number; district: string }> = {
  KOK2026000000113: { date: '2026-07-01', items: 1, total: 600, district: 'Merkez' },
  KOK2026000000114: { date: '2026-07-03', items: 2, total: 2201.6, district: 'Merkez' },
  KOK2026000000115: { date: '2026-07-06', items: 1, total: 1700, district: 'Merkez' },
  KOK2026000000116: { date: '2026-07-08', items: 1, total: 600, district: 'Merkez' },
  KOK2026000000117: { date: '2026-07-09', items: 1, total: 600, district: 'Merkez' },
  KOK2026000000118: { date: '2026-07-09', items: 3, total: 11800.18, district: 'Merkez' },
  KOK2026000000119: { date: '2026-07-10', items: 1, total: 1700, district: 'Merkez' },
  KOK2026000000120: { date: '2026-07-10', items: 1, total: 1700, district: 'Merkez' },
  KOK2026000000121: { date: '2026-07-13', items: 1, total: 4680, district: 'Üzümlü' },
  KOK2026000000122: { date: '2026-07-14', items: 1, total: 600, district: 'Merkez' },
  KOK2026000000123: { date: '2026-07-20', items: 1, total: 600, district: 'Merkez' },
  KOK2026000000124: { date: '2026-07-22', items: 2, total: 1000.8, district: 'Merkez' },
  KOK2026000000125: { date: '2026-07-23', items: 1, total: 1700, district: 'Üzümlü' },
  KOK2026000000126: { date: '2026-07-27', items: 1, total: 3400.01, district: 'Merkez' },
  KOK2026000000127: { date: '2026-07-28', items: 3, total: 13200, district: 'Merkez' },
  KOK2026000000128: { date: '2026-07-28', items: 1, total: 600, district: 'Merkez' },
  KOK2026000000129: { date: '2026-07-30', items: 1, total: 600, district: 'Merkez' },
  KOK2026000000130: { date: '2026-07-31', items: 1, total: 700, district: 'İliç' },
  KOK2026000000131: { date: '2026-07-31', items: 1, total: 600, district: 'Merkez' },
  KOK2026000000132: { date: '2026-07-31', items: 1, total: 1200, district: 'Merkez' },
}

const archivePath = path.resolve(process.argv[2] ?? 'tests/private-fixtures/GidenArşivTemmuz.zip')

function invoiceNoFrom(name: string): string | null {
  return name.match(/KOK\d{13}/)?.[0] ?? null
}

function summarize(value: unknown): string {
  if (value == null || value === '') return '<boş>'
  if (Array.isArray(value)) return `adet=${value.length}`
  return String(value)
}

if (!fs.existsSync(archivePath)) {
  console.error(`Private arşiv bulunamadı: ${archivePath}`)
  process.exit(2)
}

const entries = new AdmZip(archivePath).getEntries().filter(entry => !entry.isDirectory && /\.pdf$/i.test(entry.entryName))
const failures: string[] = []
const rows: Array<Record<string, string | number>> = []

if (entries.length !== 20) failures.push(`arşiv.pdfSayısı beklenen=20 gerçek=${entries.length}`)

for (const entry of entries) {
  const invoiceNo = invoiceNoFrom(entry.entryName)
  if (!invoiceNo || !EXPECTED[invoiceNo]) {
    failures.push(`bilinmeyen entry=${path.basename(entry.entryName)}`)
    continue
  }
  const parsed = await parsePdfBuffer(entry.getData(), entry.entryName, 'satis')
  const expected = EXPECTED[invoiceNo]
  const checks: Array<[string, unknown, unknown, boolean]> = [
    ['faturaNo', invoiceNo, parsed.fatura_no, parsed.fatura_no === invoiceNo],
    ['tarih', expected.date, parsed.fatura_tarihi, parsed.fatura_tarihi === expected.date],
    ['müşteri', 'dolu', parsed.musteri_adi, Boolean(parsed.musteri_adi)],
    ['vergiKimliği', 'dolu', parsed.musteri_vkn, Boolean(parsed.musteri_vkn)],
    ['adres', 'dolu', parsed.musteri_adresi, Boolean(parsed.musteri_adresi)],
    ['şehir', 'Erzincan', parsed.musteri_il, parsed.musteri_il === 'Erzincan'],
    ['ilçe', expected.district, parsed.musteri_ilce, parsed.musteri_ilce === expected.district],
    ['kalem', expected.items, parsed.kalemler.length, parsed.kalemler.length === expected.items],
    ['toplam', expected.total, parsed.odenecek_tutar, Math.abs((parsed.odenecek_tutar ?? NaN) - expected.total) < 0.005],
  ]
  for (const [field, expectedValue, actualValue, ok] of checks) {
    if (!ok) failures.push(`${invoiceNo}.${field} beklenen=${summarize(expectedValue)} gerçek=${summarize(actualValue)}`)
  }
  rows.push({
    fatura: invoiceNo,
    tarih: parsed.fatura_tarihi ?? '—',
    müşteri: parsed.musteri_adi ? 'DOLU' : 'BOŞ',
    adres: parsed.musteri_adresi ? 'DOLU' : 'BOŞ',
    şehir: parsed.musteri_il ?? '—',
    ilçe: parsed.musteri_ilce ?? '—',
    kalem: parsed.kalemler.length,
    toplam: parsed.odenecek_tutar ?? '—',
    kaynak: 'pdf_text_layout',
    hata: parsed.hata ? 'VAR' : 'YOK',
  })
}

rows.sort((a, b) => String(a.fatura).localeCompare(String(b.fatura)))
console.table(rows)
console.log(`PRIVATE_JULY_SUMMARY invoices=${rows.length}/20 failures=${failures.length} ai=0 ocr=0`)
if (failures.length) {
  for (const failure of failures) console.error(`MISMATCH ${failure}`)
  process.exit(1)
}
