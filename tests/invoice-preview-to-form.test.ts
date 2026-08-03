/**
 * Kanonik ön izleme → fatura formu eşlemesi (GOREV.md §5.1).
 *
 * Ekran artık bu modülü kullanıyor; eşleme mantığı bileşenin içinde bırakılsaydı
 * bu regresyonların hiçbiri test edilemezdi.
 */

import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { parseUblInvoice } from '../src/lib/invoice-parse/ubl-tr.ts'
import {
  normalizeUnit,
  normalizeKdvRate,
  isStandardKdvRate,
  previewToFormFill,
} from '../src/lib/invoice-parse/preview-to-form.ts'
import type { InvoicePreview } from '../src/lib/invoice-parse/pipeline.ts'
import { syntheticUblInvoice } from './fixtures/ubl-synthetic.ts'

function ublPreview(xml = syntheticUblInvoice()): InvoicePreview {
  const parsed = parseUblInvoice(xml)
  assert.equal(parsed.ok, true, 'fixture UBL olarak ayrıştırılamadı')
  return {
    source: 'ubl-xml',
    selectedEntry: 'fatura.xml',
    ubl: parsed.ok ? parsed.value : null,
    pdf: null,
    confidence: 0.95,
    autoSaveAllowed: true,
    warnings: [],
  }
}

describe('Birim kodu eşlemesi', () => {
  it('UN/ECE kodlarını formun kabul ettiği birime çevirir', () => {
    assert.equal(normalizeUnit('C62'), 'adet')
    assert.equal(normalizeUnit('KGM'), 'kg')
    assert.equal(normalizeUnit('MTR'), 'm')
    assert.equal(normalizeUnit('HUR'), 'saat')
    assert.equal(normalizeUnit('SET'), 'set')
    assert.equal(normalizeUnit('PK'), 'paket')
  })

  it('büyük/küçük harf ve boşluğa duyarsızdır', () => {
    assert.equal(normalizeUnit(' kgm '), 'kg')
  })

  it('bilinmeyen ve boş kod `adet`e düşer (form yalnızca bu değerleri kabul eder)', () => {
    assert.equal(normalizeUnit('XYZ'), 'adet')
    assert.equal(normalizeUnit(null), 'adet')
    assert.equal(normalizeUnit(''), 'adet')
  })
})

describe('KDV oranı normalizasyonu', () => {
  it('standart oranları korur', () => {
    assert.equal(normalizeKdvRate(20), 20)
    assert.equal(normalizeKdvRate(0), 0)
    assert.ok(isStandardKdvRate(10))
  })

  it('standart dışı oranı EN YAKIN değere yuvarlamaz — veri kaybı olurdu', () => {
    assert.equal(normalizeKdvRate(8), 8)
    assert.equal(normalizeKdvRate(1), 1)
    assert.equal(isStandardKdvRate(8), false)
  })

  it('sayı olmayan girdi null döner', () => {
    assert.equal(normalizeKdvRate(null), null)
    assert.equal(normalizeKdvRate(Number.NaN), null)
  })
})

describe('UBL ön izlemesi → form', () => {
  it('taraflar ters yazılmaz: satıcı satıcı, alıcı alıcı kalır', () => {
    const fill = previewToFormFill(ublPreview())
    assert.equal(fill.supplier.name, 'Örnek Güvenlik Ekipmanları Ltd. Şti.')
    assert.equal(fill.supplier.taxNumber, '1000000411')
    assert.equal(fill.customer.name, 'Deneme Alıcı Anonim Şirketi')
    assert.equal(fill.customer.taxNumber, '1000002877')
  })

  it('tarih `<input type="date">` biçiminde gelir', () => {
    const fill = previewToFormFill(ublPreview())
    assert.equal(fill.invoiceDate, '2026-03-14')
    assert.match(fill.invoiceDate!, /^\d{4}-\d{2}-\d{2}$/)
  })

  it('kalem tutarları ondalık ayırıcı hatasına uğramaz (1200 ≠ 1,20)', () => {
    const fill = previewToFormFill(ublPreview())
    assert.equal(fill.lines.length, 1)
    assert.equal(fill.lines[0].quantity, 2)
    assert.equal(fill.lines[0].unitPrice, 600)
    assert.equal(fill.payableAmount, 1440)
  })

  it('ödenecek tutar kalemlerden yeniden hesaplanmaz, belgeden alınır', () => {
    // Belgede beyan edilen toplam kalemlerle uyuşmasa bile DEĞİŞTİRİLMEZ;
    // düzeltme kararı kullanıcınındır.
    const fill = previewToFormFill(ublPreview(syntheticUblInvoice({ payable: '9999.00' })))
    assert.equal(fill.payableAmount, 9999)
  })

  it('baskın KDV oranını form başlığına taşır', () => {
    const fill = previewToFormFill(ublPreview())
    assert.equal(fill.kdvRate, 20)
  })

  it('birim fiyat yoksa satır toplamından türetilir, uydurulmaz', () => {
    const xml = syntheticUblInvoice({
      lines: [
        {
          id: '1',
          name: 'Bakım',
          quantity: '4',
          unitCode: 'C62',
          unitPrice: '',
          lineTotal: '1000.00',
          kdvRate: '20',
          kdvAmount: '200.00',
        },
      ],
    })
    const fill = previewToFormFill(ublPreview(xml))
    assert.equal(fill.lines[0].unitPrice, 250)
  })

  it('standart dışı KDV oranı için uyarı üretir', () => {
    const xml = syntheticUblInvoice({
      lines: [
        {
          id: '1',
          name: 'Özel oran',
          quantity: '1',
          unitCode: 'C62',
          unitPrice: '100.00',
          lineTotal: '100.00',
          kdvRate: '8',
          kdvAmount: '8.00',
        },
      ],
    })
    const fill = previewToFormFill(ublPreview(xml))
    assert.equal(fill.lines[0].kdvRate, 8)
    assert.ok(
      fill.warnings.some(w => w.includes('standart dışı KDV')),
      `uyarı üretilmedi: ${JSON.stringify(fill.warnings)}`,
    )
  })
})

describe('PDF ön izlemesi → form', () => {
  const pdfPreview: InvoicePreview = {
    source: 'pdf-text',
    selectedEntry: 'fatura.pdf',
    ubl: null,
    pdf: {
      fatura_no: 'KKL2026000000123',
      fatura_tarihi: '2026-03-14',
      vade_tarihi: null,
      satici_adi: 'Örnek Güvenlik Ekipmanları Ltd. Şti.',
      satici_vkn: '1000000411',
      musteri_adi: 'Deneme Alıcı Anonim Şirketi',
      musteri_vkn: '1000002877',
      musteri_adresi: 'Çankaya / Ankara',
      odenecek_tutar: 1440,
      kalemler: [
        { urun_adi: 'Dolum', miktar: 2, birim: 'Adet', birim_fiyat: 600, kdv_orani: 20 },
      ],
    },
    confidence: 0.6,
    autoSaveAllowed: false,
    warnings: ['Kalemler tam parse edilemedi, manuel kontrol gerekli'],
  }

  it('alanları ve kalemleri doğru taşır', () => {
    const fill = previewToFormFill(pdfPreview)
    assert.equal(fill.invoiceNumber, 'KKL2026000000123')
    assert.equal(fill.supplier.name, 'Örnek Güvenlik Ekipmanları Ltd. Şti.')
    assert.equal(fill.customer.address, 'Çankaya / Ankara')
    assert.equal(fill.lines[0].unit, 'adet')
    assert.equal(fill.lines[0].unitPrice, 600)
  })

  it('hat uyarılarını ve otomatik kayıt yasağını korur', () => {
    const fill = previewToFormFill(pdfPreview)
    assert.equal(fill.autoSaveAllowed, false)
    assert.ok(fill.warnings.includes('Kalemler tam parse edilemedi, manuel kontrol gerekli'))
  })

  it('beklenmeyen/boş payload çökmez, boş forma düşer', () => {
    for (const payload of [null, undefined, 'metin', 42, {}]) {
      const fill = previewToFormFill({ ...pdfPreview, pdf: payload })
      assert.equal(fill.lines.length, 0)
      assert.equal(fill.invoiceNumber, null)
    }
  })
})
