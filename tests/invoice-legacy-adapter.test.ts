/**
 * Eski parse route'larının kanonik hatta delege edilmesi — sözleşme testleri.
 *
 * Kanıtlanan davranışlar (GOREV.md §12):
 *  - AI **birincil kaynak değildir**: deterministik olarak dolmuş hiçbir alanı ezemez;
 *  - AI hatayı temizleyemez ve güven skorunu yükseltemez;
 *  - AI dokunduğu sonucu `manuel_kontrol_gerekli` yapar ve hangi alanlara
 *    dokunduğunu açıkça yazar;
 *  - UBL-XML çıktısı `temiz_parse` iddiasını yalnızca tutarsızlık YOKKEN taşır;
 *  - düzenleyen/alıcı taraflar ters yazılmaz;
 *  - arşivde XML'ler PDF'lerden önce ve OS artıkları elenmiş şekilde sıralanır.
 *
 * Fixture sınıfı: **synthetic** (`tests/fixtures/ubl-synthetic.ts`).
 */

import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import { parseUblInvoice } from '../src/lib/invoice-parse/ubl-tr.ts'
import {
  mergeAiGaps,
  tagPdfResult,
  ublToParseResult,
  type LegacyParseResult,
} from '../src/lib/invoice-parse/legacy-adapter.ts'
import { listInvoiceEntries, type ArchiveEntryInfo } from '../src/lib/invoice-parse/archive.ts'
import { SYNTHETIC_VKN, syntheticUblInvoice } from './fixtures/ubl-synthetic.ts'

function ubl(xml = syntheticUblInvoice(), mode: 'satis' | 'gelen' = 'gelen'): LegacyParseResult {
  const parsed = parseUblInvoice(xml)
  assert.equal(parsed.ok, true)
  if (!parsed.ok) throw new Error('unreachable')
  return ublToParseResult(parsed.value, 'fatura.xml', mode)
}

describe('UBL → eski ParseResult adapter', () => {
  it('zorunlu alanları taşır', () => {
    const result = ubl()
    assert.equal(result.fatura_no, 'KKL2026000000123')
    assert.equal(result.fatura_tarihi, '2026-03-14')
    assert.equal(result.senaryo, 'TICARIFATURA')
    assert.equal(result.mal_hizmet_toplami, 1200)
    assert.equal(result.kdv_tutari, 240)
    assert.equal(result.odenecek_tutar, 1440)
    assert.equal(result.kalemler.length, 1)
    assert.equal(result.parse_kaynagi, 'ubl-xml')
  })

  it('gelen modda düzenleyen satici_*, alıcı musteri_* alanına yazılır', () => {
    const result = ubl(syntheticUblInvoice(), 'gelen')
    assert.equal(result.satici_vkn, SYNTHETIC_VKN.supplier)
    assert.equal(result.musteri_vkn, SYNTHETIC_VKN.customer)
    assert.notEqual(result.satici_vkn, result.musteri_vkn)
  })

  it('satis modda karşı taraf müşteridir', () => {
    const result = ubl(syntheticUblInvoice(), 'satis')
    assert.equal(result.musteri_vkn, SYNTHETIC_VKN.customer)
    assert.equal(result.satici_vkn, undefined)
  })

  it('tutarsızlık varsa temiz_parse İDDİA EDİLMEZ', () => {
    const clean = ubl()
    assert.equal(clean.parse_durumu, 'temiz_parse')

    const mismatched = ubl(syntheticUblInvoice({ payable: '9999.00' }))
    assert.equal(mismatched.parse_durumu, 'manuel_kontrol_gerekli')
    assert.ok((mismatched.parse_uyarilari ?? []).length > 0)
    assert.ok((mismatched.parse_guven ?? 1) < (clean.parse_guven ?? 0))
  })

  it('Türkçe karakterler kalem açıklamasında korunur', () => {
    assert.equal(ubl().kalemler[0].urun_adi, 'Yangın Söndürme Tüpü 6 kg — dolum ücreti')
  })
})

describe('AI yalnızca BOŞLUK doldurucudur', () => {
  const deterministik: LegacyParseResult = {
    filename: 'f.pdf',
    fatura_no: 'GERCEK-123',
    fatura_tarihi: '2026-03-14',
    vade_tarihi: null,
    senaryo: null,
    musteri_adi: 'Gerçek Müşteri A.Ş.',
    musteri_vkn: null,
    musteri_adresi: null,
    mal_hizmet_toplami: 1000,
    kdv_matrahi: 1000,
    kdv_tutari: null,
    vergiler_dahil_toplam: null,
    odenecek_tutar: 1200,
    kalemler: [
      {
        urun_adi: 'Deterministik kalem', miktar: 1, birim: 'Adet', birim_fiyat: 1000,
        iskonto_orani: 0, iskonto_tutari: 0, kdv_orani: 20, kdv_tutari: 200, satir_toplam: 1000,
      },
    ] as LegacyParseResult['kalemler'],
    banka_bilgileri: [],
    hata: 'Tedarikçi adresi okunamadı',
    parse_durumu: 'manuel_kontrol_gerekli',
    parse_uyarilari: ['adres eksik'],
    parse_kaynagi: 'pdf-text',
    parse_guven: 0.75,
  }

  it('dolu alanı EZMEZ', () => {
    const merged = mergeAiGaps(deterministik, {
      fatura_no: 'AI-UYDURDU',
      musteri_adi: 'AI Müşterisi',
      odenecek_tutar: 99999,
    })
    assert.equal(merged.fatura_no, 'GERCEK-123')
    assert.equal(merged.musteri_adi, 'Gerçek Müşteri A.Ş.')
    assert.equal(merged.odenecek_tutar, 1200)
  })

  it('yalnızca boş alanı doldurur', () => {
    const merged = mergeAiGaps(deterministik, { musteri_vkn: '1000000411', kdv_tutari: 200 })
    assert.equal(merged.musteri_vkn, '1000000411')
    assert.equal(merged.kdv_tutari, 200)
  })

  it('hatayı ASLA temizlemez', () => {
    const merged = mergeAiGaps(deterministik, { musteri_vkn: '1000000411' })
    assert.equal(merged.hata, 'Tedarikçi adresi okunamadı')
  })

  it('güven skorunu YÜKSELTMEZ ve manuel kontrole düşürür', () => {
    const merged = mergeAiGaps(deterministik, { musteri_vkn: '1000000411' })
    assert.ok((merged.parse_guven ?? 1) <= 0.5)
    assert.equal(merged.parse_durumu, 'manuel_kontrol_gerekli')
    assert.equal(merged.parse_kaynagi, 'ai-destekli')
  })

  it('hangi alanlara dokunduğunu açıkça yazar', () => {
    const merged = mergeAiGaps(deterministik, { musteri_vkn: '1000000411' })
    const uyari = (merged.parse_uyarilari ?? []).join(' ')
    assert.match(uyari, /yapay zekâ/i)
    assert.match(uyari, /musteri_vkn/)
  })

  it('kalem varsa AI kalemlerini EKLEMEZ', () => {
    const merged = mergeAiGaps(deterministik, {
      kalemler: [
        {
          urun_adi: 'AI kalemi', miktar: 5, birim: 'Adet', birim_fiyat: 1,
          iskonto_orani: 0, iskonto_tutari: 0, kdv_orani: 20, kdv_tutari: 1, satir_toplam: 5,
        },
      ] as LegacyParseResult['kalemler'],
    })
    assert.equal(merged.kalemler.length, 1)
    assert.equal(merged.kalemler[0].urun_adi, 'Deterministik kalem')
  })

  it('hiç kalem yoksa AI kalemleri eklenebilir ama sonuç doğrulanmamış sayılır', () => {
    const bos = { ...deterministik, kalemler: [] as LegacyParseResult['kalemler'] }
    const merged = mergeAiGaps(bos, {
      kalemler: [
        {
          urun_adi: 'AI kalemi', miktar: 5, birim: 'Adet', birim_fiyat: 1,
          iskonto_orani: 0, iskonto_tutari: 0, kdv_orani: 20, kdv_tutari: 1, satir_toplam: 5,
        },
      ] as LegacyParseResult['kalemler'],
    })
    assert.equal(merged.kalemler.length, 1)
    assert.equal(merged.parse_durumu, 'manuel_kontrol_gerekli')
  })

  it('AI hiçbir şey döndürmezse sonuç DEĞİŞMEZ', () => {
    assert.equal(mergeAiGaps(deterministik, null), deterministik)
    assert.equal(mergeAiGaps(deterministik, {}), deterministik)
    assert.equal(mergeAiGaps(deterministik, { fatura_no: 'AI' }), deterministik)
  })

  it('girdiyi mutasyona uğratmaz', () => {
    const snapshot = JSON.stringify(deterministik)
    mergeAiGaps(deterministik, { musteri_vkn: '1000000411' })
    assert.equal(JSON.stringify(deterministik), snapshot)
  })
})

describe('PDF sonucu etiketleme', () => {
  const base = {
    filename: 'f.pdf', fatura_no: 'X', fatura_tarihi: '2026-01-01', vade_tarihi: null,
    senaryo: null, musteri_adi: null, musteri_vkn: null, musteri_adresi: null,
    mal_hizmet_toplami: null, kdv_matrahi: null, kdv_tutari: null,
    vergiler_dahil_toplam: null, odenecek_tutar: null, kalemler: [],
    banka_bilgileri: [], hata: null,
  }

  it('uyarısız sonuç daha yüksek, hatalı sonuç en düşük güven alır', () => {
    const clean = tagPdfResult({ ...base, parse_durumu: 'temiz_parse', parse_uyarilari: [] })
    const warned = tagPdfResult({ ...base, parse_durumu: 'manuel_kontrol_gerekli', parse_uyarilari: ['x'] })
    const failed = tagPdfResult({ ...base, parse_durumu: 'parse_hatasi', parse_uyarilari: [] })

    assert.equal(clean.parse_kaynagi, 'pdf-text')
    assert.ok((clean.parse_guven ?? 0) > (warned.parse_guven ?? 0))
    assert.ok((warned.parse_guven ?? 0) > (failed.parse_guven ?? 0))
  })

  it('PDF metin katmanı hiçbir zaman UBL kadar güvenilir sayılmaz', () => {
    const pdf = tagPdfResult({ ...base, parse_durumu: 'temiz_parse', parse_uyarilari: [] })
    assert.ok((pdf.parse_guven ?? 0) < (ubl().parse_guven ?? 0))
  })
})

describe('arşiv toplu listeleme', () => {
  const e = (name: string, isDirectory = false): ArchiveEntryInfo => ({
    name, size: 100, compressedSize: 50, isDirectory,
  })

  it('XML’ler PDF’lerden ÖNCE gelir', () => {
    const names = listInvoiceEntries([e('b.pdf'), e('a.pdf'), e('z.xml'), e('y.xml')]).map(x => x.name)
    assert.deepEqual(names, ['y.xml', 'z.xml', 'a.pdf', 'b.pdf'])
  })

  it('OS artıkları ve görüntüleme şablonları elenir', () => {
    const names = listInvoiceEntries([
      e('__MACOSX/._fatura.xml'), e('.DS_Store'), e('Thumbs.db'),
      e('gorunum.xslt'), e('klasor/', true), e('fatura.xml'),
    ]).map(x => x.name)
    assert.deepEqual(names, ['fatura.xml'])
  })

  it('güvenli olmayan adlar elenir', () => {
    assert.deepEqual(listInvoiceEntries([e('../kotu.xml'), e('/mutlak.xml'), e('iyi.xml')]).map(x => x.name), ['iyi.xml'])
  })

  it('bir ZIP içindeki çok sayıda fatura hepsi listelenir (toplu içe aktarma)', () => {
    const entries = Array.from({ length: 12 }, (_, i) => e(`fatura-${String(i).padStart(2, '0')}.pdf`))
    assert.equal(listInvoiceEntries(entries).length, 12)
  })
})
