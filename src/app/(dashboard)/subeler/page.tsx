import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import { formatCurrency } from '@/lib/finance/formatters'

// Tip badge renkleri
const TIP_CFG: Record<string, { label: string; cls: string }> = {
  merkez: { label: 'Merkez', cls: 'bg-red-50 text-red-700 border-red-200' },
  sube:   { label: 'Şube',   cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  depo:   { label: 'Depo',   cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  ofis:   { label: 'Ofis',   cls: 'bg-purple-50 text-purple-700 border-purple-200' },
}

export default async function SubelerPage() {
  const supabase = createServiceClient()
  const { data: subeler } = await supabase.from('subeler').select('*').order('tip').order('ad')

  // Her şube için özet veriler
  const subeIds = (subeler ?? []).map((s: any) => s.id)

  // Müşteri sayıları
  const { data: musteriCounts } = subeIds.length > 0
    ? await supabase.from('customers').select('sube_id').in('sube_id', subeIds)
    : { data: [] }

  // Giden fatura toplamları (alacak)
  const { data: gidenFaturalar } = subeIds.length > 0
    ? await supabase.from('invoices')
        .select('sube_id, total_amount, paid_amount')
        .eq('invoice_type', 'satis')
        .neq('status', 'iptal')
        .in('sube_id', subeIds)
    : { data: [] }

  // Gelen fatura toplamları (borç)
  const { data: gelenFaturalar } = subeIds.length > 0
    ? await supabase.from('invoices')
        .select('sube_id, total_amount, paid_amount')
        .eq('invoice_type', 'alis')
        .neq('status', 'iptal')
        .in('sube_id', subeIds)
    : { data: [] }

  // Bu ay servis formları
  const thisMonthStart = new Date(); thisMonthStart.setDate(1); thisMonthStart.setHours(0, 0, 0, 0)
  const { data: servisFormlar } = subeIds.length > 0
    ? await supabase.from('service_forms')
        .select('sube_id')
        .in('sube_id', subeIds)
        .gte('created_at', thisMonthStart.toISOString())
    : { data: [] }

  // Per-branch maps
  const musteriMap = new Map<string, number>()
  for (const m of musteriCounts ?? []) {
    const row = m as any
    if (row.sube_id) musteriMap.set(row.sube_id, (musteriMap.get(row.sube_id) ?? 0) + 1)
  }

  type Stats = { alacak: number; borc: number; servis: number }
  const statsMap = new Map<string, Stats>()
  for (const inv of gidenFaturalar ?? []) {
    const row = inv as any
    if (!row.sube_id) continue
    const s = statsMap.get(row.sube_id) ?? { alacak: 0, borc: 0, servis: 0 }
    s.alacak += Math.max(0, (row.total_amount ?? 0) - (row.paid_amount ?? 0))
    statsMap.set(row.sube_id, s)
  }
  for (const inv of gelenFaturalar ?? []) {
    const row = inv as any
    if (!row.sube_id) continue
    const s = statsMap.get(row.sube_id) ?? { alacak: 0, borc: 0, servis: 0 }
    s.borc += Math.max(0, (row.total_amount ?? 0) - (row.paid_amount ?? 0))
    statsMap.set(row.sube_id, s)
  }
  for (const sf of servisFormlar ?? []) {
    const row = sf as any
    if (!row.sube_id) continue
    const s = statsMap.get(row.sube_id) ?? { alacak: 0, borc: 0, servis: 0 }
    s.servis++
    statsMap.set(row.sube_id, s)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#C8102E] rounded-lg flex items-center justify-center text-white font-bold text-sm">K</div>
          <h1 className="text-lg font-bold text-gray-900">Şubeler</h1>
        </div>
        <Link href="/subeler/new" className="bg-[#C8102E] text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-[#a50d26]">
          + Yeni Şube
        </Link>
      </div>

      <div className="p-6 space-y-6">
        {/* Kart grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(subeler ?? []).map((sube: any) => {
            const cfg = TIP_CFG[sube.tip] ?? { label: sube.tip, cls: 'bg-gray-100 text-gray-600 border-gray-200' }
            const stats = statsMap.get(sube.id) ?? { alacak: 0, borc: 0, servis: 0 }
            const net = stats.alacak - stats.borc
            return (
              <div key={sube.id} className={`bg-white border rounded-xl p-5 flex flex-col gap-3 ${!sube.aktif ? 'opacity-60' : ''}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${cfg.cls}`}>{cfg.label}</span>
                      {!sube.aktif && <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Pasif</span>}
                    </div>
                    <h3 className="text-base font-bold text-gray-900">{sube.ad}</h3>
                    <div className="text-sm text-gray-500">{sube.sehir}{sube.ilce ? `, ${sube.ilce}` : ''}</div>
                  </div>
                </div>

                {sube.telefon && <div className="text-sm text-gray-600">📞 {sube.telefon}</div>}
                {sube.yetkili_kisi && <div className="text-sm text-gray-600">👤 {sube.yetkili_kisi}</div>}

                <div className="grid grid-cols-3 gap-2 pt-2 border-t">
                  <div className="text-center">
                    <div className="text-xs text-gray-400">Müşteri</div>
                    <div className="text-sm font-bold text-gray-700">{musteriMap.get(sube.id) ?? 0}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-400">Alacak</div>
                    <div className="text-sm font-bold text-orange-600">{formatCurrency(stats.alacak)}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-gray-400">Net</div>
                    <div className={`text-sm font-bold ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(net)}</div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Link href={`/subeler/${sube.id}`} className="flex-1 text-center text-xs bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200">
                    Detay →
                  </Link>
                  <Link href={`/subeler/${sube.id}/edit`} className="text-xs border text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50">
                    Düzenle
                  </Link>
                </div>
              </div>
            )
          })}
          {(!subeler || subeler.length === 0) && (
            <div className="col-span-3 text-center py-16 text-gray-400 text-sm">
              Henüz şube eklenmemiş. <Link href="/subeler/new" className="text-[#C8102E] hover:underline">Ekle →</Link>
            </div>
          )}
        </div>

        {/* Karşılaştırmalı tablo */}
        {(subeler ?? []).length > 0 && (
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-700">Şube Karşılaştırması</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Şube</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Müşteri</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Alacak</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Borç</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Net</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-gray-500">Bu Ay Servis</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(subeler ?? []).map((sube: any) => {
                    const stats = statsMap.get(sube.id) ?? { alacak: 0, borc: 0, servis: 0 }
                    const net = stats.alacak - stats.borc
                    return (
                      <tr key={sube.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <Link href={`/subeler/${sube.id}`} className="font-medium text-gray-900 hover:text-[#C8102E] hover:underline">{sube.ad}</Link>
                          <span className="text-xs text-gray-400 ml-2">{sube.sehir}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-700">{musteriMap.get(sube.id) ?? 0}</td>
                        <td className="px-4 py-2.5 text-right text-orange-600 font-medium">{formatCurrency(stats.alacak)}</td>
                        <td className="px-4 py-2.5 text-right text-red-600 font-medium">{formatCurrency(stats.borc)}</td>
                        <td className={`px-4 py-2.5 text-right font-bold ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(net)}</td>
                        <td className="px-4 py-2.5 text-right text-gray-700">{stats.servis}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
