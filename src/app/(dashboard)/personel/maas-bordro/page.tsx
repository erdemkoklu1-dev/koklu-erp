'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatTRDate } from '@/lib/finance/formatters'
import { ChevronLeft, Download, Check } from 'lucide-react'

type Personel = {
  id: string; ad: string; soyad: string; sicil_no: string | null
  pozisyon: string | null; maas: number | null; iban: string | null
  banka_adi: string | null; durum: string
  subeler: { ad: string } | null
}

type MaasOdeme = {
  id: string; personel_id: string; odeme_donemi: string; brut_maas: number
  sgk_isci_payi: number; sgk_isveren_payi: number; gelir_vergisi: number
  damga_vergisi: number; net_maas: number; mesai_ucreti: number
  ikramiye: number; toplam_odenen: number; odendi: boolean
}

function hesaplaMaas(brut: number) {
  const sgkIsci    = Math.round(brut * 0.14 * 100) / 100
  const sgkIsveren = Math.round(brut * 0.205 * 100) / 100
  const matrah = brut - sgkIsci
  let gv = 0
  if (matrah <= 110000) gv = matrah * 0.15
  else if (matrah <= 230000) gv = 16500 + (matrah - 110000) * 0.20
  else if (matrah <= 870000) gv = 40500 + (matrah - 230000) * 0.27
  else if (matrah <= 3000000) gv = 213300 + (matrah - 870000) * 0.35
  else gv = 958800 + (matrah - 3000000) * 0.40
  gv = Math.round(gv * 100) / 100
  const damga = Math.round(brut * 0.00759 * 100) / 100
  const net = Math.round((brut - sgkIsci - gv - damga) * 100) / 100
  return { sgkIsci, sgkIsveren, gv, damga, net }
}

const thCls = 'px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide'
const tdCls = 'px-3 py-3 text-sm'

export default function MaasBordroPage() {
  const supabase = createClient()
  const now = new Date()
  const [donem, setDonem] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const [personeller, setPersoneller] = useState<Personel[]>([])
  const [mevcut, setMevcut] = useState<MaasOdeme[]>([])
  const [loading, setLoading] = useState(true)
  const [topluOdeLoading, setTopluOdeLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      supabase.from('personeller')
        .select('id, ad, soyad, sicil_no, pozisyon, maas, iban, banka_adi, durum, subeler(ad)')
        .eq('durum', 'aktif')
        .order('ad'),
      supabase.from('maas_odemeleri')
        .select('*')
        .eq('odeme_donemi', donem),
    ]).then(([{ data: p }, { data: m }]) => {
      const ps = (p ?? []).map((r: any) => ({
        ...r,
        subeler: Array.isArray(r.subeler) ? (r.subeler[0] ?? null) : r.subeler,
      }))
      setPersoneller(ps)
      setMevcut(m ?? [])
      setLoading(false)
    })
  }, [donem])

  const mevcutMap = useMemo(() => {
    const map = new Map<string, MaasOdeme>()
    mevcut.forEach(m => map.set(m.personel_id, m))
    return map
  }, [mevcut])

  const satirlar = useMemo(() => {
    return personeller.map(p => {
      const brut = p.maas ?? 0
      const { sgkIsci, sgkIsveren, gv, damga, net } = hesaplaMaas(brut)
      const odeme = mevcutMap.get(p.id)
      return { personel: p, brut, sgkIsci, sgkIsveren, gv, damga, net, odeme }
    })
  }, [personeller, mevcutMap])

  const toplamBrut     = satirlar.reduce((s, r) => s + r.brut, 0)
  const toplamNet      = satirlar.reduce((s, r) => s + r.net, 0)
  const toplamIsveren  = satirlar.reduce((s, r) => s + r.brut + r.sgkIsveren, 0)

  async function odemeKaydet(personelId: string, brut: number) {
    if (brut === 0) return
    const { sgkIsci, sgkIsveren, gv, damga, net } = hesaplaMaas(brut)
    const { data } = await supabase.from('maas_odemeleri').insert([{
      personel_id: personelId,
      odeme_donemi: donem,
      brut_maas: brut,
      sgk_isci_payi: sgkIsci,
      sgk_isveren_payi: sgkIsveren,
      gelir_vergisi: gv,
      damga_vergisi: damga,
      net_maas: net,
      mesai_ucreti: 0, ikramiye: 0, kesinti: 0,
      toplam_odenen: net,
    }]).select('*').single()
    if (data) setMevcut(prev => [...prev.filter(m => m.personel_id !== personelId), data as any])
  }

  async function toggleOdendi(id: string, odendi: boolean) {
    await supabase.from('maas_odemeleri').update({ odendi: !odendi, odeme_tarihi: !odendi ? new Date().toISOString().split('T')[0] : null }).eq('id', id)
    setMevcut(prev => prev.map(m => m.id === id ? { ...m, odendi: !odendi } : m))
  }

  async function topluOde() {
    setTopluOdeLoading(true)
    const bekleyenler = satirlar.filter(r => !r.odeme && r.brut > 0)
    for (const r of bekleyenler) await odemeKaydet(r.personel.id, r.brut)
    setTopluOdeLoading(false)
  }

  function handlePrint() { window.print() }

  return (
    <div className="p-6 max-w-screen-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/personel" className="text-gray-400 hover:text-gray-600"><ChevronLeft size={20} /></Link>
        <h1 className="text-xl font-bold text-gray-900">Maaş Bordrosu</h1>
      </div>

      {/* Kontroller */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap items-center gap-4">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Dönem</label>
          <input type="month" value={donem} onChange={e => setDonem(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
        </div>
        <div className="flex-1 flex items-center justify-end gap-3">
          <button onClick={topluOde} disabled={topluOdeLoading}
            className="flex items-center gap-2 bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
            <Check size={15} /> {topluOdeLoading ? 'İşleniyor...' : 'Tümünü Hesapla'}
          </button>
          <button onClick={handlePrint} className="flex items-center gap-2 border px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
            <Download size={15} /> Yazdır / PDF
          </button>
        </div>
      </div>

      {/* Özet */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Toplam Brüt', val: toplamBrut, cls: 'text-gray-800' },
          { label: 'Toplam Net',  val: toplamNet,  cls: 'text-green-600' },
          { label: 'Toplam İşveren Maliyeti', val: toplamIsveren, cls: 'text-[#C8102E]' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-400 mb-1">{s.label}</p>
            <p className={`text-xl font-bold ${s.cls}`}>{formatCurrency(s.val)}</p>
          </div>
        ))}
      </div>

      {/* Tablo */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400 text-sm">Yükleniyor...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className={thCls}>Personel</th>
                  <th className={thCls + ' text-right'}>Brüt</th>
                  <th className={thCls + ' text-right'}>SGK İşçi</th>
                  <th className={thCls + ' text-right'}>Gel. Verg.</th>
                  <th className={thCls + ' text-right'}>Damga</th>
                  <th className={thCls + ' text-right'}>Net</th>
                  <th className={thCls + ' text-right'}>İşveren</th>
                  <th className={thCls}>Durum</th>
                  <th className={thCls}></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {satirlar.map(({ personel: p, brut, sgkIsci, gv, damga, net, sgkIsveren, odeme }) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className={tdCls}>
                      <div>
                        <Link href={`/personel/${p.id}`} className="font-medium text-gray-900 hover:text-[#C8102E]">{p.ad} {p.soyad}</Link>
                        <p className="text-xs text-gray-400">{p.pozisyon ?? ''} {p.subeler ? `· ${p.subeler.ad}` : ''}</p>
                      </div>
                    </td>
                    <td className={tdCls + ' text-right font-medium'}>{formatCurrency(brut)}</td>
                    <td className={tdCls + ' text-right text-orange-600'}>{formatCurrency(sgkIsci)}</td>
                    <td className={tdCls + ' text-right text-orange-600'}>{formatCurrency(gv)}</td>
                    <td className={tdCls + ' text-right text-orange-600'}>{formatCurrency(damga)}</td>
                    <td className={tdCls + ' text-right font-bold text-green-600'}>{formatCurrency(net)}</td>
                    <td className={tdCls + ' text-right text-gray-500'}>{formatCurrency(brut + sgkIsveren)}</td>
                    <td className={tdCls}>
                      {odeme
                        ? <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${odeme.odendi ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                            {odeme.odendi ? 'Ödendi' : 'Hesaplandı'}
                          </span>
                        : <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Bekleniyor</span>
                      }
                    </td>
                    <td className={tdCls}>
                      {!odeme && brut > 0 && (
                        <button onClick={() => odemeKaydet(p.id, brut)} className="text-xs text-[#C8102E] hover:underline">Hesapla</button>
                      )}
                      {odeme && !odeme.odendi && (
                        <button onClick={() => toggleOdendi(odeme.id, false)} className="text-xs text-green-600 hover:underline">Ödendi İşaretle</button>
                      )}
                      {odeme && odeme.odendi && (
                        <button onClick={() => toggleOdendi(odeme.id, true)} className="text-xs text-gray-400 hover:underline">Geri Al</button>
                      )}
                    </td>
                  </tr>
                ))}
                {satirlar.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400">Aktif personel bulunamadı.</td></tr>
                )}
              </tbody>
              <tfoot className="border-t bg-gray-50">
                <tr>
                  <td className={tdCls + ' font-bold text-gray-800'}>Toplam ({satirlar.length} personel)</td>
                  <td className={tdCls + ' text-right font-bold'}>{formatCurrency(toplamBrut)}</td>
                  <td className={tdCls + ' text-right text-orange-600 font-medium'}>{formatCurrency(satirlar.reduce((s, r) => s + r.sgkIsci, 0))}</td>
                  <td className={tdCls + ' text-right text-orange-600 font-medium'}>{formatCurrency(satirlar.reduce((s, r) => s + r.gv, 0))}</td>
                  <td className={tdCls + ' text-right text-orange-600 font-medium'}>{formatCurrency(satirlar.reduce((s, r) => s + r.damga, 0))}</td>
                  <td className={tdCls + ' text-right font-bold text-green-600'}>{formatCurrency(toplamNet)}</td>
                  <td className={tdCls + ' text-right font-bold text-[#C8102E]'}>{formatCurrency(toplamIsveren)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
