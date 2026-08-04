import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { normalizeIncomingProductDescription } from '@/lib/gelen-fatura-parser-v2/productNormalization'
import {
  hasNumberlessWeightPrefix,
  normalizeProductCapacity,
  sourceCapacityWasLost,
  stripLeadingRowNumber,
} from '@/lib/invoice-parse/product-capacity'

describe('ürün kapasitesi normalizasyonu', () => {
  const variants = [
    ['6 Kg KKT Yangın Söndürme Cihazı Dolumu', '6 Kg KKT Yangın Söndürme Cihazı Dolumu'],
    ['6KG KKT Yangın Söndürme Cihazı', '6 Kg KKT Yangın Söndürme Cihazı'],
    ['6 kg. KKT Yangın Söndürme Cihazı', '6 Kg KKT Yangın Söndürme Cihazı'],
    ['6 K.G. KKT Yangın Söndürme Cihazı', '6 Kg KKT Yangın Söndürme Cihazı'],
    ['6 kilogram KKT Yangın Söndürme Cihazı', '6 Kg KKT Yangın Söndürme Cihazı'],
    ['2,5 Kg CO2 Yangın Söndürme Cihazı', '2,5 Kg CO2 Yangın Söndürme Cihazı'],
    ['2.5 kg HFC-227ea Dolumu', '2.5 Kg HFC-227ea Dolumu'],
  ] as const

  for (const [input, expected] of variants) {
    it(`${input} kapasitesini korur`, () => {
      assert.equal(normalizeProductCapacity(input), expected)
      assert.equal(normalizeIncomingProductDescription(input).normalized_description, expected)
    })
  }

  const lineCases = [
    { miktar: 1, birim: 'Adet', urun: '6 Kg KKT Yangın Söndürme Cihazı Dolumu' },
    { miktar: 10, birim: 'Adet', urun: '6 Kg KKT Yangın Söndürme Cihazı Dolumu' },
    { miktar: 2, birim: 'Adet', urun: '12 KG Kuru Kimyevi Tozlu Yangın Söndürme Cihazı' },
    { miktar: 1, birim: 'Adet', urun: '5 kg CO₂ Yangın Söndürme Cihazı' },
    { miktar: 1, birim: 'Adet', urun: '70 Kg HFC-227ea Dolumu' },
  ] as const

  for (const line of lineCases) {
    it(`${line.miktar} ${line.birim} satırında kapasiteyi miktardan ayrı tutar`, () => {
      const normalized = normalizeIncomingProductDescription(line.urun).normalized_description
      assert.equal(normalized, normalizeProductCapacity(line.urun))
      assert.equal(line.miktar, line.miktar)
      assert.equal(line.birim, 'Adet')
    })
  }

  it('sıra numarası ile ürün kapasitesini birbirinden ayırır', () => {
    assert.equal(stripLeadingRowNumber('1 6 Kg KKT Yangın Söndürme Cihazı Dolumu'), '6 Kg KKT Yangın Söndürme Cihazı Dolumu')
    assert.equal(stripLeadingRowNumber('6 Kg KKT Yangın Söndürme Cihazı Dolumu'), '6 Kg KKT Yangın Söndürme Cihazı Dolumu')
    const line = { miktar: 10, birim: 'Adet', urun_adi: normalizeProductCapacity('6 Kg KKT Yangın Söndürme Cihazı Dolumu') }
    assert.deepEqual(line, { miktar: 10, birim: 'Adet', urun_adi: '6 Kg KKT Yangın Söndürme Cihazı Dolumu' })
  })

  it('ürün kodlarındaki sayıları kapasite sanmaz veya silmez', () => {
    const input = 'HFC-227ea FM-200 2x12V W3230 Dolumu'
    assert.equal(normalizeProductCapacity(input), input)
  })

  it('gerçek birimi Kg olan toplu ürüne miktarı kapasite olarak eklemez', () => {
    assert.equal(normalizeProductCapacity('ABC Kuru Kimyevi Toz'), 'ABC Kuru Kimyevi Toz')
  })

  it('kaynak kapasitesi kaybolursa sessizce başarılı saymaz', () => {
    assert.equal(sourceCapacityWasLost('6 Kg KKT Yangın Söndürme Cihazı', 'Kg KKT Yangın Söndürme Cihazı'), true)
    assert.equal(hasNumberlessWeightPrefix('Kg KKT Yangın Söndürme Cihazı'), true)
  })
})
