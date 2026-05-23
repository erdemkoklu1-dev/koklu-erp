import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import { HAREKET_TIPI_LABELS, type HareketTipi } from '@/lib/teslimatlar'
import { formatTRDate } from '@/lib/finance/formatters'

export default async function HareketGecmisiPage({ searchParams }: { searchParams: Promise<{ customer?: string; urun?: string; sube?: string; personel?: string; yon?: string }> }) {
  const params = await searchParams
  const supabase = createServiceClient()
  let query = supabase
    .from('teslimat_kalemleri')
    .select('*, urunler(id, ad), teslimatlar(id, teslimat_no, teslimat_tarihi, customer_id, sube_id, personel_id, customers(full_name), subeler(ad), personeller(ad, soyad))')
    .order('created_at', { ascending: false })
    .limit(500)
  if (params.urun) query = query.eq('urun_id', params.urun)
  if (params.yon) query = query.eq('hareket_yonu', params.yon)

  const [{ data }, { data: customers }, { data: urunler }, { data: subeler }, { data: personeller }] = await Promise.all([
    query,
    supabase.from('customers').select('id, full_name').order('full_name'),
    supabase.from('urunler').select('id, ad').order('ad'),
    supabase.from('subeler').select('id, ad').order('ad'),
    supabase.from('personeller').select('id, ad, soyad').order('ad'),
  ])

  const filtered = (data ?? []).filter(row => {
    const teslimat = row.teslimatlar as any
    if (params.customer && teslimat?.customer_id !== params.customer) return false
    if (params.sube && teslimat?.sube_id !== params.sube) return false
    if (params.personel && teslimat?.personel_id !== params.personel) return false
    return true
  })

  return (
    <div className="space-y-5 p-6">
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm">
          <Link href="/teslimatlar" className="flex items-center gap-1 text-[#C8102E] hover:underline">
            ← Teslimatlar
          </Link>
          <span className="text-gray-400">/</span>
          <span className="text-gray-600 dark:text-gray-400">Hareket Geçmişi</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Hareket geçmişi</h1>
      </div>
      <form className="grid gap-3 rounded-lg border bg-white p-4 text-sm dark:border-gray-700 dark:bg-gray-800 md:grid-cols-5">
        <select name="customer" defaultValue={params.customer ?? ''} className="rounded border px-3 py-2 dark:border-gray-700 dark:bg-gray-900"><option value="">Tüm müşteriler</option>{(customers ?? []).map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}</select>
        <select name="urun" defaultValue={params.urun ?? ''} className="rounded border px-3 py-2 dark:border-gray-700 dark:bg-gray-900"><option value="">Tüm ürünler</option>{(urunler ?? []).map(u => <option key={u.id} value={u.id}>{u.ad}</option>)}</select>
        <select name="sube" defaultValue={params.sube ?? ''} className="rounded border px-3 py-2 dark:border-gray-700 dark:bg-gray-900"><option value="">Tüm şubeler</option>{(subeler ?? []).map(s => <option key={s.id} value={s.id}>{s.ad}</option>)}</select>
        <select name="personel" defaultValue={params.personel ?? ''} className="rounded border px-3 py-2 dark:border-gray-700 dark:bg-gray-900"><option value="">Tüm personel</option>{(personeller ?? []).map(p => <option key={p.id} value={p.id}>{p.ad} {p.soyad}</option>)}</select>
        <select name="yon" defaultValue={params.yon ?? ''} className="rounded border px-3 py-2 dark:border-gray-700 dark:bg-gray-900"><option value="">Tüm yönler</option><option value="giden">Giden</option><option value="gelen">Gelen</option></select>
        <button className="rounded bg-[#C8102E] px-3 py-2 font-semibold text-white md:col-span-5">Filtrele</button>
      </form>
      <div className="overflow-x-auto rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700"><tr><th className="px-4 py-3 text-left">Tarih</th><th className="px-4 py-3 text-left">Teslimat</th><th className="px-4 py-3 text-left">Müşteri</th><th className="px-4 py-3 text-left">Ürün/Kalem</th><th className="px-4 py-3 text-left">Yön</th><th className="px-4 py-3 text-left">Tip</th><th className="px-4 py-3 text-right">Miktar</th><th className="px-4 py-3 text-left">Şube</th><th className="px-4 py-3 text-left">Personel</th></tr></thead>
          <tbody className="divide-y dark:divide-gray-700">
            {filtered.map(row => {
              const teslimat = row.teslimatlar as any
              const urun = row.urunler as any
              return <tr key={row.id}><td className="px-4 py-3">{formatTRDate(teslimat?.teslimat_tarihi)}</td><td className="px-4 py-3"><Link href={`/teslimatlar/${teslimat?.id}`} className="text-[#C8102E]">{teslimat?.teslimat_no}</Link></td><td className="px-4 py-3">{teslimat?.customers?.full_name}</td><td className="px-4 py-3">{urun?.ad ?? row.aciklama}</td><td className="px-4 py-3">{row.hareket_yonu}</td><td className="px-4 py-3">{HAREKET_TIPI_LABELS[row.hareket_tipi as HareketTipi] ?? row.hareket_tipi}</td><td className="px-4 py-3 text-right">{row.miktar} {row.birim}</td><td className="px-4 py-3">{teslimat?.subeler?.ad ?? 'Genel'}</td><td className="px-4 py-3">{teslimat?.personeller ? `${teslimat.personeller.ad ?? ''} ${teslimat.personeller.soyad ?? ''}` : '-'}</td></tr>
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
