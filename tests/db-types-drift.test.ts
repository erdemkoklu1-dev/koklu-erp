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

function runCheck(outFile?: string) {
  return spawnSync(process.execPath, [SCRIPT, '--check'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: outFile ? { ...process.env, KOKLU_DB_TYPES_OUT: outFile } : process.env,
  })
}

describe('db:types:check — drift kapısı', () => {
  it('generated dosya güncelken exit 0 döner', () => {
    const result = runCheck()
    assert.equal(result.status, 0, `beklenmeyen çıkış:\n${result.stdout}\n${result.stderr}`)
    assert.match(result.stdout, /OK: generated tipler güncel/)
  })

  it('bilinçli schema/type farkında non-zero döner ve anlaşılır mesaj verir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'koklu-types-'))
    const drifted = join(dir, 'database.generated.ts')
    try {
      // Commit edilmiş dosyayı bozarak "migration değişti, tip güncellenmedi"
      // durumunu simüle eder.
      const original = readFileSync(COMMITTED, 'utf8')
      writeFileSync(drifted, original.replace('export type Json', 'export type JsonDrifted'), 'utf8')

      const result = runCheck(drifted)
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
      const result = runCheck(join(dir, 'yok.ts'))
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
