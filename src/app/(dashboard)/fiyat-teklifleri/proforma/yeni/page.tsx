import { createServiceClient } from '@/lib/supabase/service'
import ProformaFormClient, { ProformaPrefillData } from '../ProformaFormClient'

export default async function YeniProformaPage({
  searchParams,
}: {
  searchParams: Promise<{ teklif_id?: string }>
}) {
  const { teklif_id } = await searchParams
  let prefillData: ProformaPrefillData | undefined

  if (teklif_id) {
    const supabase = createServiceClient()
    const [{ data: teklif }, { data: kalemler }] = await Promise.all([
      supabase
        .from('teklifler')
        .select('*, customers(full_name, phone, email, address, tax_number)')
        .eq('id', teklif_id)
        .single(),
      supabase
        .from('teklif_kalemleri')
        .select('*')
        .eq('teklif_id', teklif_id)
        .order('sira_no'),
    ])

    if (teklif) {
      const musteri = teklif.customers as any
      prefillData = {
        teklif_id,
        customer_id:   teklif.musteri_id ?? null,
        musteri_unvan: musteri?.full_name ?? teklif.musteri_adi ?? '',
        musteri_adres: musteri?.address ?? '',
        musteri_vkn:   musteri?.tax_number ?? '',
        musteri_telefon: musteri?.phone ?? teklif.musteri_telefon ?? '',
        musteri_email:   musteri?.email ?? teklif.musteri_email ?? '',
        kalemleri: (kalemler ?? []).map((k: any, i: number) => ({
          urun_id:       null,
          mal_hizmet:    k.aciklama ?? '',
          aciklama:      '',
          miktar:        k.miktar ?? 1,
          birim:         'Adet',
          birim_fiyat:   k.birim_fiyat ?? 0,
          iskonto_orani: k.iskonto ?? 0,
          kdv_orani:     20,
        })),
      }
    }
  }

  return <ProformaFormClient mode="yeni" prefillData={prefillData} />
}
