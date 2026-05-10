import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import { OnKaydaAktarClient } from './OnKaydaAktarClient'

type TeslimatJoin = {
  id?: string | null
  teslimat_no?: string | null
  teslimat_tarihi?: string | null
  durum?: string | null
  customers?: { full_name?: string | null } | null
}

function kalemMarker(notlar: string | null | undefined) {
  return String(notlar ?? '').match(/Teslimat kalemi: ([0-9a-f-]+)/i)?.[1] ?? null
}

export default async function OnKaydaAktarPage() {
  const supabase = createServiceClient()
  const [{ data: kalemler }, { data: onKayitlar }] = await Promise.all([
    supabase
      .from('teslimat_kalemleri')
      .select('*, teslimatlar(id, teslimat_no, teslimat_tarihi, durum, customers(full_name))')
      .eq('faturalanir_mi', true)
      .gt('toplam_tutar', 0)
      .order('created_at', { ascending: false })
      .limit(300),
    supabase
      .from('on_kayitlar')
      .select('id, aciklama, notlar')
      .ilike('notlar', '%Teslimat kalemi:%')
      .limit(1000),
  ])

  const aktarilanKalemler = new Set((onKayitlar ?? []).map(k => kalemMarker(k.notlar)).filter(Boolean))
  const aktarilanAciklamalar = new Map((onKayitlar ?? []).map(k => [k.aciklama, k.id]))
  const rows = (kalemler ?? [])
    .filter(row => {
      const teslimat = row.teslimatlar as TeslimatJoin | null
      const aciklama = `${teslimat?.teslimat_no} - ${row.aciklama}`
      return teslimat?.durum === 'tamamlandi' && !aktarilanKalemler.has(row.id) && !aktarilanAciklamalar.has(aciklama)
    })
    .map(row => {
      const teslimat = row.teslimatlar as TeslimatJoin | null
      const tutar = Number(row.toplam_tutar ?? 0)
      let durum = 'Hazır'
      if (!teslimat?.customers?.full_name) durum = 'Müşteri kontrolü gerekli'
      if (tutar <= 0) durum = 'Tutar kontrolü gerekli'

      return {
        id: row.id,
        teslimat_id: teslimat?.id ?? '',
        teslimat_no: teslimat?.teslimat_no ?? '-',
        teslimat_tarihi: teslimat?.teslimat_tarihi ?? null,
        teslimat_durum: teslimat?.durum ?? '-',
        customer_name: teslimat?.customers?.full_name ?? '-',
        aciklama: row.aciklama,
        miktar: Number(row.miktar ?? 0),
        birim: row.birim ?? 'adet',
        birim_fiyat: Number(row.birim_fiyat ?? 0),
        toplam_tutar: tutar,
        durum,
      }
    })

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/teslimatlar" className="text-sm text-gray-500 hover:text-gray-700">← Teslimatlara dön</Link>
          <h1 className="mt-1 text-xl font-bold">Ön kayda aktarılacaklar</h1>
          <p className="text-sm text-gray-500">Kontrol edilip düzenlenebilen ve manuel ön kayda aktarılabilen teslimat kalemleri.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/cari-hesap/on-kayitlar/yeni" className="rounded-md border px-3 py-2 text-sm text-[#C8102E]">Manuel ön kayıt</Link>
          <Link href="/cari-hesap/on-kayitlar" className="rounded-md border px-3 py-2 text-sm text-[#C8102E]">Cari ön kayıtlar</Link>
        </div>
      </div>

      <OnKaydaAktarClient rows={rows} />
    </div>
  )
}
