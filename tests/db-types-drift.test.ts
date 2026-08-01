/**
 * Generated Supabase `Database` tipi ve schema drift kapısı (GOREV.md §11.4).
 *
 * Kanıtlanan davranışlar:
 *  - generated dosya güncelse `db:types:check` exit 0;
 *  - bilinçli olarak bozulmuş dosyada kontrol non-zero döner;
 *  - kontrol repo dosyasını SESSİZCE overwrite etmez;
 *  - çıktıda secret / project URL bulunmaz;
 *  - şema kaynağı doğrulanmamış tablolar HER çalıştırmada raporlanır.
 *
 * Uzak veritabanına bağlanmaz; kaynak repo içindeki `db/*.sql` zinciridir.
 */

import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = join(ROOT, 'scripts', 'generate-db-types.mjs')
const COMMITTED = join(ROOT, 'src', 'types', 'database.generated.ts')

function run(flag: '--check' | '--drift-only', outFile?: string) {
  return spawnSync(process.execPath, [SCRIPT, flag], {
    cwd: ROOT,
    encoding: 'utf8',
    env: outFile ? { ...process.env, KOKLU_DB_TYPES_OUT: outFile } : process.env,
  })
}

const runCheck = (outFile?: string) => run('--check', outFile)
const runDrift = (outFile?: string) => run('--drift-only', outFile)

describe('db:types:drift — drift kapısı', () => {
  it('generated dosya güncelken exit 0 döner', () => {
    const result = runDrift()
    assert.equal(result.status, 0, `beklenmeyen çıkış:\n${result.stdout}\n${result.stderr}`)
    assert.match(result.stdout, /OK: drift yok/)
  })

  it('bilinçli schema/type farkında non-zero döner ve anlaşılır mesaj verir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'koklu-types-'))
    const drifted = join(dir, 'database.generated.ts')
    try {
      // Commit edilmiş dosyayı bozarak "migration değişti, tip güncellenmedi"
      // durumunu simüle eder.
      const original = readFileSync(COMMITTED, 'utf8')
      writeFileSync(drifted, original.replace('export type Json', 'export type JsonDrifted'), 'utf8')

      const result = runDrift(drifted)
      assert.equal(result.status, 1, 'drift varsa non-zero dönmeli')
      assert.match(result.stderr, /DRIFT/)
      assert.match(result.stderr, /db:types:generate/, 'çözüm komutu gösterilmeli')

      // Kontrol hedef dosyayı DEĞİŞTİRMEMELİ.
      assert.equal(
        readFileSync(drifted, 'utf8').includes('JsonDrifted'),
        true,
        'check dosyayı sessizce overwrite etmemeli',
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('generated dosya hiç yoksa non-zero döner', () => {
    const dir = mkdtempSync(join(tmpdir(), 'koklu-types-'))
    try {
      const result = runDrift(join(dir, 'yok.ts'))
      assert.equal(result.status, 1)
      assert.match(result.stderr, /bulunamadı/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('çıktıda secret veya project URL bulunmaz', () => {
    const output = `${runCheck().stdout}${runCheck().stderr}`
    assert.equal(/supabase\.co/i.test(output), false, 'project URL yazdırılmamalı')
    assert.equal(/eyJ[A-Za-z0-9_-]{10,}/.test(output), false, 'JWT benzeri değer yazdırılmamalı')
    assert.equal(/sb_(pub|sec)_/.test(output), false, 'Supabase anahtarı yazdırılmamalı')
    assert.equal(/SERVICE_ROLE/i.test(output), false)
    assert.equal(/postgres(ql)?:\/\//i.test(output), false, 'connection string yazdırılmamalı')
  })
})

/**
 * GOREV.md §11-8: eksik canonical şemayla "tam tip güncel" sonucu VERİLEMEZ.
 *
 * Bu paket, kapının gerçekten bloklayıcı olduğunu ve eksikliğin sessizce
 * uyarıya indirgenmediğini kanıtlar. Boşluk kolon uydurularak kapatılmadığı
 * sürece bu testler kırmızıya dönmemelidir.
 */
describe('db:types:check — canonical şema tamlık kapısı', () => {
  const result = runCheck()

  it('CREATE TABLE kaynağı olmayan tablo varken non-zero döner', () => {
    assert.equal(result.status, 1, 'eksik canonical şemada exit 0 dönülmemeli')
  })

  it('blokajı ve eksik tabloları açıkça yazar', () => {
    assert.match(result.stderr, /BLOKE: canonical şema eksik/)
    for (const table of ['customers', 'devices', 'service_forms', 'service_form_items']) {
      assert.ok(result.stderr.includes(table), `${table} blokaj çıktısında görünmeli`)
    }
  })

  it('kapatma yolunu gösterir ve şema uydurmayı önerMEZ', () => {
    assert.match(result.stderr, /schema-only/)
    assert.match(result.stderr, /TAHMİN EDİLMEZ/)
  })

  it('drift kapısı ile canonical kapısı ayrı ayrı çalışabilir', () => {
    assert.equal(runDrift().status, 0, 'drift kapısı bugün yeşil olmalı')
    assert.notEqual(result.status, runDrift().status, 'iki kapı ayrı sonuç verebilmeli')
  })
})

describe('generated tipin içeriği', () => {
  const content = readFileSync(COMMITTED, 'utf8')

  it('elle düzenlenmemesi gerektiğini baş tarafta belirtir', () => {
    assert.match(content, /OTOMATİK ÜRETİLMİŞTİR — ELLE DÜZENLEMEYİN/)
    assert.match(content, /npm run db:types:generate/)
  })

  it('atomik RPC imzalarını içerir', () => {
    for (const fn of ['teslimat_update_atomic', 'invoice_update_atomic', 'aggregate_update_lines']) {
      assert.match(content, new RegExp(`${fn}: \\{`), `${fn} generated tipte bulunmalı`)
    }
  })

  it('kritik tabloları içerir', () => {
    for (const table of [
      'teslimatlar',
      'teslimat_kalemleri',
      'emanet_takipleri',
      'geri_teslim_takipleri',
      'invoices',
      'invoice_items',
      'invoice_brokers',
      'urun_stok',
      'aggregate_idempotency',
    ]) {
      assert.match(content, new RegExp(`^      ${table}: \\{`, 'm'), `${table} tablosu bulunmalı`)
    }
  })

  it('geniş `any` veya toplu type assertion ile etkisizleştirilmemiştir', () => {
    assert.equal(/:\s*any\b/.test(content), false, 'generated tipte `any` olmamalı')
    assert.equal(/as unknown as/.test(content), false)
  })

  it('FK ilişkilerini migration zincirinden yazar (gömülü sorgular için)', () => {
    // Boş `Relationships: []`, her gömülü kaynak sorgusunu
    // `SelectQueryError<"could not find the relation…">` yapıyordu.
    assert.match(content, /foreignKeyName: "teslimatlar_customer_id_fkey"/)
    assert.match(content, /referencedRelation: "customers"/)
    assert.match(content, /foreignKeyName: "teslimat_kalemleri_teslimat_id_fkey"/)
    assert.match(content, /foreignKeyName: "invoice_items_invoice_id_fkey"/)
  })

  it('1:1 ilişkiler (unique FK) isOneToOne olarak işaretlenir', () => {
    // `urun_stok.urun_id` UNIQUE ⇒ ürün başına tek bakiye satırı.
    const block = content.slice(content.indexOf('urun_stok_urun_id_fkey'))
    assert.match(block.slice(0, 200), /isOneToOne: true/)
  })

  it('var olmayan tabloya işaret eden ilişki YAZILMAZ', () => {
    // Hayalet adlar tip yüzeyinden düşürülür; onlara giden FK de düşmelidir.
    for (const phantom of ['proforma_kalemleri', 'hatirlatmalar', 'backup_history']) {
      assert.equal(
        new RegExp(`referencedRelation: "${phantom}"`).test(content),
        false,
        `${phantom} ilişki hedefi olarak yazılmamalı`,
      )
    }
  })

  it('şema kaynağı doğrulanmamış tabloları açıkça listeler', () => {
    assert.match(content, /UNRESOLVED_SCHEMA_TABLES/)
    // Denetimde kanıtlanan dört tablo (db/staging_migration_inventory.md).
    for (const table of ['customers', 'devices', 'service_forms', 'service_form_items']) {
      assert.match(content, new RegExp(`UNRESOLVED_SCHEMA_TABLES[^\\n]*${table}`))
    }
  })

  it('tenant migration listesindeki hayalet tablo adlarını raporlar', () => {
    assert.match(content, /PHANTOM_TENANT_TABLES/)
    // Denetim raporundaki S1 bulgusu (`proforma_kalemleri`) burada da yakalanmalı.
    assert.match(content, /PHANTOM_TENANT_TABLES[^\n]*proforma_kalemleri/)
  })
})

describe('generated tip belirlenimci (deterministic) üretilir', () => {
  it('aynı kaynaktan iki üretim byte-eşdeğerdir', () => {
    const first = spawnSync(process.execPath, [SCRIPT, '--stdout'], { cwd: ROOT, encoding: 'utf8' })
    const second = spawnSync(process.execPath, [SCRIPT, '--stdout'], { cwd: ROOT, encoding: 'utf8' })
    assert.equal(first.status, 0)
    assert.equal(first.stdout, second.stdout, 'üretim tekrarlanabilir olmalı')
  })
})
