'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { formatCurrency, formatTRDate } from '@/lib/finance/formatters'
import { Users, UserCheck, CalendarOff, Wallet, Search, Plus } from 'lucide-react'

type Personel = {
  id: string; sicil_no: string | null; ad: string; soyad: string
  sube_id: string | null; pozisyon: string | null; departman: string | null
  istihdam_tipi: string | null; ise_baslama_tarihi: string | null
  durum: string; subeler: { ad: string } | null
}
type Sube = { id: string; ad: string }
type Ozet = { toplamPersonel: number; aktifPersonel: number; bugunIzinli: number; buAyMaasTopla: number }

const DURUM_CFG: Record<string, { label: string; cls: string }> = {
  aktif:   { label: 'Aktif',   cls: 'bg-green-100 text-green-700 border border-green-200' },
  izinli:  { label: 'İzinli',  cls: 'bg-blue-100 text-blue-700 border border-blue-200' },
  deneme:  { label: 'Deneme',  cls: 'bg-yellow-100 text-yellow-700 border border-yellow-200' },
  istifa:  { label: 'İstifa',  cls: 'bg-red-100 text-red-700 border border-red-200' },
  cikis:   { label: 'Çıkış',   cls: 'bg-gray-100 text-gray-600 border border-gray-200' },
}

const ISTIHDAM_LABEL: Record<string, string> = {
  tam_zamanli: 'Tam Zamanlı',
  yari_zamanli: 'Yarı Zamanlı',
  sozlesmeli: 'Sözleşmeli',
  stajyer: 'Stajyer',
}

export default function PersonelListeClient({ personeller, subeler, ozet }: {
  personeller: Personel[]; subeler: Sube[]; ozet: Ozet
}) {
  const [ara, setAra]             = useState('')
  const [subeFiltre, setSubeFiltre] = useState('')
  const [durumFiltre, setDurumFiltre] = useState('')
  const [istihdamFiltre, setIstihdamFiltre] = useState('')
  const [departmanFiltre, setDepartmanFiltre] = useState('')

  const departmanlar = useMemo(() => {
    const set = new Set<string>()
    personeller.forEach(p => { if (p.departman) set.add(p.departman) })
    return Array.from(set).sort()
  }, [personeller])

  const filtrelenmis = useMemo(() => {
    const q = ara.toLowerCase()
    return personeller.filter(p => {
      if (q && !`${p.ad} ${p.soyad}`.toLowerCase().includes(q) && !(p.sicil_no?.toLowerCase().includes(q))) return false
      if (subeFiltre && p.sube_id !== subeFiltre) return false
      if (durumFiltre && p.durum !== durumFiltre) return false
      if (istihdamFiltre && p.istihdam_tipi !== istihdamFiltre) return false
      if (departmanFiltre && p.departman !== departmanFiltre) return false
      return true
    })
  }, [personeller, ara, subeFiltre, durumFiltre, istihdamFiltre, departmanFiltre])

  const thCls = 'px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide'
  const tdCls = 'px-4 py-3 text-sm text-gray-700'

  return (
    <div className="p-6 space-y-6 max-w-screen-xl mx-auto">
      {/* Başlık */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Personel</h1>
          <p className="text-sm text-gray-500 mt-1">İnsan Kaynakları Yönetimi</p>
        </div>
        <Link href="/personel/new" className="flex items-center gap-2 bg-[#C8102E] text-white px-4 py-2.5 rounded-lg font-medium hover:bg-red-700 transition-colors text-sm">
          <Plus size={16} /> Yeni Personel
        </Link>
      </div>

      {/* Özet Kartlar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard icon={<Users size={20} className="text-blue-600" />} label="Toplam Personel" value={ozet.toplamPersonel.toString()} bg="bg-blue-50" />
        <SummaryCard icon={<UserCheck size={20} className="text-green-600" />} label="Aktif Personel" value={ozet.aktifPersonel.toString()} bg="bg-green-50" />
        <SummaryCard icon={<CalendarOff size={20} className="text-orange-600" />} label="Bugün İzinli" value={ozet.bugunIzinli.toString()} bg="bg-orange-50" />
        <SummaryCard icon={<Wallet size={20} className="text-purple-600" />} label="Bu Ay Ödenecek" value={formatCurrency(ozet.buAyMaasTopla)} bg="bg-purple-50" />
      </div>

      {/* Filtreler */}
      <div className="bg-white rounded-xl border p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative lg:col-span-2">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={ara} onChange={e => setAra(e.target.value)}
              placeholder="Ad soyad veya sicil no..."
              className="w-full pl-8 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
          <select value={subeFiltre} onChange={e => setSubeFiltre(e.target.value)} className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500">
            <option value="">Tüm Şubeler</option>
            {subeler.map(s => <option key={s.id} value={s.id}>{s.ad}</option>)}
          </select>
          <select value={durumFiltre} onChange={e => setDurumFiltre(e.target.value)} className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500">
            <option value="">Tüm Durumlar</option>
            {Object.entries(DURUM_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={istihdamFiltre} onChange={e => setIstihdamFiltre(e.target.value)} className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500">
            <option value="">Tüm İstihdam</option>
            {Object.entries(ISTIHDAM_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {departmanlar.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => setDepartmanFiltre('')} className={`text-xs px-3 py-1 rounded-full border transition-colors ${!departmanFiltre ? 'bg-[#C8102E] text-white border-red-600' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>Tümü</button>
            {departmanlar.map(d => (
              <button key={d} onClick={() => setDepartmanFiltre(d === departmanFiltre ? '' : d)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${departmanFiltre === d ? 'bg-[#C8102E] text-white border-red-600' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {d}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tablo */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
          <p className="text-sm text-gray-500">{filtrelenmis.length} personel</p>
          <Link href="/personel/maas-bordro" className="text-xs text-[#C8102E] hover:underline font-medium">Maaş Bordrosu →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b">
              <tr>
                <th className={thCls}>Sicil No</th>
                <th className={thCls}>Ad Soyad</th>
                <th className={thCls}>Şube</th>
                <th className={thCls}>Pozisyon</th>
                <th className={thCls}>İstihdam</th>
                <th className={thCls}>İşe Başlama</th>
                <th className={thCls}>Durum</th>
                <th className={thCls}></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtrelenmis.map(p => {
                const durum = DURUM_CFG[p.durum] ?? { label: p.durum, cls: 'bg-gray-100 text-gray-600' }
                return (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className={`${tdCls} font-mono text-xs text-gray-500`}>{p.sicil_no ?? '-'}</td>
                    <td className={tdCls}>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-[#C8102E] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                          {p.ad[0]}{p.soyad[0]}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{p.ad} {p.soyad}</p>
                          {p.departman && <p className="text-xs text-gray-400">{p.departman}</p>}
                        </div>
                      </div>
                    </td>
                    <td className={tdCls}>{p.subeler?.ad ?? '-'}</td>
                    <td className={tdCls}>{p.pozisyon ?? '-'}</td>
                    <td className={tdCls}>{ISTIHDAM_LABEL[p.istihdam_tipi ?? ''] ?? p.istihdam_tipi ?? '-'}</td>
                    <td className={tdCls}>{formatTRDate(p.ise_baslama_tarihi)}</td>
                    <td className={tdCls}>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${durum.cls}`}>{durum.label}</span>
                    </td>
                    <td className={tdCls}>
                      <Link href={`/personel/${p.id}`} className="text-xs text-[#C8102E] hover:underline font-medium">Detay →</Link>
                    </td>
                  </tr>
                )
              })}
              {filtrelenmis.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400 text-sm">Personel bulunamadı.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ icon, label, value, bg }: { icon: React.ReactNode; label: string; value: string; bg: string }) {
  return (
    <div className={`${bg} rounded-xl p-4 border border-white`}>
      <div className="flex items-center gap-2 mb-1">{icon}<p className="text-xs text-gray-500 font-medium">{label}</p></div>
      <p className="text-xl font-bold text-gray-900">{value}</p>
    </div>
  )
}
