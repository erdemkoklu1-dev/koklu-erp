import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import { createIsPlaniAction } from '../actions'
import OperationShell from '../../_components/OperationShell'

const PLAN_TURLERI = ['Periyodik Bakım', 'Yangın Tüpü Kontrolü', 'Yangın Alarm Bakımı', 'HFC / Gazlı Sistem Bakımı', 'Davlumbaz Bakımı', 'Teslimat Planı', 'Dolum Toplama Planı', 'Arıza Planı', 'Genel Saha Görevi']
const TEKRAR_TIPLERI = ['Tek seferlik', 'Günlük', 'Haftalık', '15 Günde Bir', 'Aylık', '3 Ayda Bir', '6 Ayda Bir', 'Yıllık', 'Özel']

export default async function YeniIsPlaniPage() {
  const supabase = createServiceClient()
  const [{ data: customers }, { data: subeler }, { data: personeller }] = await Promise.all([
    supabase.from('customers').select('id, full_name').eq('is_active', true).order('full_name'),
    supabase.from('subeler').select('id, ad').eq('aktif', true).order('ad'),
    supabase.from('personeller').select('id, ad, soyad').eq('durum', 'aktif').order('ad'),
  ])
  const defaultSubeId = (subeler ?? []).find(s => s.ad === 'Erzincan Merkez')?.id ?? subeler?.[0]?.id ?? ''

  return (
    <OperationShell active="is-planlari" title="Yeni İş Planı">
      <div className="mx-auto max-w-5xl space-y-5 p-6">
        <div>
          <Link href="/operasyon/is-planlari" className="text-sm text-gray-500 hover:text-gray-700">← İş Planları</Link>
          <h1 className="mt-2 text-xl font-bold text-gray-900 dark:text-gray-100">Yeni İş Planı</h1>
        </div>

        <form action={createIsPlaniAction} className="grid gap-4 rounded-lg border bg-white p-5 dark:border-gray-700 dark:bg-gray-800 md:grid-cols-2">
          <label className="space-y-1 md:col-span-2">
            <span className="text-sm font-medium">Başlık *</span>
            <input name="baslik" required className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm font-medium">Açıklama</span>
            <textarea name="aciklama" rows={3} className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Müşteri</span>
            <select name="customer_id" className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
              <option value="">Genel operasyon</option>
              {(customers ?? []).map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Şube *</span>
            <select name="sube_id" required defaultValue={defaultSubeId} className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
              <option value="">Lütfen bu kaydın ait olduğu şubeyi seçin.</option>
              {(subeler ?? []).map(s => <option key={s.id} value={s.id}>{s.ad}</option>)}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Sorumlu Personel</span>
            <select name="sorumlu_personel_id" className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
              <option value="">Seçiniz</option>
              {(personeller ?? []).map(p => <option key={p.id} value={p.id}>{p.ad} {p.soyad}</option>)}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Plan Türü *</span>
            <select name="plan_turu" required defaultValue="Periyodik Bakım" className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
              {PLAN_TURLERI.map(v => <option key={v}>{v}</option>)}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Başlangıç Tarihi *</span>
            <input type="date" name="baslangic_tarihi" required className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Bitiş Tarihi</span>
            <input type="date" name="bitis_tarihi" className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Tekrar Tipi</span>
            <select name="tekrar_tipi" defaultValue="Aylık" className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
              {TEKRAR_TIPLERI.map(v => <option key={v}>{v}</option>)}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Tekrar Aralığı</span>
            <input type="number" name="tekrar_araligi" min={1} defaultValue={1} className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Üretilecek İş Sayısı</span>
            <input type="number" name="is_sayisi" min={1} max={120} defaultValue={24} className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Durum</span>
            <select name="durum" defaultValue="Aktif" className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
              {['Taslak', 'Aktif', 'Beklemede'].map(v => <option key={v}>{v}</option>)}
            </select>
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm font-medium">Notlar</span>
            <textarea name="notlar" rows={3} className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
          </label>

          <div className="flex justify-end gap-2 md:col-span-2">
            <Link href="/operasyon/is-planlari" className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700">Vazgeç</Link>
            <button className="rounded-md bg-[#C8102E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#a00d25]">Kaydet</button>
          </div>
        </form>
      </div>
    </OperationShell>
  )
}
