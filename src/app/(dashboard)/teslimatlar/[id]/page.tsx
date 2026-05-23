import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import { formatCurrency, formatTRDate } from '@/lib/finance/formatters'
import { HAREKET_TIPI_LABELS, type HareketTipi } from '@/lib/teslimatlar'
import { getTeslimFormData } from '@/lib/teslim-form-data'
import { updateTeslimatDurumAction } from '../actions'
import TeslimFormClient from './TeslimFormClient'

const DURUM_LABELS: Record<string, string> = {
  taslak: 'Taslak',
  sevkte: 'Sevkte',
  tamamlandi: 'Tamamlandı',
  iptal: 'İptal',
}

const DURUM_BADGE: Record<string, string> = {
  taslak:     'rounded-full border border-gray-300 bg-gray-100 px-3 py-1 text-sm text-gray-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300',
  sevkte:     'rounded-full border border-yellow-300 bg-yellow-100 px-3 py-1 text-sm text-yellow-700 dark:border-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-300',
  tamamlandi: 'rounded-full border border-green-300 bg-green-100 px-3 py-1 text-sm text-green-700 dark:border-green-600 dark:bg-green-900/30 dark:text-green-300',
  iptal:      'rounded-full border border-red-300 bg-red-100 px-3 py-1 text-sm text-red-600 dark:border-red-600 dark:bg-red-900/30 dark:text-red-400',
}

type CustomerJoin = { id?: string | null; full_name?: string | null }
type SubeJoin = { ad?: string | null }
type PersonelJoin = { ad?: string | null; soyad?: string | null }
type UrunJoin = { ad?: string | null }

function kalemDurumIcon(
  kalemId: string,
  emanetMi: boolean | null,
  geriGerekir: boolean | null,
  emanetMap: Map<string, string>,
  geriMap: Map<string, string>,
  teslimatDurum: string,
) {
  if (emanetMi) {
    const durum = emanetMap.get(kalemId)
    if (durum === 'kapandi') return { icon: '✅', label: 'Emanet geri alındı', cls: 'text-green-600' }
    if (durum === 'kismi_kapandi') return { icon: '🔄', label: 'Kısmen geri alındı', cls: 'text-orange-500' }
    return { icon: '🔄', label: 'Emanet açık', cls: 'text-orange-600' }
  }
  if (geriGerekir) {
    const durum = geriMap.get(kalemId)
    if (durum === 'teslim_edildi') return { icon: '✅', label: 'Geri teslim yapıldı', cls: 'text-green-600' }
    if (durum === 'kismi_teslim') return { icon: '⏳', label: 'Kısmen teslim edildi', cls: 'text-yellow-600' }
    return { icon: '⏳', label: 'Geri teslim bekliyor', cls: 'text-yellow-600' }
  }
  if (teslimatDurum === 'tamamlandi') return { icon: '📦', label: 'Teslim edildi', cls: 'text-blue-600' }
  if (teslimatDurum === 'sevkte') return { icon: '🚚', label: 'Sevkte', cls: 'text-yellow-600' }
  return { icon: '📋', label: 'Taslak', cls: 'text-gray-400' }
}

export default async function TeslimatDetayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  const [{ teslimat, kalemler, emanetler, bekleyenler }, { data: durumlar }] = await Promise.all([
    getTeslimFormData(id),
    supabase.from('teslimat_durum_gecmisi').select('*').eq('teslimat_id', id).order('created_at', { ascending: false }),
  ])

  if (!teslimat) notFound()

  const customer = teslimat.customers as CustomerJoin | null
  const sube = teslimat.subeler as SubeJoin | null
  const personel = teslimat.personeller as PersonelJoin | null
  const toplam = (kalemler ?? []).reduce((sum, k) => sum + Number(k.toplam_tutar ?? 0), 0)

  // Özet kart hesapları
  const toplamKalem = (kalemler ?? []).length
  const acikEmanet = (emanetler ?? []).filter(e => ['acik', 'kismi_kapandi'].includes(e.durum)).length
  const geriBekleyen = (bekleyenler ?? []).filter(b => ['bekliyor', 'kismi_teslim'].includes(b.durum)).length
  const tamamlananKalem = toplamKalem - acikEmanet - geriBekleyen

  // Kalem — emanet/geri eşleşme map'leri
  const emanetMap = new Map<string, string>()
  for (const e of emanetler ?? []) if (e.kalem_id) emanetMap.set(e.kalem_id as string, e.durum)
  const geriMap = new Map<string, string>()
  for (const g of bekleyenler ?? []) if (g.kalem_id) geriMap.set(g.kalem_id as string, g.durum)

  const durum = teslimat.durum as string

  return (
    <div className="space-y-5 p-6">
      {/* Başlık */}
      <div className="flex items-center justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm">
            <Link href="/teslimatlar/liste" className="flex items-center gap-1 text-[#C8102E] hover:underline">
              ← Teslimat Listesi
            </Link>
            <span className="text-gray-400">/</span>
            <span className="text-gray-600 dark:text-gray-400">Teslimat Detayı</span>
          </div>
          <h1 className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">{teslimat.teslimat_no}</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/teslimatlar/${id}/duzenle`} className="rounded-md border px-3 py-2 text-sm text-[#C8102E] hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700">
            Düzenle
          </Link>
          <span className={DURUM_BADGE[durum] ?? 'rounded-full border px-3 py-1 text-sm'}>
            {DURUM_LABELS[durum] ?? durum}
          </span>
        </div>
      </div>

      {/* Özet Kartlar */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-lg border bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="text-xs text-gray-400 dark:text-gray-500">Toplam Kalem</div>
          <div className="mt-1 text-2xl font-bold text-gray-900 dark:text-gray-100">{toplamKalem}</div>
        </div>
        <div className="rounded-lg border bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="text-xs text-gray-400 dark:text-gray-500">Tamamlanan</div>
          <div className="mt-1 text-2xl font-bold text-green-600">{Math.max(tamamlananKalem, 0)}</div>
        </div>
        <div className="rounded-lg border bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="text-xs text-gray-400 dark:text-gray-500">Açık Emanet</div>
          <div className={`mt-1 text-2xl font-bold ${acikEmanet > 0 ? 'text-orange-500' : 'text-gray-400'}`}>{acikEmanet}</div>
        </div>
        <div className="rounded-lg border bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <div className="text-xs text-gray-400 dark:text-gray-500">Geri Teslim Bekleyen</div>
          <div className={`mt-1 text-2xl font-bold ${geriBekleyen > 0 ? 'text-red-600' : 'text-gray-400'}`}>{geriBekleyen}</div>
        </div>
      </div>

      {/* Durum değiştir — akıllı butonlar */}
      <section className="flex flex-wrap items-center gap-2 rounded-lg border bg-white p-4 text-sm dark:border-gray-700 dark:bg-gray-800">
        <span className="font-medium text-gray-600 dark:text-gray-300">Durum değiştir:</span>
        {durum === 'taslak' && (
          <form action={updateTeslimatDurumAction}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="durum" value="sevkte" />
            <button type="submit" className="rounded-md bg-yellow-500 px-4 py-2 text-sm font-semibold text-white hover:bg-yellow-600">
              🚚 Sevke Al
            </button>
          </form>
        )}
        {durum === 'sevkte' && (
          <form action={updateTeslimatDurumAction}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="durum" value="tamamlandi" />
            <button type="submit" className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
              ✅ Tamamla
            </button>
          </form>
        )}
        {durum !== 'iptal' && durum !== 'tamamlandi' && (
          <form action={updateTeslimatDurumAction}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="durum" value="iptal" />
            <button type="submit" className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/20 dark:hover:bg-red-900/40">
              ❌ İptal Et
            </button>
          </form>
        )}
        {/* Diğer durum geçişleri */}
        {Object.entries(DURUM_LABELS).filter(([d]) => d !== durum && d !== 'iptal').map(([d, label]) => (
          durum === 'tamamlandi' && d === 'taslak' ? null : (
            <form key={d} action={updateTeslimatDurumAction}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="durum" value={d} />
              <button type="submit" className="rounded-md border px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-700">
                {label}
              </button>
            </form>
          )
        ))}
      </section>

      {/* Genel Bilgiler */}
      <section className="grid gap-4 rounded-lg border bg-white p-5 text-sm dark:border-gray-700 dark:bg-gray-800 md:grid-cols-4">
        <div>
          <div className="text-xs text-gray-400 dark:text-gray-500">Müşteri</div>
          <Link href={`/customers/${customer?.id}`} className="font-semibold text-[#C8102E] hover:underline">
            {customer?.full_name ?? '-'}
          </Link>
        </div>
        <div>
          <div className="text-xs text-gray-400 dark:text-gray-500">Şube</div>
          <div className="font-semibold text-gray-900 dark:text-gray-100">{sube?.ad ?? 'Genel'}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400 dark:text-gray-500">Personel</div>
          <div className="font-semibold text-gray-900 dark:text-gray-100">{personel ? `${personel.ad ?? ''} ${personel.soyad ?? ''}`.trim() || '-' : '-'}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400 dark:text-gray-500">Tarih</div>
          <div className="font-semibold text-gray-900 dark:text-gray-100">{formatTRDate(teslimat.teslimat_tarihi)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400 dark:text-gray-500">Hedef</div>
          <div className="font-semibold text-gray-900 dark:text-gray-100">{formatTRDate(teslimat.hedef_tarih)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-400 dark:text-gray-500">Ön kayıt</div>
          <div className="font-semibold text-gray-900 dark:text-gray-100">
            {teslimat.on_kayit_olusturuldu ? '✅ Oluşturuldu' : teslimat.on_kayit_secimi}
          </div>
        </div>
        <div className="md:col-span-2">
          <div className="text-xs text-gray-400 dark:text-gray-500">Açıklama</div>
          <div className="font-semibold text-gray-900 dark:text-gray-100">{teslimat.aciklama ?? '-'}</div>
        </div>
      </section>

      {/* Kalem tablosu */}
      <section className="overflow-x-auto rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700 dark:text-gray-400">
            <tr>
              <th className="px-4 py-3 text-left">Durum</th>
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
              const ds = kalemDurumIcon(
                k.id,
                k.emanet_mi,
                k.geri_alinmasi_gerekir_mi,
                emanetMap,
                geriMap,
                durum,
              )
              return (
                <tr key={k.id}>
                  <td className="px-4 py-3">
                    <span className={`font-medium ${ds.cls}`} title={ds.label}>{ds.icon}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{k.aciklama}</div>
                    {urun?.ad && <div className="text-xs text-gray-400">{urun.ad}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{k.hareket_yonu}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{HAREKET_TIPI_LABELS[k.hareket_tipi as HareketTipi] ?? k.hareket_tipi}</td>
                  <td className="px-4 py-3 text-right text-gray-800 dark:text-gray-200">{k.miktar} {k.birim}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-800 dark:text-gray-200">{formatCurrency(k.toplam_tutar)}</td>
                  <td className="px-4 py-3 text-center">{k.stoktan_duser_mi ? <span className="text-blue-600">✓</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-center">{k.emanet_mi ? <span className="text-orange-500">✓</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-center">{k.geri_alinmasi_gerekir_mi ? <span className="text-yellow-600">✓</span> : <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3 text-center">{k.faturalanir_mi ? <span className="text-green-600">✓</span> : <span className="text-gray-300">—</span>}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 dark:bg-gray-700">
              <td colSpan={5} className="px-4 py-3 text-right text-sm font-bold text-gray-700 dark:text-gray-200">Toplam</td>
              <td className="px-4 py-3 text-right text-sm font-bold text-gray-900 dark:text-gray-100">{formatCurrency(toplam)}</td>
              <td colSpan={4} />
            </tr>
          </tfoot>
        </table>
      </section>

      {/* Alt bilgi */}
      <div className="grid gap-5 lg:grid-cols-3">
        <section className="rounded-lg border bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-3 font-semibold text-gray-900 dark:text-gray-100">Emanet takipleri</h2>
          {(emanetler ?? []).map(e => {
            const urun = e.urunler as UrunJoin | null
            const kalan = Math.max(Number(e.miktar ?? 0) - Number(e.geri_alinan_miktar ?? 0), 0)
            const isAcik = ['acik', 'kismi_kapandi'].includes(e.durum)
            return (
              <div key={e.id} className={`border-b py-2 text-sm dark:border-gray-700 ${isAcik ? 'text-orange-700 dark:text-orange-300' : 'text-gray-500'}`}>
                {isAcik ? '🔄' : '✅'} {urun?.ad ?? 'Emanet'} — kalan {kalan}/{e.miktar} — {formatTRDate(e.created_at)} — {e.durum}
              </div>
            )
          })}
          {(emanetler ?? []).length === 0 && <div className="text-sm text-gray-400">Emanet yok.</div>}
        </section>

        <section className="rounded-lg border bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-3 font-semibold text-gray-900 dark:text-gray-100">Geri teslim bekleyenler</h2>
          {(bekleyenler ?? []).map(e => {
            const urun = e.urunler as UrunJoin | null
            const kalan = Math.max(Number(e.miktar ?? 0) - Number(e.teslim_edilen_miktar ?? 0), 0)
            const isBekliyor = ['bekliyor', 'kismi_teslim'].includes(e.durum)
            return (
              <div key={e.id} className={`border-b py-2 text-sm dark:border-gray-700 ${isBekliyor ? 'text-yellow-700 dark:text-yellow-300' : 'text-gray-500'}`}>
                {isBekliyor ? '⏳' : '✅'} {urun?.ad ?? 'Cihaz'} — kalan {kalan}/{e.miktar} — hedef {formatTRDate(e.hedef_tarih)}
              </div>
            )
          })}
          {(bekleyenler ?? []).length === 0 && <div className="text-sm text-gray-400">Geri teslim beklentisi yok.</div>}
        </section>

        <section className="rounded-lg border bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-3 font-semibold text-gray-900 dark:text-gray-100">Durum geçmişi</h2>
          {(durumlar ?? []).map(d => (
            <div key={d.id} className="border-b py-2 text-sm text-gray-600 dark:border-gray-700 dark:text-gray-300">
              <span className="font-medium">{DURUM_LABELS[d.yeni_durum] ?? d.yeni_durum}</span>
              <span className="ml-2 text-xs text-gray-400">{formatTRDate(d.created_at)}</span>
            </div>
          ))}
          {(durumlar ?? []).length === 0 && <div className="text-sm text-gray-400">Geçmiş yok.</div>}
        </section>
      </div>

      <TeslimFormClient
        teslimat={teslimat}
        kalemler={kalemler ?? []}
        emanetler={emanetler ?? []}
        bekleyenler={bekleyenler ?? []}
      />
    </div>
  )
}
