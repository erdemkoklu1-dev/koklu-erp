import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { parseIncomingLayoutLines } from '@/lib/invoice-parse/incoming-layout-lines'
import { matchExistingSupplier } from '@/lib/gelen-fatura-supplier-matching'
import type { TextLine } from '@/lib/parsePdfBuffer'

const line = (items: Array<[number, string]>): TextLine => ({
  y: 0,
  text: items.map(([, value]) => value).join(' '),
  items: items.map(([x, str]) => ({ x, str })),
})

describe('gelen fatura koordinat adapterı', () => {
  test('ondalıklı KWH miktarlarını açıklamadaki sayaç değerleriyle karıştırmaz', () => {
    const items = parseIncomingLayoutLines([
      line([[30, 'No'], [174, 'Açıklama'], [344, 'Miktar'], [390, 'Birim Fiyat'], [472, 'Mal Hizmet Tutarı']]),
      line([[30, '1'], [57, 'Enerji Tüketim Bedeli (SON:14448,660 İLK:14326,772)'], [338, '121,888'], [367, 'KWH'], [396, '5,352455 TL'], [540, '652,40 TL']]),
      line([[414, 'Mal Hizmet Toplam Tutarı'], [540, '652,40 TL']]),
    ])
    assert.equal(items.length, 1)
    assert.equal(items[0].miktar, 121.888)
    assert.equal(items[0].birim, 'KWH')
    assert.equal(items[0].satir_toplam, 652.4)
  })

  test('numarasız market tablosunda kapasiteyi ürün adında korur', () => {
    const items = parseIncomingLayoutLines([
      line([[35, 'ÜRÜN AÇIKLAMASI'], [191, 'ADET'], [215, 'FİYAT'], [238, 'TUTAR']]),
      line([[34, 'YOĞURT 500 G'], [191, '1.000'], [216, '36,14'], [243, '36,14']]),
      line([[149, 'ARA TOPLAM:'], [237, '36,14']]),
    ])
    assert.equal(items.length, 1)
    assert.equal(items[0].urun_adi, 'YOĞURT 500 G')
    assert.equal(items[0].miktar, 1)
  })
})

describe('tedarikçi kimlik güvenliği', () => {
  test('geçerli kaynak VKN ile çelişen unvan benzerliği otomatik eşleşmez', () => {
    const result = matchExistingSupplier(
      [{ id: 'a', name: 'Örnek Market A.Ş.', taxNo: '1111111115' }],
      { name: 'Örnek Market A.Ş.', taxNo: '2222222222' },
    )
    assert.equal(result.method, 'none')
    assert.equal(result.supplier, undefined)
  })
})
