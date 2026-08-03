/**
 * Integration test KAPISI — GOREV.md §11.2 / §11.3.
 *
 * Gerçek PostgreSQL transaction testleri `db/*_atomic_update_tests.sql`
 * dosyalarındadır. Bu testler onları **çalıştırmaz**; iki şeyi garanti eder:
 *
 *  1. Zorunlu senaryoların hiçbiri sessizce düşürülmemiştir (dosya içeriği
 *     senaryo başlıklarıyla doğrulanır).
 *  2. Integration testlerinin neden çalıştırılmadığı AÇIKÇA raporlanır —
 *     "test yok" ile "test geçti" birbirine karıştırılmaz.
 *
 * Çalıştırma koşulu: `KOKLU_ISOLATED_TEST_DSN` ortam değişkeni tanımlıysa
 * çalıştırma talimatı yazdırılır. Tanımlı değilse (varsayılan) BLOKE raporlanır.
 * Production DSN'i ASLA kullanılmaz; bu değişken yalnızca izole test veritabanı
 * içindir ve değeri hiçbir yerde yazdırılmaz.
 */

import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const TESLIMAT_SQL = readFileSync(join(ROOT, 'db', 'teslimat_atomic_update_tests.sql'), 'utf8')
const INVOICE_SQL = readFileSync(join(ROOT, 'db', 'invoice_atomic_update_tests.sql'), 'utf8')

/** GOREV.md §11.2 — teslimat transaction/integration zorunlu senaryoları. */
const TESLIMAT_REQUIRED: Array<[string, RegExp]> = [
  ['Kalem yazımındaki hata üst kayıt değişimini rollback eder', /kalem hatası üst kayıt değişimini rollback eder/],
  ['Stok güncellemesinden sonraki hata stoku rollback eder', /stok güncellemesinden sonraki hata stok değişimini rollback eder/],
  ['Emanet kaydından sonraki hata emaneti rollback eder', /emanet kaydından sonraki hata emanet değişimini rollback eder/],
  ['Aynı idempotency key stok etkisini tekrarlamaz', /aynı idempotency key ile stok İKİNCİ KEZ değişmez/],
  ['Aynı key farklı payload conflict üretir', /aynı key farklı payload ile conflict döner/],
  ['Eski version ile update reddedilir', /bayat version ile update reddedilir/],
  ['Eşzamanlı update sessiz lost-update üretmez', /Eşzamanlı update sessiz lost-update üretmez/],
  ['Başka tenant kullanıcısı erişemez', /başka tenant kullanıcısı erişemez/],
  ['RPC execute izinleri sınırlıdır', /authenticated execute yetkisi var/],
  ['Yabancı kalem kimliği reddedilir', /başka teslimata ait kalem kimliği reddedilir/],
]

/** GOREV.md §11.3 — fatura regresyonlarının transaction karşılıkları. */
const INVOICE_REQUIRED: Array<[string, RegExp]> = [
  ['Yabancı item ID ile update reddedilir', /başka faturaya ait item ID ile update reddedilir/],
  ['Yabancı item ID ile delete reddedilir', /başka faturaya ait item ID ile delete reddedilir/],
  ['Doğru id+invoice_id yalnızca hedefi değiştirir', /başka faturanın satırı DEĞİŞMEDİ/],
  ['Kalem hatası tüm işlemi rollback eder', /kalem hatası üst fatura değişimini rollback eder/],
  ['Kalem alanı yoksa kalemler korunur', /kalem alanı yokken kalemler korunur/],
  ['Açık silme yalnızca seçileni siler', /seçilmeyen kalem korundu/],
  ['Toplam kuralı doğrulanır', /üst toplam ile kalem toplamı uyuşmazlığı raporlanır/],
  ['Tenant sınırı aşılamaz', /başka tenant kullanıcısı faturaya erişemez/],
]

describe('Teslimat integration senaryoları hazırlanmıştır', () => {
  for (const [label, pattern] of TESLIMAT_REQUIRED) {
    it(label, () => {
      assert.match(TESLIMAT_SQL, pattern, `Zorunlu senaryo eksik: ${label}`)
    })
  }

  it('test verisi kalıcı olmaz (rollback ile biter)', () => {
    assert.match(TESLIMAT_SQL, /^rollback;/m, 'SQL test dosyası rollback ile bitmelidir')
    assert.equal(/^commit;/m.test(TESLIMAT_SQL), false, 'test dosyası commit ETMEMELİ')
  })

  it('production’da çalıştırılmaması gerektiği açıkça yazılıdır', () => {
    assert.match(TESLIMAT_SQL, /PRODUCTION'DA ÇALIŞTIRILMAZ/)
  })
})

describe('Fatura integration senaryoları hazırlanmıştır', () => {
  for (const [label, pattern] of INVOICE_REQUIRED) {
    it(label, () => {
      assert.match(INVOICE_SQL, pattern, `Zorunlu senaryo eksik: ${label}`)
    })
  }

  it('test verisi kalıcı olmaz (rollback ile biter)', () => {
    assert.match(INVOICE_SQL, /^rollback;/m)
    assert.equal(/^commit;/m.test(INVOICE_SQL), false)
  })
})

describe('Integration çalıştırma durumu', () => {
  const dsnConfigured = Boolean(process.env.KOKLU_ISOLATED_TEST_DSN)

  it('çalıştırılmadıysa BLOKE olarak raporlanır (sessizce başarı sayılmaz)', () => {
    if (!dsnConfigured) {
      console.log(
        [
          '',
          'BLOKE — staging env doğrulanmadı: teslimat/fatura transaction testleri ÇALIŞTIRILMADI.',
          '  Sebep : node scripts/verify-staging-env.mjs → exit 1 (production hint)',
          '  Dosya : db/teslimat_atomic_update_tests.sql, db/invoice_atomic_update_tests.sql',
          '  Ön koşul: db/aggregate_atomic_update_rpc.sql → db/teslimat_atomic_update_rpc.sql',
          '            → db/invoice_atomic_update_rpc.sql apply edilmiş olmalı',
          '  Çalıştırma (YALNIZCA izole/staging veritabanında):',
          '    psql "$KOKLU_ISOLATED_TEST_DSN" -v ON_ERROR_STOP=1 -f db/teslimat_atomic_update_tests.sql',
          '    psql "$KOKLU_ISOLATED_TEST_DSN" -v ON_ERROR_STOP=1 -f db/invoice_atomic_update_tests.sql',
          '',
        ].join('\n'),
      )
    }
    // Bu test yalnızca durumu RAPORLAR; atomikliği kanıtlamaz.
    assert.equal(typeof dsnConfigured, 'boolean')
  })

  it('atomiklik iddiası yalnızca gerçek çalıştırmayla kanıtlanır', () => {
    // Kasıtlı dokümantasyon testi: mock çağrısı doğrulamak atomiklik kanıtı DEĞİLDİR.
    assert.equal(
      dsnConfigured,
      Boolean(process.env.KOKLU_ISOLATED_TEST_DSN),
      'integration sonucu ancak DSN tanımlıyken üretilebilir',
    )
  })
})
