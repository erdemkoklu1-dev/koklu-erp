import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/service'
import TeslimatForm from '../TeslimatForm'

export default async function YeniTeslimatPage() {
  const supabase = createServiceClient()
  const [{ data: customers }, { data: subeler }, { data: personeller }, { data: urunler }] = await Promise.all([
    supabase.from('customers').select('id, full_name, tax_number').eq('is_active', true).order('full_name'),
    supabase.from('subeler').select('id, ad').order('ad'),
    supabase.from('personeller').select('id, ad, soyad, durum').order('ad'),
    supabase.from('urunler').select('id, kategori, ad, birim, kdv_dahil_fiyat, kdv_haric_fiyat, dolum_fiyati, periyodik_bakim_fiyati').eq('aktif', true).order('kategori').order('ad'),
  ])

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center gap-3">
        <Link href="/teslimatlar" className="text-sm text-gray-500 hover:text-gray-700">Teslimatlar</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Yeni teslimat</h1>
      </div>
      <TeslimatForm
        customers={(customers ?? []).map(c => ({ id: c.id, label: c.full_name, meta: c.tax_number }))}
        subeler={(subeler ?? []).map(s => ({ id: s.id, label: s.ad }))}
        personeller={(personeller ?? []).map(p => ({ id: p.id, label: `${p.ad ?? ''} ${p.soyad ?? ''}`.trim() }))}
        urunler={(urunler ?? []).map(u => ({
          id: u.id,
          label: `${u.kategori} - ${u.ad}`,
          kategori: u.kategori,
          birim: u.birim,
          fiyat: u.kdv_dahil_fiyat ?? u.dolum_fiyati ?? u.periyodik_bakim_fiyati ?? u.kdv_haric_fiyat ?? 0,
        }))}
      />
    </div>
  )
}
