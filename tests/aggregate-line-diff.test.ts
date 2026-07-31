import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import {
  AGGREGATE_ERROR,
  applyLineDiffSafely,
  assertTotalsConsistent,
  checkOptimisticConcurrency,
  diffAggregateLines,
  roundMoney,
  toCents,
  validateNumericFields,
  type AggregateLinesPayload,
  type ExistingLine,
  type LineGateway,
} from '../src/lib/aggregate/line-diff.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Bellek içi sahte kalem deposu.
// Supabase yerine geçer; amaç DB'yi taklit etmek değil, "önce sil sonra ekle"
// akışının hata anında ne bıraktığını deterministik biçimde göstermektir.
// ─────────────────────────────────────────────────────────────────────────────

interface Row {
  id: string
  sira_no: number
  aciklama: string
  miktar: number
  birim_fiyat: number
}

class FakeLineStore {
  rows: Row[]
  private seq = 0
  /** Kaçıncı yazma çağrısında hata üretileceği (1 tabanlı); 0 ⇒ hata yok. */
  failOnWriteCall = 0
  private writeCalls = 0

  constructor(initial: Row[]) {
    this.rows = initial.map(r => ({ ...r }))
  }

  private nextWrite(): { message: string } | null {
    this.writeCalls++
    if (this.failOnWriteCall !== 0 && this.writeCalls === this.failOnWriteCall) {
      return { message: 'simulated failure' }
    }
    return null
  }

  async deleteByParent(): Promise<{ error: { message: string } | null }> {
    const err = this.nextWrite()
    if (err) return { error: err }
    this.rows = []
    return { error: null }
  }

  async deleteByIds(ids: string[]): Promise<{ error: { message: string } | null }> {
    const err = this.nextWrite()
    if (err) return { error: err }
    this.rows = this.rows.filter(r => !ids.includes(r.id))
    return { error: null }
  }

  async insert(
    rows: Array<{ sira_no: number; fields: Omit<Row, 'id' | 'sira_no'> }>,
  ): Promise<{ error: { message: string } | null }> {
    const err = this.nextWrite()
    if (err) return { error: err }
    for (const row of rows) {
      this.seq++
      this.rows.push({ id: `new-${this.seq}`, sira_no: row.sira_no, ...row.fields })
    }
    return { error: null }
  }

  async update(
    id: string,
    sira_no: number,
    fields: Omit<Row, 'id' | 'sira_no'>,
  ): Promise<{ error: { message: string } | null }> {
    const err = this.nextWrite()
    if (err) return { error: err }
    const target = this.rows.find(r => r.id === id)
    if (target) Object.assign(target, fields, { sira_no })
    return { error: null }
  }
}

type Fields = Omit<Row, 'id' | 'sira_no'>

function fields(aciklama: string, miktar = 1, birim_fiyat = 100): Fields {
  return { aciklama, miktar, birim_fiyat }
}

const EXISTING: ExistingLine[] = [{ id: 'a', sira_no: 1 }, { id: 'b', sira_no: 2 }, { id: 'c', sira_no: 3 }]

function seededStore() {
  return new FakeLineStore([
    { id: 'a', sira_no: 1, aciklama: 'Yangın tüpü 6 kg', miktar: 2, birim_fiyat: 500 },
    { id: 'b', sira_no: 2, aciklama: 'Dolum hizmeti', miktar: 1, birim_fiyat: 250 },
    { id: 'c', sira_no: 3, aciklama: 'Periyodik bakım', miktar: 3, birim_fiyat: 120 },
  ])
}

function gatewayFor(store: FakeLineStore, parentFails = false): LineGateway<Fields> {
  return {
    updateParent: async () => ({ error: parentFails ? { message: 'parent update failed' } : null }),
    insertLines: rows => store.insert(rows),
    updateLine: (id, sira_no, f) => store.update(id, sira_no, f),
    deleteLines: ids => store.deleteByIds(ids),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. HATANIN YENİDEN ÜRETİLMESİ — eski "önce sil, sonra ekle" akışı
// ─────────────────────────────────────────────────────────────────────────────

describe('regresyon: eski delete-then-insert akışı veri kaybettiriyor', () => {
  /**
   * `DuzenleTeklifClient.tsx:275`, `EditServiceFormClient.tsx:96`,
   * `ProformaFormClient.tsx:430` ve `lib/teslimatlar.ts:721` akışının birebir modeli.
   */
  async function legacySave(store: FakeLineStore, payloadLines: Fields[]) {
    const del = await store.deleteByParent()
    if (del.error) return { ok: false as const, stage: 'delete' }
    const ins = await store.insert(payloadLines.map((f, i) => ({ sira_no: i + 1, fields: f })))
    if (ins.error) return { ok: false as const, stage: 'insert' }
    return { ok: true as const }
  }

  test('insert adımı hata verirse BÜTÜN kalemler kalıcı olarak kaybolur', async () => {
    const store = seededStore()
    store.failOnWriteCall = 2 // 1: delete, 2: insert

    const result = await legacySave(store, [fields('Yangın tüpü 6 kg', 2, 500)])

    assert.equal(result.ok, false)
    // Kanıt: delete başarılı oldu, insert patladı, geri alma yok.
    assert.equal(store.rows.length, 0, 'eski akış tüm kalemleri sildi')
  })

  test('payload kalem alanı boş geldiğinde eski akış sessizce hepsini siler', async () => {
    const store = seededStore()
    const result = await legacySave(store, []) // ör. form serialize hatası
    assert.equal(result.ok, true)
    assert.equal(store.rows.length, 0, 'eski akış boş listeyi "hepsini sil" saydı')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. YENİ SÖZLEŞME — aynı senaryolarda veri kaybı yok
// ─────────────────────────────────────────────────────────────────────────────

describe('yeni sözleşme: payload semantiği', () => {
  test('1) yalnızca üst bilgi değişince (lines gönderilmez) bütün kalemler korunur', async () => {
    const store = seededStore()
    const plan = diffAggregateLines<Fields>(EXISTING, {})
    assert.equal(plan.ok, true)
    assert.equal(plan.value.linesUntouched, true)
    assert.equal(plan.value.toDelete.length, 0)
    assert.equal(plan.value.resultingLineCount, 3)

    const applied = await applyLineDiffSafely(gatewayFor(store), plan.value)
    assert.equal(applied.ok, true)
    assert.equal(store.rows.length, 3)
  })

  test('2) lines: [] silme anlamına gelmez — kalemler korunur', () => {
    const plan = diffAggregateLines<Fields>(EXISTING, { lines: [] })
    assert.equal(plan.ok, true)
    assert.deepEqual(plan.value.toDelete, [])
    assert.deepEqual(plan.value.preservedIds, ['a', 'b', 'c'])
    assert.equal(plan.value.resultingLineCount, 3)
  })

  test('3) bir kalem düzenleme yalnızca o kalemi günceller', async () => {
    const store = seededStore()
    const payload: AggregateLinesPayload<Fields> = {
      lines: [{ id: 'b', fields: fields('Dolum hizmeti (revize)', 2, 275) }],
    }
    const plan = diffAggregateLines<Fields>(EXISTING, payload)
    assert.equal(plan.ok, true)
    assert.equal(plan.value.toUpdate.length, 1)
    assert.equal(plan.value.toInsert.length, 0)
    assert.equal(plan.value.toDelete.length, 0)

    await applyLineDiffSafely(gatewayFor(store), plan.value)
    assert.equal(store.rows.length, 3)
    assert.equal(store.rows.find(r => r.id === 'b')?.birim_fiyat, 275)
    assert.equal(store.rows.find(r => r.id === 'a')?.aciklama, 'Yangın tüpü 6 kg')
  })

  test('4) kalem ekleme mevcutları bozmaz', async () => {
    const store = seededStore()
    const plan = diffAggregateLines<Fields>(EXISTING, {
      lines: [{ clientKey: 'tmp-1', fields: fields('Yeni kalem', 1, 90) }],
    })
    assert.equal(plan.ok, true)
    assert.equal(plan.value.toInsert.length, 1)

    await applyLineDiffSafely(gatewayFor(store), plan.value)
    assert.equal(store.rows.length, 4)
  })

  test('5) açık silme niyetiyle yalnızca seçilen kalem silinir', async () => {
    const store = seededStore()
    const plan = diffAggregateLines<Fields>(EXISTING, { deleteLineIds: ['c'] })
    assert.equal(plan.ok, true)
    assert.deepEqual(plan.value.toDelete, ['c'])

    await applyLineDiffSafely(gatewayFor(store), plan.value)
    assert.equal(store.rows.length, 2)
    assert.equal(store.rows.some(r => r.id === 'c'), false)
  })

  test('6) replaceAllLines olmadan eksik kalemler silinmez', () => {
    const plan = diffAggregateLines<Fields>(EXISTING, {
      lines: [{ id: 'a', fields: fields('Yangın tüpü 6 kg', 2, 500) }],
    })
    assert.equal(plan.ok, true)
    assert.deepEqual(plan.value.toDelete, [])
    assert.deepEqual(plan.value.preservedIds, ['b', 'c'])
  })

  test('7) replaceAllLines açıkken listede olmayanlar silinir', () => {
    const plan = diffAggregateLines<Fields>(EXISTING, {
      replaceAllLines: true,
      lines: [{ id: 'a', fields: fields('Yangın tüpü 6 kg', 2, 500) }],
    })
    assert.equal(plan.ok, true)
    assert.deepEqual(plan.value.toDelete.sort(), ['b', 'c'])
    assert.equal(plan.value.resultingLineCount, 1)
  })

  test('8) bütün kalemleri silmek açık onay ister', () => {
    const withoutConfirm = diffAggregateLines<Fields>(EXISTING, { replaceAllLines: true, lines: [] })
    assert.equal(withoutConfirm.ok, false)
    assert.equal(withoutConfirm.error.code, AGGREGATE_ERROR.EMPTY_LINES_NOT_CONFIRMED)

    const withConfirm = diffAggregateLines<Fields>(EXISTING, {
      replaceAllLines: true,
      lines: [],
      confirmDeleteAllLines: true,
    })
    assert.equal(withConfirm.ok, true)
    assert.deepEqual(withConfirm.value.toDelete.sort(), ['a', 'b', 'c'])
  })

  test('9) başka kayda ait kalem kimliği reddedilir', () => {
    const foreign = diffAggregateLines<Fields>(EXISTING, {
      lines: [{ id: 'baska-kaydin-kalemi', fields: fields('X') }],
    })
    assert.equal(foreign.ok, false)
    assert.equal(foreign.error.code, AGGREGATE_ERROR.LINE_NOT_IN_PARENT)

    const foreignDelete = diffAggregateLines<Fields>(EXISTING, { deleteLineIds: ['zzz'] })
    assert.equal(foreignDelete.ok, false)
    assert.equal(foreignDelete.error.code, AGGREGATE_ERROR.LINE_NOT_IN_PARENT)
  })

  test('10) aynı kalem iki kez gönderilirse reddedilir', () => {
    const plan = diffAggregateLines<Fields>(EXISTING, {
      lines: [
        { id: 'a', fields: fields('X') },
        { id: 'a', fields: fields('Y') },
      ],
    })
    assert.equal(plan.ok, false)
    assert.equal(plan.error.code, AGGREGATE_ERROR.DUPLICATE_LINE_ID)
  })

  test('11) bir kalem hem güncelleme hem silme listesinde olamaz', () => {
    const plan = diffAggregateLines<Fields>(EXISTING, {
      lines: [{ id: 'a', fields: fields('X') }],
      deleteLineIds: ['a'],
    })
    assert.equal(plan.ok, false)
    assert.equal(plan.error.code, AGGREGATE_ERROR.INVALID_PAYLOAD)
  })

  test('12) sira_no kimlik yerine kullanılmaz — sıra değişse de id eşleşmesi korunur', () => {
    const plan = diffAggregateLines<Fields>(EXISTING, {
      replaceAllLines: true,
      lines: [
        { id: 'c', fields: fields('Periyodik bakım', 3, 120) },
        { id: 'a', fields: fields('Yangın tüpü 6 kg', 2, 500) },
        { id: 'b', fields: fields('Dolum hizmeti', 1, 250) },
      ],
    })
    assert.equal(plan.ok, true)
    assert.deepEqual(plan.value.toDelete, [])
    assert.deepEqual(
      plan.value.toUpdate.map(u => [u.id, u.sira_no]),
      [['c', 1], ['a', 2], ['b', 3]],
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. HATA ENJEKSİYONU — kısmi yazmada bile kalem kaybı yok
// ─────────────────────────────────────────────────────────────────────────────

describe('yeni sözleşme: hata anında veri kaybı olmaz', () => {
  test('insert ortada patlarsa mevcut kalemler yerinde kalır', async () => {
    const store = seededStore()
    store.failOnWriteCall = 1 // ilk yazma = insert

    const plan = diffAggregateLines<Fields>(EXISTING, {
      replaceAllLines: true,
      lines: [
        { id: 'a', fields: fields('Yangın tüpü 6 kg', 2, 500) },
        { clientKey: 't1', fields: fields('Yeni satır', 1, 10) },
      ],
    })
    assert.equal(plan.ok, true)

    const applied = await applyLineDiffSafely(gatewayFor(store), plan.value)
    assert.equal(applied.ok, false)
    assert.equal(applied.error.code, AGGREGATE_ERROR.WRITE_FAILED)
    // Kritik: silme en son yapıldığı için 3 kalem de duruyor.
    assert.equal(store.rows.length, 3)
  })

  test('update ortada patlarsa silme hiç çalışmaz', async () => {
    const store = seededStore()
    store.failOnWriteCall = 1 // insert yok ⇒ ilk yazma update

    const plan = diffAggregateLines<Fields>(EXISTING, {
      replaceAllLines: true,
      lines: [{ id: 'a', fields: fields('Güncel', 2, 500) }],
    })
    assert.equal(plan.ok, true)
    assert.deepEqual(plan.value.toDelete.sort(), ['b', 'c'])

    const applied = await applyLineDiffSafely(gatewayFor(store), plan.value)
    assert.equal(applied.ok, false)
    assert.equal(store.rows.length, 3, 'silme adımına hiç gelinmedi')
  })

  test('üst kayıt güncellemesi patlarsa hiçbir kalem işlemi yapılmaz', async () => {
    const store = seededStore()
    const plan = diffAggregateLines<Fields>(EXISTING, {
      replaceAllLines: true,
      lines: [{ id: 'a', fields: fields('X', 1, 1) }],
    })
    assert.equal(plan.ok, true)

    const applied = await applyLineDiffSafely(gatewayFor(store, true), plan.value)
    assert.equal(applied.ok, false)
    assert.equal(store.rows.length, 3)
    assert.equal(store.rows.find(r => r.id === 'a')?.birim_fiyat, 500)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. Doğrulama, para ve eşzamanlılık
// ─────────────────────────────────────────────────────────────────────────────

describe('doğrulama ve para', () => {
  test('sayısal olmayan / NaN alan sessizce sıfırlanmaz, hata üretir', () => {
    const bad = validateNumericFields([{ miktar: Number.NaN, birim_fiyat: 10 }], [
      { field: 'miktar' },
      { field: 'birim_fiyat' },
    ])
    assert.equal(bad.ok, false)
    assert.equal(bad.error.code, AGGREGATE_ERROR.INVALID_LINE_VALUE)
    assert.equal(bad.error.field, 'lines[0].miktar')
  })

  test('negatif miktar reddedilir, izin verilen alanda kabul edilir', () => {
    const rejected = validateNumericFields([{ miktar: -1 }], [{ field: 'miktar' }])
    assert.equal(rejected.ok, false)

    const allowed = validateNumericFields([{ iskonto: -1 }], [{ field: 'iskonto', allowNegative: true }])
    assert.equal(allowed.ok, true)
  })

  test('para toplamı kuruş üzerinden hesaplanır (float drift yok)', () => {
    // 0.1 + 0.2 klasiği: float toplamı 0.30000000000000004
    const cents = toCents(0.1) + toCents(0.2)
    assert.equal(cents, 30)
    assert.equal(roundMoney(0.1 + 0.2), 0.3)
    assert.equal(toCents(1234.565), 123457)
  })

  test('toplam uyuşmazlığı açık hata üretir', () => {
    assert.equal(assertTotalsConsistent(100.0, 100.01, 2).ok, true)
    const mismatch = assertTotalsConsistent(100.0, 105.0)
    assert.equal(mismatch.ok, false)
    assert.equal(mismatch.error.code, AGGREGATE_ERROR.TOTALS_MISMATCH)
  })
})

describe('eşzamanlılık', () => {
  test('bayat ekranla kayıt çakışma hatası verir', () => {
    const outcome = checkOptimisticConcurrency({
      expected: '2026-07-30T10:00:00.000Z',
      actual: '2026-07-30T11:30:00.000Z',
    })
    assert.equal(outcome.status, 'conflict')
    assert.equal(outcome.error.code, AGGREGATE_ERROR.STALE_WRITE)
  })

  test('aynı sürümle kayıt geçer', () => {
    const outcome = checkOptimisticConcurrency({
      expected: '2026-07-30T10:00:00.000Z',
      actual: '2026-07-30T10:00:00.000Z',
    })
    assert.equal(outcome.status, 'ok')
  })

  test('updated_at kolonu henüz apply edilmemişse kontrol sessizce geçmiş sayılmaz', () => {
    const outcome = checkOptimisticConcurrency({ expected: '2026-07-30T10:00:00.000Z', actual: undefined })
    assert.equal(outcome.status, 'skipped')
    assert.equal(outcome.reason, 'column_missing')
  })
})
