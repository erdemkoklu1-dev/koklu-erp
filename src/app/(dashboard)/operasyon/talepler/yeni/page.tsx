import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import { createTalepAction } from '../actions'
import OperationShell from '../../_components/OperationShell'

const KATEGORILER = ['Arıza', 'Bakım Talebi', 'Kurulum', 'Teklif Talebi', 'Ürün Talebi', 'Dolum Talebi', 'Teslimat Talebi', 'Şikayet', 'Periyodik Kontrol', 'Diğer']
const ONCELIKLER = ['Düşük', 'Normal', 'Yüksek', 'Acil']
const DURUMLAR = ['Yeni', 'İşleme Alındı', 'Planlandı', 'Sahada', 'Beklemede']
const KAYNAKLAR = ['Telefon', 'WhatsApp', 'E-posta', 'Yüz yüze', 'Sistem', 'Diğer']

export default async function YeniTalepPage() {
  const supabase = createServiceClient()
  const [{ data: customers }, { data: devices }, { data: subeler }, { data: personeller }] = await Promise.all([
    supabase.from('customers').select('id, full_name, sube_id').eq('is_active', true).order('full_name'),
    supabase.from('devices').select('id, customer_id, custom_device_name, capacity, serial_number, device_types(name)').eq('is_active', true).order('created_at', { ascending: false }).limit(500),
    supabase.from('subeler').select('id, ad').eq('aktif', true).order('ad'),
    supabase.from('personeller').select('id, ad, soyad, subeler(ad)').eq('durum', 'aktif').order('ad'),
  ])
  const defaultSubeId = (subeler ?? []).find(s => s.ad === 'Erzincan Merkez')?.id ?? subeler?.[0]?.id ?? ''

  return (
    <OperationShell active="talepler" title="Yeni Talep">
      <div className="mx-auto max-w-5xl space-y-5 p-6">
        <div>
          <Link href="/operasyon/talepler" className="text-sm text-gray-500 hover:text-gray-700">← Talepler</Link>
          <h1 className="mt-2 text-xl font-bold text-gray-900 dark:text-gray-100">Yeni Talep</h1>
        </div>

        <form action={createTalepAction} className="grid gap-4 rounded-lg border bg-white p-5 dark:border-gray-700 dark:bg-gray-800 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-medium">Müşteri *</span>
            <select name="customer_id" required className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
              <option value="">Seçiniz</option>
              {(customers ?? []).map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Cihaz</span>
            <select name="cihaz_id" className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
              <option value="">Cihaz seçilmesin</option>
              {(devices ?? []).map((d: any) => {
                const label = [d.custom_device_name ?? d.device_types?.name ?? 'Cihaz', d.capacity ? `${d.capacity} Kg` : null, d.serial_number].filter(Boolean).join(' - ')
                return <option key={d.id} value={d.id}>{label}</option>
              })}
            </select>
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm font-medium">Başlık *</span>
            <input name="baslik" required className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm font-medium">Açıklama *</span>
            <textarea name="aciklama" required rows={4} className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Kategori *</span>
            <select name="kategori" required defaultValue="Arıza" className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
              {KATEGORILER.map(v => <option key={v}>{v}</option>)}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Öncelik *</span>
            <select name="oncelik" required defaultValue="Normal" className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
              {ONCELIKLER.map(v => <option key={v}>{v}</option>)}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Durum</span>
            <select name="durum" defaultValue="Yeni" className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
              {DURUMLAR.map(v => <option key={v}>{v}</option>)}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Hedef Tarih</span>
            <input type="date" name="hedef_tarih" className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
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
              {(personeller ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.ad} {p.soyad} {p.subeler?.ad ? `- ${p.subeler.ad}` : ''}</option>)}
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium">Kaynak</span>
            <select name="kaynak" defaultValue="Telefon" className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
              {KAYNAKLAR.map(v => <option key={v}>{v}</option>)}
            </select>
          </label>

          <label className="space-y-1 md:col-span-2">
            <span className="text-sm font-medium">Notlar</span>
            <textarea name="notlar" rows={3} className="w-full rounded-md border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900" />
          </label>

          <div className="flex justify-end gap-2 md:col-span-2">
            <Link href="/operasyon/talepler" className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50 dark:border-gray-700">Vazgeç</Link>
            <button className="rounded-md bg-[#C8102E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#a00d25]">Kaydet</button>
          </div>
        </form>
      </div>
    </OperationShell>
  )
}
