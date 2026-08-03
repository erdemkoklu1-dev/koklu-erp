/**
 * Fatura kalemi sahipliği regresyonları (GOREV.md §11.3).
 *
 * Kök neden: `invoice_items` silme/güncelleme yalnızca `eq('id', ...)` ile
 * yapılıyordu; başka faturaya ait bir kalem kimliği gönderilirse o satır
 * siliniyordu (denetim raporu §2.5 / R6).
 *
 * Bu testler kimlik doğrulama katmanını kanıtlar. Gerçek transaction/rollback
 * davranışı `db/invoice_atomic_update_rpc.sql` içindedir ve staging PASS
 * beklemektedir (bkz. tests/README-integration.md).
 */

import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import {
  INVOICE_ERROR,
  computeItemsSubtotal,
  mapInvoiceRpcError,
  planInvoiceLines,
  totalsMatch,
} from '../src/lib/invoice/invoice-update.ts'

// Bu faturaya ait kalemler
const OWN_ITEMS = ['item-1', 'item-2', 'item-3']
const OWN_BROKERS = ['broker-1']
// BAŞKA faturaya (ve/veya başka tenant'a) ait kalem
const FOREIGN_ITEM = 'baska-faturanin-kalemi'
const FOREIGN_BROKER = 'baska-faturanin-aracisi'

const itemFields = (description = 'Yangın tüpü dolumu', quantity = 1, unit_price = 100) => ({
  description,
  quantity,
  unit: 'adet',
  unit_price,
  kdv_rate: 20,
})

function expectError(result: ReturnType<typeof planInvoiceLines>, code: string) {
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.error.code, code)
}

describe('Yabancı fatura kalemi reddi', () => {
  it('başka faturaya ait item ID ile UPDATE reddedilir', () => {
    expectError(
      planInvoiceLines(OWN_ITEMS, OWN_BROKERS, {
        items: [{ id: FOREIGN_ITEM, fields: itemFields() }],
      }),
      INVOICE_ERROR.FOREIGN_LINE_ID,
    )
  })

  it('başka faturaya ait item ID ile DELETE reddedilir', () => {
    expectError(
      planInvoiceLines(OWN_ITEMS, OWN_BROKERS, { deleteItemIds: [FOREIGN_ITEM] }),
      INVOICE_ERROR.FOREIGN_LINE_ID,
    )
  })

  it('kendi kalemleriyle karışık gönderilen yabancı ID de reddedilir', () => {
    expectError(
      planInvoiceLines(OWN_ITEMS, OWN_BROKERS, {
        items: [
          { id: 'item-1', fields: itemFields() },
          { id: FOREIGN_ITEM, fields: itemFields() },
        ],
      }),
      INVOICE_ERROR.FOREIGN_LINE_ID,
    )
  })

  it('başka faturaya ait aracı kimliği reddedilir (update ve delete)', () => {
    expectError(
      planInvoiceLines(OWN_ITEMS, OWN_BROKERS, {
        brokers: [{ id: FOREIGN_BROKER, fields: { commission_rate: 5, commission_amount: 50 } }],
      }),
      INVOICE_ERROR.FOREIGN_BROKER_ID,
    )
    expectError(
      planInvoiceLines(OWN_ITEMS, OWN_BROKERS, { deleteBrokerIds: [FOREIGN_BROKER] }),
      INVOICE_ERROR.FOREIGN_BROKER_ID,
    )
  })

  it('tenant sınırı aşılamaz: mevcut kimlik listesi yalnızca bu faturadan gelir', () => {
    // Başka tenant'ın faturasını düzenlemeye çalışan istek için mevcut kalem
    // listesi BOŞ döner (invoice_id eşleşmez) ⇒ her kimlik yabancıdır.
    expectError(
      planInvoiceLines([], [], { items: [{ id: 'item-1', fields: itemFields() }] }),
      INVOICE_ERROR.FOREIGN_LINE_ID,
    )
  })
})

describe('Doğru id + invoice_id çifti', () => {
  it('yalnızca hedef satırı değiştirir, diğerlerini korumaz-silmez', () => {
    const result = planInvoiceLines(OWN_ITEMS, OWN_BROKERS, {
      items: [
        { id: 'item-1', fields: itemFields('Güncellendi', 2, 250) },
        { id: 'item-2', fields: itemFields() },
        { id: 'item-3', fields: itemFields() },
      ],
    })
    assert.equal(result.ok, true)
    if (!result.ok) return

    assert.deepEqual(result.value.deleteItemIds, [], 'hiçbir kalem silinmemeli')
    assert.equal(result.value.resultingItemCount, 3)
  })

  it('açık silme YALNIZCA seçilen kalemi siler', () => {
    const result = planInvoiceLines(OWN_ITEMS, OWN_BROKERS, { deleteItemIds: ['item-2'] })
    assert.equal(result.ok, true)
    if (!result.ok) return

    assert.deepEqual(result.value.deleteItemIds, ['item-2'])
    assert.equal(result.value.resultingItemCount, 2)
  })
})

describe('Eksik payload koruması', () => {
  it('kalem alanı yoksa mevcut kalemler korunur', () => {
    const result = planInvoiceLines(OWN_ITEMS, OWN_BROKERS, {})
    assert.equal(result.ok, true)
    if (!result.ok) return

    assert.equal(result.value.items, null, 'kalemlere dokunulmaz')
    assert.deepEqual(result.value.deleteItemIds, [])
    assert.equal(result.value.itemsUntouched, true)
    assert.equal(result.value.resultingItemCount, 3)
  })

  it('boş kalem listesi açık onay olmadan reddedilir', () => {
    expectError(
      planInvoiceLines(OWN_ITEMS, OWN_BROKERS, { items: [] }),
      INVOICE_ERROR.EMPTY_LINES_NOT_CONFIRMED,
    )
  })

  it('açık onayla boş liste kabul edilir', () => {
    const result = planInvoiceLines(OWN_ITEMS, OWN_BROKERS, {
      items: [],
      confirmDeleteAllLines: true,
    })
    assert.equal(result.ok, true)
  })

  it('aynı kalem iki kez gönderilirse reddedilir', () => {
    expectError(
      planInvoiceLines(OWN_ITEMS, OWN_BROKERS, {
        items: [
          { id: 'item-1', fields: itemFields() },
          { id: 'item-1', fields: itemFields() },
        ],
      }),
      INVOICE_ERROR.DUPLICATE_LINE_ID,
    )
  })

  it('bir kalem hem güncellenip hem silinemez', () => {
    expectError(
      planInvoiceLines(OWN_ITEMS, OWN_BROKERS, {
        items: [{ id: 'item-1', fields: itemFields() }],
        deleteItemIds: ['item-1'],
      }),
      INVOICE_ERROR.INVALID_PAYLOAD,
    )
  })
})

describe('Toplam tutarlılığı (mevcut iş kuralına göre)', () => {
  it('kalemlerden hesaplanan ara toplam kuruş bazlı doğrudur', () => {
    const subtotal = computeItemsSubtotal([
      { quantity: 3, unit_price: 33.33 },
      { quantity: 1, unit_price: 0.01 },
    ])
    assert.equal(subtotal, 100.0)
  })

  it('kayan nokta birikimi kuruş bazlı toplamada hata üretmez', () => {
    const subtotal = computeItemsSubtotal(Array.from({ length: 10 }, () => ({ quantity: 1, unit_price: 0.1 })))
    assert.equal(subtotal, 1)
  })

  it('beyan edilen toplam ile kalem toplamı tolerans içindeyse uyumlu sayılır', () => {
    assert.equal(totalsMatch(100.0, 100.01), true, '1 kuruş yuvarlama farkı kabul edilir')
    assert.equal(totalsMatch(100.0, 100.05), false, '5 kuruş sapma uyumsuzdur')
  })
})

describe('mapInvoiceRpcError — hata sözleşmesi', () => {
  it('RPC apply edilmemişse RPC_MISSING döner', () => {
    assert.equal(
      mapInvoiceRpcError({ code: 'PGRST202', message: 'Could not find the function public.invoice_update_atomic' }).code,
      INVOICE_ERROR.RPC_MISSING,
    )
  })

  it('yabancı kalem hatası stabil kodla eşlenir', () => {
    assert.equal(
      mapInvoiceRpcError({ message: 'INVOICE_FOREIGN_LINE_ID: 8f3e...' }).code,
      INVOICE_ERROR.FOREIGN_LINE_ID,
    )
  })

  it('eşzamanlılık çakışması kullanıcıya anlaşılır mesajla döner', () => {
    const mapped = mapInvoiceRpcError({ message: 'INVOICE_STALE_WRITE' })
    assert.equal(mapped.code, INVOICE_ERROR.STALE_WRITE)
    assert.match(mapped.message, /başka bir oturumda güncellendi/)
  })

  it('bilinmeyen hata ham veritabanı mesajını SIZDIRMAZ', () => {
    const mapped = mapInvoiceRpcError({
      code: '23503',
      message: 'insert or update on table "invoice_items" violates foreign key constraint "fk_secret"',
    })
    assert.equal(mapped.message.includes('fk_secret'), false)
  })
})
