import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import { formatTRDate } from '@/lib/finance/formatters'

type TeslimatKalemRow = {
  id: string
  aciklama: string | null
  toplam_tutar: number | null
  teslimatlar?: {
    teslimat_no?: string | null
    durum?: string | null
  } | null
}

type SubeJoin = { ad?: string | null }
type CustomerJoin = { full_name?: string | null }

function kalemMarker(notlar: string | null | undefined) {
  return String(notlar ?? '').match(/Teslimat kalemi: ([0-9a-f-]+)/i)?.[1] ?? null
}

function Card({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link href={href} className="rounded-lg border bg-white p-4 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700">
      <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</div>
      <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">{label}</div>
    </Link>
  )
}

export default async function TeslimatlarPage() {
  const supabase = createServiceClient()
  const today = new Date().toISOString().slice(0, 10)
  const tenDaysAgoDate = new Date()
  tenDaysAgoDate.setDate(tenDaysAgoDate.getDate() - 10)
  const tenDaysAgo = tenDaysAgoDate.toISOString().slice(0, 10)

  const [
    { count: todayCount },
    { count: sevkteCount },
    { count: emanetCount },
    { count: bekleyenCount },
    { count: gecikenGeriCount },
    { count: gecikenEmanetCount },
    { data: onKayitKalemler },
    { data: onKayitlar },
    { data: sonTeslimatlar },
    { data: subeRows },
  ] = await Promise.all([
    supabase.from('teslimatlar').select('*', { count: 'exact', head: true }).eq('teslimat_tarihi', today),
    supabase.from('teslimatlar').select('*', { count: 'exact', head: true }).eq('durum', 'sevkte'),
    supabase.from('emanet_takipleri').select('*', { count: 'exact', head: true }).in('durum', ['acik', 'kismi_kapandi']),
    supabase.from('geri_teslim_takipleri').select('*', { count: 'exact', head: true }).in('durum', ['bekliyor', 'kismi_teslim']),
    supabase.from('geri_teslim_takipleri').select('*', { count: 'exact', head: true }).in('durum', ['bekliyor', 'kismi_teslim']).lt('created_at', tenDaysAgo),
    supabase.from('emanet_takipleri').select('*', { count: 'exact', head: true }).in('durum', ['acik', 'kismi_kapandi']).lt('created_at', tenDaysAgo),
    supabase
      .from('teslimat_kalemleri')
      .select('id, aciklama, toplam_tutar, teslimatlar(teslimat_no, durum)')
      .eq('faturalanir_mi', true)
      .gt('toplam_tutar', 0)
      .limit(300),
    supabase
      .from('on_kayitlar')
      .select('id, aciklama, notlar')
      .ilike('notlar', '%Teslimat kalemi:%')
      .limit(1000),
    supabase.from('teslimatlar').select('id, teslimat_no, teslimat_tarihi, durum, customers(full_name), subeler(ad)').order('created_at', { ascending: false }).limit(8),
    supabase.from('teslimatlar').select('sube_id, subeler(ad), durum').neq('durum', 'tamamlandi'),
  ])

  const aktarilanKalemler = new Set((onKayitlar ?? []).map(k => kalemMarker(k.notlar)).filter(Boolean))
  const aktarilanAciklamalar = new Set((onKayitlar ?? []).map(k => k.aciklama).filter(Boolean))
  const onKayitCount = ((onKayitKalemler ?? []) as TeslimatKalemRow[]).filter(row => {
    const teslimat = row.teslimatlar
    const aciklama = `${teslimat?.teslimat_no} - ${row.aciklama}`
    return teslimat?.durum === 'tamamlandi' && !aktarilanKalemler.has(row.id) && !aktarilanAciklamalar.has(aciklama)
  }).length
  const gecikenCount = (gecikenGeriCount ?? 0) + (gecikenEmanetCount ?? 0)

  const subeMap = new Map<string, { ad: string; count: number }>()
  for (const row of subeRows ?? []) {
    const sube = row.subeler as SubeJoin | null
    const key = row.sube_id ?? 'genel'
    const current = subeMap.get(key) ?? { ad: sube?.ad ?? 'Genel', count: 0 }
    current.count += 1
    subeMap.set(key, current)
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Teslimatlar</h1>
          <p className="text-sm text-gray-500">Teslim, alım, emanet ve geri teslim takipleri.</p>
        </div>
        <Link href="/teslimatlar/yeni" className="rounded-md bg-[#C8102E] px-4 py-2 text-sm font-semibold text-white">Yeni teslimat</Link>
      </div>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Card label="Bugün teslim edilecekler" value={todayCount ?? 0} href="/teslimatlar/liste" />
        <Card label="Sevkte olanlar" value={sevkteCount ?? 0} href="/teslimatlar/liste?durum=sevkte" />
        <Card label="Açık emanetler" value={emanetCount ?? 0} href="/teslimatlar/emanetler" />
        <Card label="Geri teslim bekleyenler" value={bekleyenCount ?? 0} href="/teslimatlar/bekleyenler" />
        <Card label="10 günü geçenler" value={gecikenCount ?? 0} href="/teslimatlar/gecikenler" />
        <Card label="Ön kayda aktarılacaklar" value={onKayitCount ?? 0} href="/teslimatlar/on-kayda-aktar" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="rounded-lg border bg-white p-5 dark:border-gray-700 dark:bg-gray-800 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Son hareketler</h2>
            <Link href="/teslimatlar/liste" className="text-sm text-[#C8102E]">Tümünü gör</Link>
          </div>
          <div className="divide-y dark:divide-gray-700">
            {(sonTeslimatlar ?? []).map(row => {
              const customer = row.customers as CustomerJoin | null
              const sube = row.subeler as SubeJoin | null
              return (
                <Link key={row.id} href={`/teslimatlar/${row.id}`} className="flex items-center justify-between py-3 hover:bg-gray-50 dark:hover:bg-gray-700">
                  <div>
                    <div className="font-mono text-sm font-semibold text-[#C8102E]">{row.teslimat_no}</div>
                    <div className="text-sm text-gray-700 dark:text-gray-200">{customer?.full_name ?? '-'}</div>
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    <div>{formatTRDate(row.teslimat_tarihi)}</div>
                    <div>{sube?.ad ?? 'Genel'} - {row.durum}</div>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>

        <section className="rounded-lg border bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-3 font-semibold">Şube bazlı açık iş</h2>
          <div className="space-y-2">
            {Array.from(subeMap.values()).map(row => (
              <div key={row.ad} className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-sm dark:bg-gray-700">
                <span>{row.ad}</span>
                <span className="font-semibold">{row.count}</span>
              </div>
            ))}
            {subeMap.size === 0 && <div className="text-sm text-gray-400">Açık iş yok.</div>}
          </div>
        </section>
      </div>
    </div>
  )
}
