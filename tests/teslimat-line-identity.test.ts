/**
 * Teslimat kalem kimliği ve silme niyeti sözleşmesi (GOREV.md §11.1).
 *
 * Kanıtlanan davranışlar:
 *  - kalem alanı yoksa mevcut kalemler korunur;
 *  - açık silme yalnızca seçilen kalemi etkiler;
 *  - boş liste açık onay olmadan reddedilir;
 *  - BAŞKA teslimata ait kalem kimliği reddedilir.
 */

import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import {
  TESLIMAT_ERROR,
  mapRpcError,
  planTeslimatLines,
  type ExistingTeslimatKalem,
} from '../src/lib/teslimat/teslimat-update.ts'

const existing: ExistingTeslimatKalem[] = [
  { id: 'a', urun_id: 'u1', miktar: 2, stoktan_duser_mi: true },
  { id: 'b', urun_id: 'u2', miktar: 1, stoktan_duser_mi: true },
  { id: 'c', urun_id: null, miktar: 3, stoktan_duser_mi: false },
]

const fields = (miktar = 1, urun_id: string | null = 'u1', stoktan_duser_mi = true) => ({
  urun_id,
  miktar,
  stoktan_duser_mi,
})

function expectError(result: ReturnType<typeof planTeslimatLines>, code: string) {
  assert.equal(result.ok, false)
  if (result.ok) return
  assert.equal(result.error.code, code)
}

describe('planTeslimatLines — kalem alanı gönderilmediğinde', () => {
  it('mevcut kalemler AYNEN korunur', () => {
    const result = planTeslimatLines(existing, {})
    assert.equal(result.ok, true)
    if (!result.ok) return

    assert.equal(result.value.lines, null, 'kalemlere dokunulmaz')
    assert.deepEqual(result.value.deleteLineIds, [])
    assert.equal(result.value.resultingLineCount, 3)
    assert.equal(result.value.linesUntouched, true)
  })

  it('yalnızca açık silme uygulanır, diğerleri korunur', () => {
    const result = planTeslimatLines(existing, { deleteLineIds: ['b'] })
    assert.equal(result.ok, true)
    if (!result.ok) return

    assert.deepEqual(result.value.deleteLineIds, ['b'])
    assert.equal(result.value.resultingLineCount, 2)
    assert.equal(result.value.linesUntouched, false)
  })
})

describe('planTeslimatLines — yabancı kimlik reddi', () => {
  it('başka teslimata ait kalem kimliğiyle GÜNCELLEME reddedilir', () => {
    expectError(
      planTeslimatLines(existing, { lines: [{ id: 'baska-teslimat-kalemi', fields: fields() }] }),
      TESLIMAT_ERROR.LINE_NOT_IN_PARENT,
    )
  })

  it('başka teslimata ait kalem kimliğiyle SİLME reddedilir', () => {
    expectError(
      planTeslimatLines(existing, { deleteLineIds: ['baska-teslimat-kalemi'] }),
      TESLIMAT_ERROR.LINE_NOT_IN_PARENT,
    )
  })

  it('silinmiş bir kalemin kimliği tekrar gönderilirse reddedilir', () => {
    const afterDelete: ExistingTeslimatKalem[] = existing.filter(k => k.id !== 'b')
    expectError(
      planTeslimatLines(afterDelete, { lines: [{ id: 'b', fields: fields() }] }),
      TESLIMAT_ERROR.LINE_NOT_IN_PARENT,
    )
  })

  it('aynı kalem iki kez gönderilirse reddedilir', () => {
    expectError(
      planTeslimatLines(existing, {
        lines: [
          { id: 'a', fields: fields() },
          { id: 'a', fields: fields(5) },
        ],
      }),
      TESLIMAT_ERROR.DUPLICATE_LINE_ID,
    )
  })

  it('bir kalem hem güncellenip hem silinemez', () => {
    expectError(
      planTeslimatLines(existing, {
        lines: [{ id: 'a', fields: fields() }],
        deleteLineIds: ['a'],
      }),
      TESLIMAT_ERROR.INVALID_PAYLOAD,
    )
  })
})

describe('planTeslimatLines — boş liste koruması', () => {
  it('açık onay olmadan bütün kalemleri silmek REDDEDİLİR', () => {
    expectError(
      planTeslimatLines(existing, { lines: [] }),
      TESLIMAT_ERROR.EMPTY_LINES_NOT_CONFIRMED,
    )
  })

  it('açık onay olmadan tüm kalemleri deleteLineIds ile silmek de reddedilir', () => {
    expectError(
      planTeslimatLines(existing, { deleteLineIds: ['a', 'b', 'c'] }),
      TESLIMAT_ERROR.EMPTY_LINES_NOT_CONFIRMED,
    )
  })

  it('açık onayla boş liste kabul edilir', () => {
    const result = planTeslimatLines(existing, { lines: [], confirmDeleteAllLines: true })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.deepEqual(result.value.deleteLineIds.sort(), ['a', 'b', 'c'])
    assert.equal(result.value.resultingLineCount, 0)
  })

  it('kaydı zaten boş olan teslimatta boş liste onay gerektirmez', () => {
    const result = planTeslimatLines([], { lines: [] })
    assert.equal(result.ok, true)
  })
})

describe('planTeslimatLines — tam liste diff', () => {
  it('listede olmayan mevcut kalemler silinmeye alınır', () => {
    const result = planTeslimatLines(existing, {
      lines: [{ id: 'a', fields: fields(9) }],
      confirmDeleteAllLines: false,
    })
    assert.equal(result.ok, true)
    if (!result.ok) return

    assert.deepEqual(result.value.deleteLineIds.sort(), ['b', 'c'])
    assert.equal(result.value.resultingLineCount, 1)
  })

  it('yeni kalem (id yok) kabul edilir ve silme üretmez', () => {
    const result = planTeslimatLines([], { lines: [{ id: null, fields: fields() }] })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.deepEqual(result.value.deleteLineIds, [])
    assert.equal(result.value.resultingLineCount, 1)
  })

  it('mevcut + yeni karışık liste doğru planlanır', () => {
    const result = planTeslimatLines(existing, {
      lines: [
        { id: 'a', fields: fields(4) },
        { id: null, fields: fields(1) },
        { id: 'c', fields: fields(3, null, false) },
      ],
    })
    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.deepEqual(result.value.deleteLineIds, ['b'])
    assert.equal(result.value.resultingLineCount, 3)
  })
})

describe('mapRpcError — hata sözleşmesi', () => {
  it('RPC apply edilmemişse RPC_MISSING döner', () => {
    assert.equal(
      mapRpcError({ code: 'PGRST202', message: 'Could not find the function public.teslimat_update_atomic' }).code,
      TESLIMAT_ERROR.RPC_MISSING,
    )
  })

  it('stabil hata kodları RPC mesajından çözülür', () => {
    const cases: Array<[string, string]> = [
      ['TESLIMAT_STALE_WRITE', TESLIMAT_ERROR.STALE_WRITE],
      ['TESLIMAT_TENANT_MISMATCH', TESLIMAT_ERROR.TENANT_MISMATCH],
      ['TESLIMAT_LINE_NOT_IN_PARENT: 42', TESLIMAT_ERROR.LINE_NOT_IN_PARENT],
      ['TESLIMAT_TRACKING_IN_PROGRESS: ...', TESLIMAT_ERROR.TRACKING_IN_PROGRESS],
      ['TESLIMAT_IDEMPOTENCY_CONFLICT', TESLIMAT_ERROR.IDEMPOTENCY_CONFLICT],
      ['TESLIMAT_EMPTY_LINES_NOT_CONFIRMED', TESLIMAT_ERROR.EMPTY_LINES_NOT_CONFIRMED],
    ]
    for (const [raw, expected] of cases) {
      assert.equal(mapRpcError({ message: raw }).code, expected, raw)
    }
  })

  it('bilinmeyen veritabanı hatası ham mesajı SIZDIRMAZ', () => {
    const mapped = mapRpcError({
      code: '23505',
      message: 'duplicate key value violates unique constraint "secret_internal_idx" DETAIL: Key (x)=(y)',
    })
    assert.equal(mapped.code, TESLIMAT_ERROR.WRITE_FAILED)
    assert.equal(mapped.message.includes('secret_internal_idx'), false)
    assert.equal(mapped.message.includes('DETAIL'), false)
  })
})
