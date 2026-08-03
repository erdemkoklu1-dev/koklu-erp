import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const sql = readFileSync(new URL('../db/invoice_import_atomic_rpc.sql', import.meta.url), 'utf8')

describe('invoice import atomic SQL contract', () => {
  it('tenant + tür + normalize fatura numarası için kalıcı unique index taşır', () => {
    assert.match(sql, /unique index if not exists invoices_firma_type_number_uidx/i)
    assert.match(sql, /firma_id, invoice_type, upper\(regexp_replace\(invoice_number/i)
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
})
