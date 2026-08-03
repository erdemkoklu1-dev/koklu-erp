/**
 * Teslimat stok delta modeli — domain testleri (GOREV.md §11.1).
 *
 * Bu testler gerçek veritabanı gerektirmez: `teslimat-update.ts` saf ve
 * bağımlılıksızdır. Amaç, `db/teslimat_atomic_update_rpc.sql` içindeki delta
 * hesabının domain kurallarına uyduğunu ve eski kodun DOĞRU çalıştığı senaryoda
 * onunla eşdeğer olduğunu kanıtlamaktır.
 *
 * Kanıt zinciri: docs/teslimat_atomic_update_design.md §4
 */

import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'

import {
  computeStokDelta,
  computeStokEtkisi,
  needsEmanetTakip,
  needsGeriTeslimTakip,
  type ExistingTeslimatKalem,
} from '../src/lib/teslimat/teslimat-update.ts'

const kalem = (
  urun_id: string | null,
  miktar: number,
  stoktan_duser_mi = true,
  id = `k-${Math.random().toString(36).slice(2)}`,
): ExistingTeslimatKalem => ({ id, urun_id, miktar, stoktan_duser_mi })

/** Eski kodun ("reverse-then-apply") ürettiği net stok etkisini simüle eder. */
function legacyNetEffect(
  eski: ExistingTeslimatKalem[],
  eskiDurum: string,
  yeni: ExistingTeslimatKalem[],
  yeniDurum: string,
): Map<string, number> {
  const net = new Map<string, number>()

  // `reverseExistingStock`: eski durumu HİÇ dikkate almadan tersine çevirir.
  for (const k of eski) {
    if (!k.urun_id || !k.stoktan_duser_mi || !(k.miktar > 0)) continue
    net.set(k.urun_id, (net.get(k.urun_id) ?? 0) - k.miktar) // stoğa iade ⇒ delta negatif
  }
  // `applyKalemSideEffects`: yalnızca `tamamlandi` iken düşer.
  if (yeniDurum === 'tamamlandi') {
    for (const k of yeni) {
      if (!k.urun_id || !k.stoktan_duser_mi || !(k.miktar > 0)) continue
      net.set(k.urun_id, (net.get(k.urun_id) ?? 0) + k.miktar)
    }
  }
  for (const [key, value] of [...net]) if (value === 0) net.delete(key)
  return net
}

function deltaMap(
  eski: ExistingTeslimatKalem[],
  eskiDurum: string,
  yeni: ExistingTeslimatKalem[],
  yeniDurum: string,
): Map<string, number> {
  const deltas = computeStokDelta(
    computeStokEtkisi(eski, eskiDurum),
    computeStokEtkisi(yeni, yeniDurum),
  )
  return new Map(deltas.map(d => [d.urun_id, d.delta]))
}

describe('computeStokEtkisi — durum kapısı', () => {
  it('yalnızca tamamlandi durumunda stok etkisi üretir', () => {
    const kalemler = [kalem('u1', 5)]
    assert.equal(computeStokEtkisi(kalemler, 'tamamlandi').get('u1'), 5)

    for (const durum of ['taslak', 'sevkte', 'iptal']) {
      assert.equal(
        computeStokEtkisi(kalemler, durum).size,
        0,
        `${durum} durumunda stok etkisi olmamalı`,
      )
    }
  })

  it('stoktan_duser_mi=false olan kalem stok etkisi üretmez', () => {
    assert.equal(computeStokEtkisi([kalem('u1', 5, false)], 'tamamlandi').size, 0)
  })

  it('urun_id olmayan (manuel) kalem stok etkisi üretmez', () => {
    assert.equal(computeStokEtkisi([kalem(null, 5)], 'tamamlandi').size, 0)
  })

  it('miktar sıfır veya negatifse etki üretmez', () => {
    assert.equal(computeStokEtkisi([kalem('u1', 0)], 'tamamlandi').size, 0)
    assert.equal(computeStokEtkisi([kalem('u1', -3)], 'tamamlandi').size, 0)
  })

  it('aynı ürünün birden çok satırı tek toplamda birleşir', () => {
    const effect = computeStokEtkisi([kalem('u1', 3), kalem('u1', 2), kalem('u2', 1)], 'tamamlandi')
    assert.equal(effect.get('u1'), 5)
    assert.equal(effect.get('u2'), 1)
    assert.equal(effect.size, 2)
  })
})

describe('computeStokDelta — miktar değişimi', () => {
  it('miktar artışı pozitif delta (ek düşüm) üretir', () => {
    const d = deltaMap([kalem('u1', 3)], 'tamamlandi', [kalem('u1', 5)], 'tamamlandi')
    assert.equal(d.get('u1'), 2)
  })

  it('miktar azalışı negatif delta (stoğa iade) üretir', () => {
    const d = deltaMap([kalem('u1', 5)], 'tamamlandi', [kalem('u1', 2)], 'tamamlandi')
    assert.equal(d.get('u1'), -3)
  })

  it('yalnızca üst bilgi değişince hiçbir stok deltası oluşmaz', () => {
    const kalemler = [kalem('u1', 4), kalem('u2', 2)]
    assert.equal(deltaMap(kalemler, 'tamamlandi', kalemler, 'tamamlandi').size, 0)
  })

  it('şube/ürün değişimi eski üründe iade, yeni üründe düşüm üretir', () => {
    const d = deltaMap([kalem('u1', 4)], 'tamamlandi', [kalem('u2', 4)], 'tamamlandi')
    assert.equal(d.get('u1'), -4)
    assert.equal(d.get('u2'), 4)
  })

  it('birden çok satırdaki aynı ürün için tek net delta üretir', () => {
    const d = deltaMap(
      [kalem('u1', 3), kalem('u1', 2)],
      'tamamlandi',
      [kalem('u1', 1), kalem('u1', 1), kalem('u1', 1)],
      'tamamlandi',
    )
    assert.equal(d.size, 1)
    assert.equal(d.get('u1'), -2) // 5 → 3
  })
})

describe('computeStokDelta — durum geçişleri', () => {
  const kalemler = [kalem('u1', 4)]

  it('taslak → tamamlandi: stok düşer', () => {
    assert.equal(deltaMap(kalemler, 'taslak', kalemler, 'tamamlandi').get('u1'), 4)
  })

  it('tamamlandi → taslak: stok iade edilir', () => {
    assert.equal(deltaMap(kalemler, 'tamamlandi', kalemler, 'taslak').get('u1'), -4)
  })

  it('tamamlandi → iptal: stok iade edilir', () => {
    assert.equal(deltaMap(kalemler, 'tamamlandi', kalemler, 'iptal').get('u1'), -4)
  })

  it('taslak → taslak: HİÇBİR stok hareketi olmaz (T1 regresyonu)', () => {
    // Eski `reverseExistingStock` burada hiç yapılmamış bir düşümü geri alıp
    // stoku şişiriyordu. Delta modeli sıfır üretmelidir.
    assert.equal(deltaMap(kalemler, 'taslak', kalemler, 'taslak').size, 0)
  })

  it('sevkte → sevkte: HİÇBİR stok hareketi olmaz (T1 regresyonu)', () => {
    assert.equal(deltaMap(kalemler, 'sevkte', kalemler, 'sevkte').size, 0)
  })
})

describe('delta modeli ↔ eski kod eşdeğerliği', () => {
  it('eski ve yeni durum tamamlandi iken eski kodla BİREBİR aynı sonucu verir', () => {
    const senaryolar: Array<[ExistingTeslimatKalem[], ExistingTeslimatKalem[]]> = [
      [[kalem('u1', 3)], [kalem('u1', 5)]],
      [[kalem('u1', 5)], [kalem('u1', 2)]],
      [[kalem('u1', 4)], [kalem('u2', 4)]],
      [[kalem('u1', 3), kalem('u1', 2)], [kalem('u1', 1)]],
      [[kalem('u1', 2), kalem('u2', 7)], [kalem('u2', 7), kalem('u3', 1)]],
      [[], [kalem('u1', 6)]],
      [[kalem('u1', 6)], []],
    ]

    for (const [eski, yeni] of senaryolar) {
      const delta = deltaMap(eski, 'tamamlandi', yeni, 'tamamlandi')
      const legacy = legacyNetEffect(eski, 'tamamlandi', yeni, 'tamamlandi')
      assert.deepEqual(
        [...delta.entries()].sort(),
        [...legacy.entries()].sort(),
        'tamamlandi→tamamlandi senaryosunda delta ve eski kod aynı olmalı',
      )
    }
  })

  it('eski durum tamamlandi DEĞİLKEN eski koddan AYRILIR (hatayı düzeltir)', () => {
    const kalemler = [kalem('u1', 4)]
    const delta = deltaMap(kalemler, 'taslak', kalemler, 'taslak')
    const legacy = legacyNetEffect(kalemler, 'taslak', kalemler, 'taslak')

    assert.equal(delta.size, 0, 'doğru davranış: hiçbir stok hareketi yok')
    assert.equal(legacy.get('u1'), -4, 'eski kod stoku şişiriyordu (T1)')
  })
})

describe('emanet / geri teslim koşulları', () => {
  it('emanet_teslim tipi emanet takibi gerektirir', () => {
    assert.equal(needsEmanetTakip({ hareket_tipi: 'emanet_teslim', emanet_mi: false, miktar: 1 }), true)
  })

  it('emanet_mi bayrağı tek başına yeterlidir', () => {
    assert.equal(needsEmanetTakip({ hareket_tipi: 'diger', emanet_mi: true, miktar: 1 }), true)
  })

  it('miktar sıfırsa emanet takibi oluşmaz', () => {
    assert.equal(needsEmanetTakip({ hareket_tipi: 'emanet_teslim', emanet_mi: true, miktar: 0 }), false)
  })

  it('dolum/bakım/yenileme için alınan kalemler geri teslim takibi gerektirir', () => {
    for (const tip of ['dolum_icin_alindi', 'bakim_icin_alindi', 'yenileme_icin_alindi']) {
      assert.equal(
        needsGeriTeslimTakip({ hareket_tipi: tip, geri_alinmasi_gerekir_mi: false }),
        true,
        `${tip} geri teslim takibi gerektirir`,
      )
    }
  })

  it('emanet_teslim geri teslim takibi ÜRETMEZ (emanet takibine gider)', () => {
    assert.equal(
      needsGeriTeslimTakip({ hareket_tipi: 'emanet_teslim', geri_alinmasi_gerekir_mi: true }),
      false,
    )
  })

  it('yeni cihaz teslimi hiçbir takip üretmez', () => {
    assert.equal(needsEmanetTakip({ hareket_tipi: 'yeni_cihaz_teslim', emanet_mi: false, miktar: 3 }), false)
    assert.equal(
      needsGeriTeslimTakip({ hareket_tipi: 'yeni_cihaz_teslim', geri_alinmasi_gerekir_mi: false }),
      false,
    )
  })
})
