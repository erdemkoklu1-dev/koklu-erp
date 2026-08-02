/**
 * Tarayıcı smoke testi ve manuel doğrulama için **SENTETİK** fatura dosyaları üretir.
 *
 * Bu script gerçek müşteri/tedarikçi verisi içermez ve içermeyecektir. Bütün
 * unvanlar uydurma, bütün VKN'ler kontrol hanesi doğru olacak şekilde
 * üretilmiştir (bkz. `tests/fixtures/ubl-synthetic.ts`).
 *
 * Üreteçler contract testleriyle **aynı** modülden gelir
 * (`tests/fixtures/synthetic-files.ts`); iki yerde ayrı fixture tutulmaz.
 *
 * Çıktı dizini `tests/fixtures/generated/` git'e alınmaz: dosyalar binary'dir ve
 * her zaman bu scriptten yeniden üretilebilir.
 *
 *   npm run fixtures:generate
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { syntheticUblInvoice } from '../tests/fixtures/ubl-synthetic.ts'
import {
  SYNTHETIC_PDF_LINES,
  syntheticPng,
  syntheticTextLayerPdf,
  syntheticZip,
} from '../tests/fixtures/synthetic-files.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'tests', 'fixtures', 'generated')

mkdirSync(OUT, { recursive: true })

const ublXml = syntheticUblInvoice()

writeFileSync(join(OUT, 'sentetik-ubl.xml'), ublXml, 'utf8')

writeFileSync(
  join(OUT, 'sentetik-ubl-paket.zip'),
  syntheticZip([{ name: 'KKL2026000000123.xml', content: Buffer.from(ublXml, 'utf8') }]),
)

writeFileSync(join(OUT, 'sentetik-metin-katmanli.pdf'), syntheticTextLayerPdf(SYNTHETIC_PDF_LINES))

// Geçerli PDF ama hiç metin yok ⇒ taranmış belge senaryosu.
writeFileSync(join(OUT, 'sentetik-taranmis.pdf'), syntheticTextLayerPdf([]))

writeFileSync(join(OUT, 'sentetik-fatura.png'), syntheticPng())

writeFileSync(join(OUT, 'desteklenmeyen.txt'), 'Bu bir fatura degildir.\n', 'utf8')

console.log(`Sentetik fixture'lar yazıldı: ${OUT}`)
