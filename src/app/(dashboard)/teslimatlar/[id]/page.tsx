import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import { formatCurrency, formatTRDate } from '@/lib/finance/formatters'
import { HAREKET_TIPI_LABELS, type HareketTipi } from '@/lib/teslimatlar'
import { updateTeslimatDurumAction } from '../actions'

const DURUM_LABELS: Record<string, string> = {
  taslak: 'Taslak',
  sevkte: 'Sevkte',
  tamamlandi: 'Tamamlandı',
  iptal: 'İptal',
}

type CustomerJoin = { id?: string | null; full_name?: string | null }
type SubeJoin = { ad?: string | null }
type PersonelJoin = { ad?: string | null; soyad?: string | null }
type UrunJoin = { ad?: string | null }

export default async function TeslimatDetayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()
  const [{ data: teslimat }, { data: kalemler }, { data: durumlar }, { data: emanetler }, { data: bekleyenler }] = await Promise.all([
    supabase.from('teslimatlar').select('*, customers(id, full_name), subeler(ad), personeller(ad, soyad)').eq('id', id).single(),
    supabase.from('teslimat_kalemleri').select('*, urunler(ad, kategori)').eq('teslimat_id', id).order('created_at'),
    supabase.from('teslimat_durum_gecmisi').select('*').eq('teslimat_id', id).order('created_at', { ascending: false }),
    supabase.from('emanet_takipleri').select('*, urunler(ad)').eq('teslimat_id', id),
    supabase.from('geri_teslim_takipleri').select('*, urunler(ad)').eq('teslimat_id', id),
  ])
  if (!teslimat) notFound()

  const customer = teslimat.customers as CustomerJoin | null
  const sube = teslimat.subeler as SubeJoin | null
  const personel = teslimat.personeller as PersonelJoin | null
  const toplam = (kalemler ?? []).reduce((sum, k) => sum + Number(k.toplam_tutar ?? 0), 0)

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/teslimatlar/liste" className="text-sm text-gray-500 hover:text-gray-700">← Listeye dön</Link>
          <h1 className="text-xl font-bold">{teslimat.teslimat_no}</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/teslimatlar/${id}/duzenle`} className="rounded-md border px-3 py-2 text-sm text-[#C8102E]">Düzenle</Link>
          <span className="rounded-full border px-3 py-1 text-sm">{DURUM_LABELS[teslimat.durum] ?? teslimat.durum}</span>
        </div>
      </div>

      <section className="flex flex-wrap items-center gap-2 rounded-lg border bg-white p-4 text-sm dark:border-gray-700 dark:bg-gray-800">
        <span className="font-medium text-gray-700 dark:text-gray-200">Durum değiştir:</span>
        {Object.entries(DURUM_LABELS).map(([durum, label]) => (
          <form key={durum} action={updateTeslimatDurumAction}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="durum" value={durum} />
            <button type="submit" disabled={teslimat.durum === durum} className="rounded-md border px-3 py-2 text-xs disabled:bg-gray-100 disabled:text-gray-400 dark:border-gray-700 dark:disabled:bg-gray-900">
              {label}
            </button>
          </form>
        ))}
      </section>

      <section className="grid gap-4 rounded-lg border bg-white p-5 text-sm dark:border-gray-700 dark:bg-gray-800 md:grid-cols-4">
        <div><div className="text-gray-400">Müşteri</div><Link href={`/customers/${customer?.id}`} className="font-semibold text-[#C8102E]">{customer?.full_name ?? '-'}</Link></div>
        <div><div className="text-gray-400">Şube</div><div className="font-semibold">{sube?.ad ?? 'Genel'}</div></div>
        <div><div className="text-gray-400">Personel</div><div className="font-semibold">{personel ? `${personel.ad ?? ''} ${personel.soyad ?? ''}` : '-'}</div></div>
        <div><div className="text-gray-400">Tarih</div><div className="font-semibold">{formatTRDate(teslimat.teslimat_tarihi)}</div></div>
        <div><div className="text-gray-400">Hedef</div><div className="font-semibold">{formatTRDate(teslimat.hedef_tarih)}</div></div>
        <div><div className="text-gray-400">Ön kayıt</div><div className="font-semibold">{teslimat.on_kayit_olusturuldu ? 'Oluşturuldu' : teslimat.on_kayit_secimi}</div></div>
        <div className="md:col-span-2"><div className="text-gray-400">Açıklama</div><div className="font-semibold">{teslimat.aciklama ?? '-'}</div></div>
      </section>

      <section className="overflow-x-auto rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700">
            <tr>
              <th className="px-4 py-3 text-left">Kalem</th>
              <th className="px-4 py-3 text-left">Yön</th>
              <th className="px-4 py-3 text-left">Tip</th>
              <th className="px-4 py-3 text-right">Miktar</th>
              <th className="px-4 py-3 text-right">Tutar</th>
              <th className="px-4 py-3 text-center">Stok</th>
              <th className="px-4 py-3 text-center">Emanet</th>
              <th className="px-4 py-3 text-center">Geri teslim</th>
              <th className="px-4 py-3 text-center">Ön kayıt</th>
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-gray-700">
            {(kalemler ?? []).map(k => {
              const urun = k.urunler as UrunJoin | null
              return (
                <tr key={k.id}>
                  <td className="px-4 py-3"><div className="font-medium">{k.aciklama}</div><div className="text-xs text-gray-400">{urun?.ad}</div></td>
                  <td className="px-4 py-3">{k.hareket_yonu}</td>
                  <td className="px-4 py-3">{HAREKET_TIPI_LABELS[k.hareket_tipi as HareketTipi] ?? k.hareket_tipi}</td>
                  <td className="px-4 py-3 text-right">{k.miktar} {k.birim}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(k.toplam_tutar)}</td>
                  <td className="px-4 py-3 text-center">{k.stoktan_duser_mi ? 'Evet' : '-'}</td>
                  <td className="px-4 py-3 text-center">{k.emanet_mi ? 'Evet' : '-'}</td>
                  <td className="px-4 py-3 text-center">{k.geri_alinmasi_gerekir_mi ? 'Evet' : '-'}</td>
                  <td className="px-4 py-3 text-center">{k.faturalanir_mi ? 'Evet' : '-'}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot><tr><td colSpan={4} className="px-4 py-3 text-right font-bold">Toplam</td><td className="px-4 py-3 text-right font-bold">{formatCurrency(toplam)}</td><td colSpan={4} /></tr></tfoot>
        </table>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="rounded-lg border bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-3 font-semibold">Emanet takipleri</h2>
          {(emanetler ?? []).map(e => {
            const urun = e.urunler as UrunJoin | null
            const kalan = Math.max(Number(e.miktar ?? 0) - Number(e.geri_alinan_miktar ?? 0), 0)
            return <div key={e.id} className="border-b py-2 text-sm dark:border-gray-700">{urun?.ad ?? 'Emanet'} - açık {kalan}/{e.miktar} - {formatTRDate(e.created_at)} - {e.durum}</div>
          })}
          {(emanetler ?? []).length === 0 && <div className="text-sm text-gray-400">Yok</div>}
        </section>
        <section className="rounded-lg border bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-3 font-semibold">Geri teslim bekleyenler</h2>
          {(bekleyenler ?? []).map(e => {
            const urun = e.urunler as UrunJoin | null
            const kalan = Math.max(Number(e.miktar ?? 0) - Number(e.teslim_edilen_miktar ?? 0), 0)
            return <div key={e.id} className="border-b py-2 text-sm dark:border-gray-700">{urun?.ad ?? 'Cihaz'} - {e.durum} - kalan {kalan}/{e.miktar} - {formatTRDate(e.hedef_tarih)}</div>
          })}
          {(bekleyenler ?? []).length === 0 && <div className="text-sm text-gray-400">Yok</div>}
        </section>
        <section className="rounded-lg border bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-3 font-semibold">Durum geçmişi</h2>
          {(durumlar ?? []).map(d => <div key={d.id} className="border-b py-2 text-sm dark:border-gray-700">{d.yeni_durum} - {formatTRDate(d.created_at)}</div>)}
        </section>
      </div>
    </div>
  )
}
