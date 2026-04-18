'use client'

import { useState, useEffect, useMemo } from 'react'

type Hammadde = {
  id: string; ad: string; birim: string
  mevcut_stok: number; birim_maliyet: number; kategori: string
}

type Emir = {
  id: string; emir_no: string; durum: string; miktar: number
  urunler: { id: string; ad: string; kdv_haric_fiyat: number } | null
  planlanan_baslangic: string | null; planlanan_bitis: string | null
  gercek_baslangic: string | null; gercek_bitis: string | null
}

type Hareket = {
  id: string; hareket_tipi: string; kaynak: string
  kaynak_id: string; kaynak_adi: string; miktar: number; tarih: string
}

type ReceteItem = {
  id: string; urun_id: string; hammadde_id: string; miktar: number; birim: string
  hammaddeler: Hammadde
  urunler?: { id: string; ad: string; kdv_haric_fiyat: number }
}

type RaporId = 'stok-deger' | 'verimlilik' | 'tuketim' | 'maliyet'

const RAPORLAR: { id: RaporId; baslik: string; desc: string; emoji: string }[] = [
  { id: 'stok-deger',  baslik: 'Stok Değer Raporu',       desc: 'Tüm hammaddelerin anlık değeri', emoji: '📦' },
  { id: 'verimlilik', baslik: 'Üretim Verimliliği',       desc: 'Planlanan vs gerçekleşen süre',   emoji: '⏱' },
  { id: 'tuketim',    baslik: 'Hammadde Tüketim Raporu',  desc: 'Dönemsel hammadde kullanımı',     emoji: '📊' },
  { id: 'maliyet',    baslik: 'Maliyet Analizi',          desc: 'Ürün bazında maliyet vs satış',   emoji: '💰' },
]

export default function Raporlar() {
  const [aktif, setAktif] = useState<RaporId>('stok-deger')
  const [hammaddeler, setHammaddeler] = useState<Hammadde[]>([])
  const [emirler, setEmirleri] = useState<Emir[]>([])
  const [hareketler, setHareketler] = useState<Hareket[]>([])
  const [receteler, setReceteler] = useState<ReceteItem[]>([])
  const [urunler, setUrunler] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const [tuketimBas, setTuketimBas] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]
  })
  const [tuketimBit, setTuketimBit] = useState(() => new Date().toISOString().split('T')[0])

  useEffect(() => {
    Promise.all([
      fetch('/api/fabrika/hammaddeler').then(r => r.json()),
      fetch('/api/fabrika/uretim-emirleri').then(r => r.json()),
      fetch('/api/fabrika/depo-hareketleri?limit=500').then(r => r.json()),
      fetch('/api/fabrika/receteler').then(r => r.json()),
      fetch('/api/fabrika/urunler').then(r => r.json()),
    ]).then(([h, e, dh, rec, u]) => {
      setHammaddeler(Array.isArray(h) ? h : [])
      setEmirleri(Array.isArray(e) ? e : [])
      setHareketler(Array.isArray(dh) ? dh : [])
      setReceteler(Array.isArray(rec) ? rec : [])
      setUrunler(Array.isArray(u) ? u : [])
    }).catch(err => {
      console.error('Raporlar yükleme hatası:', err)
    }).finally(() => {
      setLoading(false)
    })
  }, [])

  // ── Rapor 1: Stok Değer ────────────────────────────────
  const stokDegerData = useMemo(() => {
    return hammaddeler
      .map(h => ({ ...h, toplam: Number(h.mevcut_stok) * Number(h.birim_maliyet) }))
      .sort((a, b) => b.toplam - a.toplam)
  }, [hammaddeler])

  const toplamStokDeger = stokDegerData.reduce((s, h) => s + h.toplam, 0)
  const maxDeger = stokDegerData[0]?.toplam ?? 1

  // ── Rapor 2: Verimlilik ─────────────────────────────────
  const verimlilikData = useMemo(() => {
    return emirler
      .filter(e => e.durum === 'tamamlandı' && e.gercek_bitis)
      .map(e => {
        const planGun = e.planlanan_baslangic && e.planlanan_bitis
          ? Math.ceil((new Date(e.planlanan_bitis).getTime() - new Date(e.planlanan_baslangic).getTime()) / 86400000)
          : null
        const gercekGun = e.gercek_baslangic && e.gercek_bitis
          ? Math.ceil((new Date(e.gercek_bitis).getTime() - new Date(e.gercek_baslangic).getTime()) / 86400000)
          : null
        const gecikme = planGun !== null && gercekGun !== null ? gercekGun - planGun : null
        return { ...e, planGun, gercekGun, gecikme }
      })
  }, [emirler])

  const gecikmisMirleri = emirler.filter(e =>
    e.durum === 'planlandı' || e.durum === 'üretimde'
    && e.planlanan_bitis
    && new Date(e.planlanan_bitis) < new Date()
  )

  // ── Rapor 3: Tüketim ───────────────────────────────────
  const tuketimData = useMemo(() => {
    const filtered = hareketler.filter(h =>
      h.kaynak === 'hammadde' && h.hareket_tipi === 'cikis'
      && h.tarih >= tuketimBas && h.tarih <= tuketimBit
    )
    const map = new Map<string, { adi: string; toplam: number; birim: string }>()
    filtered.forEach(h => {
      const hm = hammaddeler.find(hm => hm.id === h.kaynak_id)
      const key = h.kaynak_id
      const ex = map.get(key) ?? { adi: h.kaynak_adi, toplam: 0, birim: hm?.birim ?? '' }
      ex.toplam += Number(h.miktar)
      map.set(key, ex)
    })
    return Array.from(map.values()).sort((a, b) => b.toplam - a.toplam)
  }, [hareketler, hammaddeler, tuketimBas, tuketimBit])

  const maxTuketim = tuketimData[0]?.toplam ?? 1

  // ── Rapor 4: Maliyet ───────────────────────────────────
  const maliyetData = useMemo(() => {
    return urunler.map(u => {
      const urRecete = receteler.filter(r => r.urun_id === u.id)
      const hammaddeMaliyet = urRecete.reduce((s, r) => {
        return s + Number(r.miktar) * Number(r.hammaddeler?.birim_maliyet ?? 0)
      }, 0)
      const satisFiyati = Number(u.kdv_haric_fiyat)
      const karMarji = satisFiyati > 0 ? ((satisFiyati - hammaddeMaliyet) / satisFiyati * 100) : 0
      return { ...u, hammaddeMaliyet, satisFiyati, karMarji, receteSayisi: urRecete.length }
    }).filter(u => u.receteSayisi > 0)
      .sort((a, b) => b.karMarji - a.karMarji)
  }, [urunler, receteler])

  if (loading) return <div className="p-6 text-sm text-gray-400">Yükleniyor...</div>

  return (
    <div className="p-6 space-y-6">
      {/* Rapor seçici */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {RAPORLAR.map(r => (
          <button key={r.id} onClick={() => setAktif(r.id)}
            className={`text-left p-4 rounded-xl border transition-colors ${
              aktif === r.id
                ? 'border-[#C8102E] bg-red-50'
                : 'bg-white hover:border-gray-300 hover:bg-gray-50'
            }`}>
            <div className="text-2xl mb-2">{r.emoji}</div>
            <div className={`text-sm font-semibold ${aktif === r.id ? 'text-[#C8102E]' : 'text-gray-800'}`}>
              {r.baslik}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">{r.desc}</div>
          </button>
        ))}
      </div>

      {/* Rapor içeriği */}
      {aktif === 'stok-deger' && (
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50 flex justify-between items-center">
            <span className="font-semibold text-sm">Hammadde Stok Değerleri</span>
            <span className="font-bold text-[#C8102E]">
              Toplam: ₺{toplamStokDeger.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="divide-y">
            {stokDegerData.map(h => (
              <div key={h.id} className="px-5 py-3">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-sm font-medium">{h.ad}</span>
                  <span className="text-sm font-bold">
                    ₺{h.toplam.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div className="bg-[#C8102E] h-2 rounded-full transition-all"
                      style={{ width: `${(h.toplam / maxDeger) * 100}%` }} />
                  </div>
                  <span className="text-xs text-gray-400 w-40 text-right">
                    {Number(h.mevcut_stok).toLocaleString('tr-TR')} {h.birim} × ₺{Number(h.birim_maliyet).toLocaleString('tr-TR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {aktif === 'verimlilik' && (
        <div className="space-y-4">
          {gecikmisMirleri.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="font-semibold text-red-700 mb-2">⚠ Geciken Emirler ({gecikmisMirleri.length})</div>
              {gecikmisMirleri.map(e => (
                <div key={e.id} className="text-sm text-red-700">
                  {e.emir_no} — {e.urunler?.ad} — Pl. Bitiş: {e.planlanan_bitis}
                </div>
              ))}
            </div>
          )}
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b bg-gray-50 font-semibold text-sm">Tamamlanan Emirler — Süre Karşılaştırması</div>
            {verimlilikData.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400">Tamamlanmış emir yok</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase border-b">
                  <tr>
                    <th className="px-4 py-2 text-left">Emir No</th>
                    <th className="px-4 py-2 text-left">Ürün</th>
                    <th className="px-4 py-2 text-right">Plan (gün)</th>
                    <th className="px-4 py-2 text-right">Gerçek (gün)</th>
                    <th className="px-4 py-2 text-right">Fark</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {verimlilikData.map(e => (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs">{e.emir_no}</td>
                      <td className="px-4 py-2">{e.urunler?.ad ?? '—'}</td>
                      <td className="px-4 py-2 text-right">{e.planGun ?? '—'}</td>
                      <td className="px-4 py-2 text-right">{e.gercekGun ?? '—'}</td>
                      <td className={`px-4 py-2 text-right font-medium ${
                        e.gecikme === null ? 'text-gray-400' :
                        e.gecikme > 0 ? 'text-red-600' : 'text-green-600'
                      }`}>
                        {e.gecikme === null ? '—' : e.gecikme > 0 ? `+${e.gecikme} gün` : e.gecikme === 0 ? 'Zamanında' : `${e.gecikme} gün`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {aktif === 'tuketim' && (
        <div className="space-y-4">
          <div className="flex gap-3 items-center">
            <label className="text-sm text-gray-600">Dönem:</label>
            <input type="date" value={tuketimBas} onChange={e => setTuketimBas(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
            <span className="text-gray-400">—</span>
            <input type="date" value={tuketimBit} onChange={e => setTuketimBit(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C8102E]" />
          </div>
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b bg-gray-50 font-semibold text-sm">Hammadde Tüketimi</div>
            {tuketimData.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400">Bu dönemde tüketim kaydı yok</div>
            ) : (
              <div className="divide-y">
                {tuketimData.map(t => (
                  <div key={t.adi} className="px-5 py-3">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-sm font-medium">{t.adi}</span>
                      <span className="text-sm font-bold">{t.toplam.toLocaleString('tr-TR')} {t.birim}</span>
                    </div>
                    <div className="bg-gray-100 rounded-full h-2">
                      <div className="bg-blue-500 h-2 rounded-full"
                        style={{ width: `${(t.toplam / maxTuketim) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {aktif === 'maliyet' && (
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b bg-gray-50 font-semibold text-sm">
            Ürün Bazında Maliyet vs Satış Fiyatı
          </div>
          {maliyetData.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">
              Reçete tanımlanmış ürün yok
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase border-b">
                <tr>
                  <th className="px-4 py-2 text-left">Ürün</th>
                  <th className="px-4 py-2 text-right">Hammadde Maliyeti</th>
                  <th className="px-4 py-2 text-right">Satış Fiyatı (KDV Hariç)</th>
                  <th className="px-4 py-2 text-right">Kar Marjı</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {maliyetData.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{u.ad}</td>
                    <td className="px-4 py-3 text-right">
                      {u.hammaddeMaliyet > 0
                        ? `₺${u.hammaddeMaliyet.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {u.satisFiyati > 0
                        ? `₺${u.satisFiyati.toLocaleString('tr-TR', { minimumFractionDigits: 2 })}`
                        : '—'}
                    </td>
                    <td className={`px-4 py-3 text-right font-bold ${
                      u.karMarji >= 30 ? 'text-green-600' :
                      u.karMarji >= 10 ? 'text-amber-600' :
                      u.karMarji >= 0  ? 'text-orange-600' : 'text-red-600'
                    }`}>
                      %{u.karMarji.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
