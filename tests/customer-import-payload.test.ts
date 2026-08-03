import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildCustomerImportInsert,
  preserveDistrictInAddress,
} from '../src/lib/invoice-import/customer-payload.ts'

describe('customer import canonical payload', () => {
  it('şemada olmayan ilce anahtarını göndermez; ilçe tam adreste korunur', () => {
    const payload = buildCustomerImportInsert({
      name: 'AHMET YAHYA MÜN',
      taxNumber: '11111111111',
      address: 'Atatürk Mahallesi No: 1',
      city: 'Erzincan',
      district: 'Merkez',
      branchId: 'sube-istanbul',
      firmaId: 'firma-1',
    })

    assert.equal(Object.hasOwn(payload, 'ilce'), false)
    assert.equal(payload.il, 'Erzincan')
    assert.equal(payload.sube_id, 'sube-istanbul')
    assert.equal(payload.address, 'Atatürk Mahallesi No: 1, Merkez')
    assert.equal(payload.type, 'individual')
  })

  it('şube değişikliği şehir değerini değiştirmez', () => {
    const common = { name: 'Test Müşteri', city: 'Erzincan', firmaId: 'firma-1' }
    assert.equal(buildCustomerImportInsert({ ...common, branchId: 'a' }).il, 'Erzincan')
    assert.equal(buildCustomerImportInsert({ ...common, branchId: 'b' }).il, 'Erzincan')
  })

  it('adres zaten ilçeyi içeriyorsa ikinci kez eklemez', () => {
    assert.equal(preserveDistrictInAddress('Merkez / Erzincan', 'Merkez'), 'Merkez / Erzincan')
  })
})
