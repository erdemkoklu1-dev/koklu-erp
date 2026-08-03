import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { parseAmount, parseDate } from '../src/lib/parsePdfBuffer.ts'

describe('e-Arşiv PDF tarih normalizasyonu', () => {
  const cases: Array<[string, string]> = [
    ['06\u00ad07\u00ad2026', '2026-07-06'],
    ['01-07-2026', '2026-07-01'],
    ['31.07.2026', '2026-07-31'],
    ['31/07/2026', '2026-07-31'],
    ['31072026', '2026-07-31'],
  ]

  for (const [input, expected] of cases) {
    test(`${JSON.stringify(input)} → ${expected}`, () => {
      assert.equal(parseDate(input), expected)
    })
  }

  test('takvimde olmayan tarih sessizce düzeltilmez', () => {
    assert.equal(parseDate('31-02-2026'), null)
  })
})

describe('e-Arşiv PDF Türkçe para normalizasyonu', () => {
  const cases: Array<[string, number]> = [
    ['500TL', 500],
    ['2.500TL', 2500],
    ['1.416,67TL', 1416.67],
    ['11.800,18TL', 11800.18],
    ['3.400,01TL', 3400.01],
    ['1200 TL', 1200],
  ]

  for (const [input, expected] of cases) {
    test(`${input} → ${expected}`, () => {
      assert.equal(parseAmount(input), expected)
    })
  }
})
