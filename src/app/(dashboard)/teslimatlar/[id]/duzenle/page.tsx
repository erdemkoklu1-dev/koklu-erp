import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import { applyTenantScope, getCurrentTenantAccessFromSession } from '@/lib/auth/tenant-scope'
import TeslimatForm from '../../TeslimatForm'

export default async function TeslimatDuzenlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()
  const tenantAccess = await getCurrentTenantAccessFromSession()
  const [{ data: teslimat }, { data: kalemler }, { data: customers }, { data: subeler }, { data: personeller }, { data: urunler }] = await Promise.all([
    applyTenantScope(supabase.from('teslimatlar').select('*').eq('id', id), tenantAccess).maybeSingle(),
    applyTenantScope(supabase.from('teslimat_kalemleri').select('*').eq('teslimat_id', id).order('created_at'), tenantAccess),
    applyTenantScope(supabase.from('customers').select('id, full_name, tax_number').eq('is_active', true).order('full_name'), tenantAccess),
    applyTenantScope(supabase.from('subeler').select('id, ad').order('ad'), tenantAccess),
    supabase.from('personeller').select('id, ad, soyad, durum').order('ad'),
    supabase.from('urunler').select('id, kategori, ad, birim, kdv_dahil_fiyat, kdv_haric_fiyat, dolum_fiyati, periyodik_bakim_fiyati').eq('aktif', true).order('kategori').order('ad'),
  ])

  if (!teslimat) notFound()

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center gap-3">
        <Link href={`/teslimatlar/${id}`} className="text-sm text-[#C8102E] hover:underline">← Teslimat Detayı</Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">Düzenle</h1>
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
        initialValue={{
          id: teslimat.id,
          customer_id: teslimat.customer_id,
          sube_id: teslimat.sube_id,
          personel_id: teslimat.personel_id,
          teslimat_tarihi: teslimat.teslimat_tarihi,
          hedef_tarih: teslimat.hedef_tarih,
          durum: teslimat.durum,
          on_kayit_secimi: teslimat.on_kayit_secimi,
          aciklama: teslimat.aciklama,
          notlar: teslimat.notlar,
          kalemler: (kalemler ?? []).map(k => ({
            urun_id: k.urun_id,
            aciklama: k.aciklama,
            hareket_yonu: k.hareket_yonu,
            hareket_tipi: k.hareket_tipi,
            miktar: k.miktar,
            birim: k.birim,
            birim_fiyat: k.birim_fiyat,
            stoktan_duser_mi: k.stoktan_duser_mi,
            musteri_envanterine_isler_mi: k.musteri_envanterine_isler_mi,
            emanet_mi: k.emanet_mi,
            geri_alinmasi_gerekir_mi: k.geri_alinmasi_gerekir_mi,
            hedef_tarih: k.hedef_tarih,
            faturalanir_mi: k.faturalanir_mi,
            notlar: k.notlar,
          })),
        }}
      />
    </div>
  )
}
