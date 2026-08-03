/**
 * Teslimat durum geçişi ve takip kapatma sözleşmesi — domain testleri.
 *
 * Kapsam: GOREV.md §8 "çift stok düşme regresyonları" listesinin saf katmanda
 * kanıtlanabilen maddeleri (1-7) ve §9 emanet/geri teslim hata sözleşmesi.
 *
 * ── SINIR (dürüstlük notu) ──────────────────────────────────────────────────
 * Bu testler gerçek veritabanı gerektirmez; `status-transition.ts` saftır.
 * Rollback, satır kilidi, gerçek eşzamanlılık (§8-8, §8-9) ve RLS reddi (§8-10)
 * BURADA KANITLANMAZ — onlar yalnızca gerçek PostgreSQL üzerinde çalıştırılan
 * `db/teslimat_atomic_update_tests.sql` ile doğrulanabilir ve staging Gate 0
 * NO-GO olduğu için ÇALIŞTIRILMAMIŞTIR.
 */

import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import {
  TAKIP_ERROR,
  TESLIMAT_DURUMLAR,
  buildDurumGecisKey,
  buildDurumPatch,
  buildTakipKapatmaKey,
  isTeslimatDurum,
  mapTakipRpcError,
  planDurumGecisi,
  stokEtkisiVarMi,
} from '../src/lib/teslimat/status-transition.ts'
import type { ExistingTeslimatKalem, TeslimatDurum } from '../src/lib/teslimat/teslimat-update.ts'

const kalem = (
  urun_id: string | null,
  miktar: number,
  stoktan_duser_mi = true,
  id = `k-${urun_id}-${miktar}`,
): ExistingTeslimatKalem => ({ id, urun_id, miktar, stoktan_duser_mi })

/** Delta listesini karşılaştırması kolay bir haritaya çevirir. */
function deltaMap(durumEski: TeslimatDurum, durumYeni: TeslimatDurum, kalemler: ExistingTeslimatKalem[]) {
  const plan = planDurumGecisi(durumEski, durumYeni, kalemler)
  return new Map(plan.deltalar.map(d => [d.urun_id, d.delta]))
}

describe('durum kümesi', () => {
  it('yalnızca gerçek durum adlarını kabul eder', () => {
    for (const durum of TESLIMAT_DURUMLAR) assert.equal(isTeslimatDurum(durum), true)
    for (const bad of ['tamamlandı', 'TAMAMLANDI', 'sevk', '', null, undefined, 7, {}]) {
      assert.equal(isTeslimatDurum(bad), false)
    }
  })

  it('stok etkisi YALNIZCA tamamlandi durumundadır', () => {
    assert.equal(stokEtkisiVarMi('tamamlandi'), true)
    assert.equal(stokEtkisiVarMi('taslak'), false)
    assert.equal(stokEtkisiVarMi('sevkte'), false)
    assert.equal(stokEtkisiVarMi('iptal'), false)
  })
})

describe('durum geçişi — stok etkisi tam bir kez uygulanır', () => {
  const kalemler = [kalem('u1', 3), kalem('u2', 5)]

  // §8-1: stok etkisiz durumda kaydetme → stok değişmez.
  it('taslak → sevkte hiçbir stok hareketi üretmez', () => {
    const plan = planDurumGecisi('taslak', 'sevkte', kalemler)
    assert.equal(plan.stokYonu, 'yok')
    assert.deepEqual(plan.deltalar, [])
  })

  // §8-2: stok etkili duruma ilk geçiş → stok bir kez değişir.
  it('sevkte → tamamlandi stoku bir kez düşer', () => {
    const plan = planDurumGecisi('sevkte', 'tamamlandi', kalemler)
    assert.equal(plan.stokYonu, 'dus')
    assert.deepEqual(deltaMap('sevkte', 'tamamlandi', kalemler), new Map([['u1', 3], ['u2', 5]]))
  })

  // §8-3 / §8-4: aynı durumun tekrarı → ikinci hareket YOK.
  it('tamamlandi → tamamlandi no-op olur (çift düşüm yok)', () => {
    const plan = planDurumGecisi('tamamlandi', 'tamamlandi', kalemler)
    assert.equal(plan.noOp, true)
    assert.equal(plan.stokYonu, 'yok')
    assert.deepEqual(plan.deltalar, [])
  })

  it('sevkte → tamamlandi → sevkte → tamamlandi toplamda tek düşüm bırakır', () => {
    // Eski `syncTeslimatSideEffects` bu diziyi iki kez düşüyordu (P0 bulgusu).
    const dizi: Array<[TeslimatDurum, TeslimatDurum]> = [
      ['sevkte', 'tamamlandi'],
      ['tamamlandi', 'sevkte'],
      ['sevkte', 'tamamlandi'],
    ]
    const toplam = new Map<string, number>()
    for (const [eski, yeni] of dizi) {
      for (const d of planDurumGecisi(eski, yeni, kalemler).deltalar) {
        toplam.set(d.urun_id, (toplam.get(d.urun_id) ?? 0) + d.delta)
      }
    }
    assert.deepEqual(toplam, new Map([['u1', 3], ['u2', 5]]))
  })

  it('tamamlandi → iptal stoku tam olarak geri verir', () => {
    const plan = planDurumGecisi('tamamlandi', 'iptal', kalemler)
    assert.equal(plan.stokYonu, 'iade')
    assert.deepEqual(deltaMap('tamamlandi', 'iptal', kalemler), new Map([['u1', -3], ['u2', -5]]))
  })

  it('iptal → iptal tekrarı hiçbir iade üretmez (idempotent silme/iptal)', () => {
    assert.equal(planDurumGecisi('iptal', 'iptal', kalemler).noOp, true)
  })

  it('taslak → iptal stoku hiç etkilemez (stok hiç düşülmemişti)', () => {
    assert.deepEqual(planDurumGecisi('taslak', 'iptal', kalemler).deltalar, [])
  })

  // §8-6: aynı ürün iki kalemde → toplam delta doğru.
  it('aynı ürün iki kalemde tek toplamda birleşir', () => {
    const ikili = [kalem('u1', 2, true, 'a'), kalem('u1', 4, true, 'b')]
    assert.deepEqual(deltaMap('sevkte', 'tamamlandi', ikili), new Map([['u1', 6]]))
  })

  it('stoktan düşmeyen ve ürünsüz kalemler delta üretmez', () => {
    const karisik = [kalem('u1', 3, false), kalem(null, 9), kalem('u2', 0)]
    assert.deepEqual(planDurumGecisi('sevkte', 'tamamlandi', karisik).deltalar, [])
  })

  it('bütün durum çiftleri için delta yönü tutarlıdır', () => {
    for (const eski of TESLIMAT_DURUMLAR) {
      for (const yeni of TESLIMAT_DURUMLAR) {
        const plan = planDurumGecisi(eski, yeni, kalemler)
        const beklenen =
          eski === yeni ? 'yok'
            : !stokEtkisiVarMi(eski) && stokEtkisiVarMi(yeni) ? 'dus'
              : stokEtkisiVarMi(eski) && !stokEtkisiVarMi(yeni) ? 'iade'
                : 'yok'
        assert.equal(plan.stokYonu, beklenen, `${eski} → ${yeni}`)
        if (beklenen === 'yok') assert.deepEqual(plan.deltalar, [], `${eski} → ${yeni}`)
      }
    }
  })
})

describe('parent patch — durum geçişi başka alanı sıfırlamaz', () => {
  it('yalnızca durum alanını taşır', () => {
    assert.deepEqual(buildDurumPatch('tamamlandi'), { durum: 'tamamlandi' })
    assert.deepEqual(Object.keys(buildDurumPatch('iptal')), ['durum'])
  })
})

describe('idempotency anahtarları', () => {
  it('aynı teslimat + durum + sürüm için stabildir', () => {
    const a = buildDurumGecisKey('t1', 'tamamlandi', '2026-08-01T00:00:00Z')
    const b = buildDurumGecisKey('t1', 'tamamlandi', '2026-08-01T00:00:00Z')
    assert.equal(a, b)
  })

  it('farklı hedef durum veya farklı sürüm farklı anahtar üretir', () => {
    const base = buildDurumGecisKey('t1', 'tamamlandi', 'v1')
    assert.notEqual(base, buildDurumGecisKey('t1', 'sevkte', 'v1'))
    assert.notEqual(base, buildDurumGecisKey('t1', 'tamamlandi', 'v2'))
    assert.notEqual(base, buildDurumGecisKey('t2', 'tamamlandi', 'v1'))
  })

  it('sürüm yoksa deterministik bir yer tutucu kullanır', () => {
    assert.equal(buildDurumGecisKey('t1', 'iptal', null), buildDurumGecisKey('t1', 'iptal', undefined))
  })

  it('emanet ve geri teslim anahtarları çakışmaz', () => {
    assert.notEqual(buildTakipKapatmaKey('emanet', 'x', null), buildTakipKapatmaKey('geri_teslim', 'x', null))
  })

  it('anahtarlar hassas veri taşımaz (yalnızca kimlik ve durum)', () => {
    const key = buildDurumGecisKey('11111111-2222-3333-4444-555555555555', 'tamamlandi', 'v1')
    assert.match(key, /^teslimat-durum:[0-9a-f-]+:tamamlandi:v1$/)
  })
})

describe('takip RPC hata eşlemesi', () => {
  it('RPC yoksa açık ve teşhis edilebilir kod döner', () => {
    assert.equal(mapTakipRpcError({ code: 'PGRST202' }).code, TAKIP_ERROR.RPC_MISSING)
    assert.equal(mapTakipRpcError({ code: '42883' }).code, TAKIP_ERROR.RPC_MISSING)
    assert.equal(
      mapTakipRpcError({ message: 'Could not find the function public.x' }).code,
      TAKIP_ERROR.RPC_MISSING,
    )
  })

  it('stabil kodları mesajdan çözer', () => {
    assert.equal(
      mapTakipRpcError({ message: 'TESLIMAT_TAKIP_NOT_FOUND' }).code,
      TAKIP_ERROR.NOT_FOUND,
    )
    assert.equal(
      mapTakipRpcError({ message: 'TESLIMAT_IDEMPOTENCY_CONFLICT: aynı anahtar' }).code,
      TAKIP_ERROR.IDEMPOTENCY_CONFLICT,
    )
    assert.equal(
      mapTakipRpcError({ message: 'TESLIMAT_TENANT_MISMATCH' }).code,
      TAKIP_ERROR.TENANT_MISMATCH,
    )
  })

  it('yabancı tenant ile bulunamadı AYNI mesajı döndürür (varlık sızıntısı yok)', () => {
    const notFound = mapTakipRpcError({ message: 'TESLIMAT_TAKIP_NOT_FOUND' })
    const mismatch = mapTakipRpcError({ message: 'TESLIMAT_TENANT_MISMATCH' })
    assert.equal(notFound.message, mismatch.message)
  })

  it('bilinmeyen hata ham veritabanı mesajını SIZDIRMAZ', () => {
    const raw = 'duplicate key value violates unique constraint "emanet_takipleri_pkey" DETAIL: Key (id)=(...)'
    const mapped = mapTakipRpcError({ code: '23505', message: raw })
    assert.equal(mapped.code, TAKIP_ERROR.WRITE_FAILED)
    assert.equal(mapped.retryable, true)
    assert.ok(!mapped.message.includes('emanet_takipleri_pkey'))
    assert.ok(!mapped.message.includes('DETAIL'))
  })

  it('null/undefined girdide çökmez', () => {
    assert.equal(mapTakipRpcError(null).code, TAKIP_ERROR.WRITE_FAILED)
    assert.equal(mapTakipRpcError(undefined).code, TAKIP_ERROR.WRITE_FAILED)
  })
})
