import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import { updateTalepDurumAction } from '../actions'
import OperationShell from '../../_components/OperationShell'
import { formatTRDate } from '@/lib/finance/formatters'

const DURUMLAR = ['Yeni', 'İşleme Alındı', 'Planlandı', 'Sahada', 'Beklemede', 'Tamamlandı', 'İptal', 'Teslimata Aktarıldı', 'İş Planına Aktarıldı', 'Teklif Verildi']

export default async function TalepDetayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()
  const { data: talep } = await supabase
    .from('musteri_talepleri')
    .select('*, customers(id, full_name, phone, email), subeler(ad), personeller(ad, soyad)')
    .eq('id', id)
    .single()

  if (!talep) notFound()

  return (
    <OperationShell active="talepler" title={`Talep Detayı - ${talep.talep_no}`}>
      <div className="space-y-5 p-6 print:p-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link href="/operasyon/talepler" className="no-print text-sm text-gray-500 hover:text-gray-700">← Talepler</Link>
            <h1 className="mt-2 text-xl font-bold text-gray-900 dark:text-gray-100">{talep.baslik}</h1>
            <p className="font-mono text-sm text-[#C8102E]">{talep.talep_no}</p>
          </div>
          <form action={updateTalepDurumAction} className="no-print flex gap-2">
            <input type="hidden" name="id" value={talep.id} />
            <select name="durum" defaultValue={talep.durum} className="rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
              {DURUMLAR.map(v => <option key={v}>{v}</option>)}
            </select>
            <button className="rounded-md bg-[#C8102E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#a00d25]">Güncelle</button>
          </form>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <section className="rounded-lg border bg-white p-5 dark:border-gray-700 dark:bg-gray-800 lg:col-span-2">
            <h2 className="mb-4 font-semibold">Talep Bilgileri</h2>
            <dl className="grid gap-4 md:grid-cols-2">
              <div><dt className="text-xs text-gray-500">Müşteri</dt><dd className="font-medium">{talep.customer_name_snapshot ?? talep.customers?.full_name ?? '-'}</dd></div>
              <div><dt className="text-xs text-gray-500">Şube</dt><dd className="font-medium">{talep.subeler?.ad ?? '-'}</dd></div>
              <div><dt className="text-xs text-gray-500">Cihaz</dt><dd>{talep.cihaz_name_snapshot ?? '-'}</dd></div>
              <div><dt className="text-xs text-gray-500">Kategori</dt><dd>{talep.kategori}</dd></div>
              <div><dt className="text-xs text-gray-500">Öncelik</dt><dd>{talep.oncelik}</dd></div>
              <div><dt className="text-xs text-gray-500">Durum</dt><dd>{talep.durum}</dd></div>
              <div><dt className="text-xs text-gray-500">Kaynak</dt><dd>{talep.kaynak}</dd></div>
              <div><dt className="text-xs text-gray-500">Talep Tarihi</dt><dd>{formatTRDate(talep.talep_tarihi)}</dd></div>
              <div><dt className="text-xs text-gray-500">Hedef Tarih</dt><dd>{formatTRDate(talep.hedef_tarih)}</dd></div>
              <div><dt className="text-xs text-gray-500">Atanan Kişi</dt><dd>{talep.personeller ? `${talep.personeller.ad ?? ''} ${talep.personeller.soyad ?? ''}`.trim() : '-'}</dd></div>
            </dl>
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-semibold">Açıklama</h3>
              <p className="whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-sm dark:bg-gray-900">{talep.aciklama}</p>
            </div>
            {talep.notlar && (
              <div className="mt-4">
                <h3 className="mb-2 text-sm font-semibold">Notlar</h3>
                <p className="whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-sm dark:bg-gray-900">{talep.notlar}</p>
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <section className="no-print rounded-lg border bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
              <h2 className="mb-3 font-semibold">Hızlı Aksiyonlar</h2>
              <div className="grid gap-2">
                <button disabled className="rounded-md border px-3 py-2 text-left text-sm text-gray-400">Düzenle</button>
                <button disabled className="rounded-md border px-3 py-2 text-left text-sm text-gray-400">İş Planına Dönüştür</button>
                <button disabled className="rounded-md border px-3 py-2 text-left text-sm text-gray-400">Teslimata Bağla</button>
              </div>
              <p className="mt-3 text-xs text-gray-500">Bu aksiyonların altyapısı sonraki aşamada genişletilebilir.</p>
            </section>

            <section className="rounded-lg border bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
              <h2 className="mb-3 font-semibold">Bağlantılar</h2>
              <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                <div>İlgili teslimat: {talep.ilgili_teslimat_id ?? '-'}</div>
                <div>İlgili iş planı: {talep.ilgili_is_plani_id ?? '-'}</div>
                <div>İlgili servis formu: {talep.ilgili_servis_form_id ?? '-'}</div>
                <div>İlgili teklif: {talep.ilgili_teklif_id ?? '-'}</div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </OperationShell>
  )
}
