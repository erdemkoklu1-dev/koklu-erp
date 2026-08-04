import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const sql = readFileSync(new URL('../db/invoice_import_atomic_rpc.sql', import.meta.url), 'utf8')

describe('invoice import atomic SQL contract', () => {
  it('tenant + tür + normalize fatura numarası için kalıcı unique index taşır', () => {
    assert.match(sql, /unique index if not exists invoices_firma_type_number_uidx/i)
    assert.match(sql, /firma_id,\s+invoice_type,\s+upper\(regexp_replace\(invoice_number/i)
    assert.match(sql, /drop constraint if exists invoices_invoice_number_key/i)
  })

  it('eşzamanlı duplicate istekleri transaction advisory lock ile serileştirir', () => {
    assert.match(sql, /pg_advisory_xact_lock/i)
  })

  it('müşteri, fatura, kalem ve cihazı aynı PL\/pgSQL çağrısında yazar', () => {
    for (const table of ['customers', 'invoices', 'invoice_items', 'devices']) {
      assert.match(sql, new RegExp(`insert into public\\.${table}`, 'i'))
    }
  })

  it('customer insert kolonlarında ilce yoktur; canonical il alanı vardır', () => {
    const customerInsert = sql.match(/insert into public\.customers[\s\S]*?returning id into v_customer_id;/i)?.[0]
    assert.ok(customerInsert)
    assert.match(customerInsert, /address, il, sube_id/)
    assert.doesNotMatch(customerInsert, /\bilce\b/i)
  })

  it('aynı VKN\/TCKN varsa yeni müşteri oluşturmadan mevcut kaydı seçer', () => {
    assert.match(sql, /from public\.customers[\s\S]*?tax_number[\s\S]*?limit 1;/i)
  })

  it('çağıranı doğrular ve tenant bilgisini kullanıcı profilinden türetir', () => {
    assert.match(sql, /auth\.uid\(\)/i)
    assert.match(sql, /from public\.kullanici_profiller/i)
    assert.match(sql, /INVOICE_IMPORT_TENANT_MISMATCH/i)
  })

  it('SECURITY DEFINER için sabit search_path ve şube sahiplik kontrolleri taşır', () => {
    assert.match(sql, /security definer\s+set search_path = pg_catalog, public/i)
    assert.match(sql, /from public\.subeler where id = v_customer_branch_id and firma_id = v_effective_firma/i)
    assert.match(sql, /from public\.subeler where id = v_invoice_branch_id and firma_id = v_effective_firma/i)
  })

  it('yalnız fatura numarası index ihlalini idempotent duplicate kabul eder', () => {
    assert.match(sql, /get stacked diagnostics v_constraint_name = constraint_name/i)
    assert.match(sql, /v_constraint_name <> 'invoices_firma_type_number_uidx'/i)
  })

  it('RPC yalnız service_role tarafından çalıştırılabilir', () => {
    assert.match(sql, /revoke all on function public\.invoice_import_atomic[\s\S]*?from public/i)
    assert.match(sql, /revoke all on function public\.invoice_import_atomic[\s\S]*?from anon/i)
    assert.match(sql, /revoke all on function public\.invoice_import_atomic[\s\S]*?from authenticated/i)
    assert.match(sql, /grant execute on function public\.invoice_import_atomic[\s\S]*?to service_role/i)
  })
})
