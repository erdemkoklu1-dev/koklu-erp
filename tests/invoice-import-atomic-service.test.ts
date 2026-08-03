import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { importInvoiceAtomically } from '../src/lib/invoice-import/atomic-service.ts'

type Client = Parameters<typeof importInvoiceAtomically>[0]

function clientReturning(data: unknown, capture: (args: Record<string, unknown>) => void): Client {
  return {
    rpc: async (_name: string, args: Record<string, unknown>) => {
      capture(args)
      return { data, error: null }
    },
  } as unknown as Client
}

describe('atomic invoice import service', () => {
  it('AHMET YAHYA MÜN payload’ı ilce kolonu olmadan atomik RPC’ye gider', async () => {
    let args: Record<string, unknown> = {}
    const result = await importInvoiceAtomically(
      clientReturning({ status: 'eklendi', musteri_yeni: true, cihaz_sayisi: 1 }, value => { args = value }),
      'firma-1',
      'user-1',
      {
        fatura_no: 'KOK2026000000114',
        fatura_tarihi: '2026-07-03',
        musteri_adi: 'AHMET YAHYA MÜN',
        musteri_vkn: '11111111111',
        musteri_adresi: 'Atatürk Mahallesi No: 1',
        musteri_il: 'Erzincan',
        musteri_ilce: 'Merkez',
        sube_id: 'sube-1',
        kalemler: [{ urun_adi: 'Yangın tüpü', miktar: 1, birim: 'adet', birim_fiyat: 500, kdv_orani: 20 }],
      },
    )

    const customer = args.p_customer as Record<string, unknown>
    assert.equal(result.status, 'eklendi')
    assert.equal(Object.hasOwn(customer, 'ilce'), false)
    assert.equal(customer.il, 'Erzincan')
    assert.equal(customer.sube_id, 'sube-1')
    assert.equal(args.p_user_id, 'user-1')
    assert.equal(customer.address, 'Atatürk Mahallesi No: 1, Merkez')
  })

  it('mevcut customer id atomik çağrıya taşınır', async () => {
    let invoice: Record<string, unknown> = {}
    await importInvoiceAtomically(
      clientReturning({ status: 'eklendi', musteri_yeni: false, cihaz_sayisi: 0 }, args => {
        invoice = args.p_invoice as Record<string, unknown>
      }),
      'firma-1',
      'user-1',
      { fatura_no: 'INV-1', fatura_tarihi: null, musteri_adi: 'Mevcut Müşteri' },
      'customer-1',
    )
    assert.equal(invoice.customer_id, 'customer-1')
  })
})
