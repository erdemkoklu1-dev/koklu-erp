import { createServiceClient } from '@/lib/supabase/service'
import { notFound } from 'next/navigation'
import ProformaFormClient, { ProformaInitialData, ProformaKalem } from '../ProformaFormClient'

export default async function ProformaDuzenlePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = createServiceClient()

  const [{ data: proforma }, { data: kalemler }] = await Promise.all([
    supabase.from('proforma_faturalar').select('*').eq('id', id).single(),
    supabase.from('proforma_fatura_kalemleri').select('*').eq('proforma_id', id).order('sira_no'),
  ])

  if (!proforma) notFound()

  const initialData: ProformaInitialData = {
    id:                    proforma.id,
    proforma_no:           proforma.proforma_no,
    tarih:                 proforma.tarih,
    vade_tarihi:           proforma.vade_tarihi ?? '',
    teklif_id:             proforma.teklif_id ?? null,
    customer_id:           proforma.customer_id ?? null,
    musteri_unvan:         proforma.musteri_unvan ?? '',
    musteri_adres:         proforma.musteri_adres ?? '',
    musteri_vkn:           proforma.musteri_vkn ?? '',
    musteri_vergi_dairesi: proforma.musteri_vergi_dairesi ?? '',
    musteri_telefon:       proforma.musteri_telefon ?? '',
    musteri_email:         proforma.musteri_email ?? '',
    para_birimi:           proforma.para_birimi ?? 'TRY',
    durum:                 proforma.durum ?? 'taslak',
    iban:                  proforma.iban ?? '',
    banka_adi:             proforma.banka_adi ?? '',
    notlar:                proforma.notlar ?? '',
    ozel_sartlar:          proforma.ozel_sartlar ?? '',
    sube_id:               proforma.sube_id ?? null,
    kalemleri: (kalemler ?? []).map((k: any): ProformaKalem => ({
      id:             Math.random().toString(36).slice(2),
      sira_no:        k.sira_no,
      urun_id:        k.urun_id ?? null,
      mal_hizmet:     k.mal_hizmet ?? '',
      aciklama:       k.aciklama ?? '',
      miktar:         k.miktar ?? 1,
      birim:          k.birim ?? 'Adet',
      birim_fiyat:    k.birim_fiyat ?? 0,
      iskonto_orani:  k.iskonto_orani ?? 0,
      iskonto_tutari: k.iskonto_tutari ?? 0,
      kdv_orani:      k.kdv_orani ?? 20,
      kdv_tutari:     k.kdv_tutari ?? 0,
      toplam_tutar:   k.toplam_tutar ?? 0,
    })),
  }

  return <ProformaFormClient mode="duzenle" initialData={initialData} />
}
