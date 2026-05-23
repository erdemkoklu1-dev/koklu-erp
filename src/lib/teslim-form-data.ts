import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'

export type TeslimFormData = {
  teslimat: any
  kalemler: any[]
  emanetler: any[]
  bekleyenler: any[]
}

export async function getTeslimFormData(id: string): Promise<TeslimFormData> {
  const supabase = createServiceClient()
  const [
    { data: teslimat },
    { data: kalemler },
    { data: emanetler },
    { data: bekleyenler },
  ] = await Promise.all([
    supabase
      .from('teslimatlar')
      .select('*, customers(id, full_name, phone, email, address, tax_number, authorized_person, authorized_phone), subeler(ad), personeller(ad, soyad)')
      .eq('id', id)
      .single(),
    supabase
      .from('teslimat_kalemleri')
      .select('*, urunler(ad, kategori)')
      .eq('teslimat_id', id)
      .order('created_at'),
    supabase
      .from('emanet_takipleri')
      .select('*, urunler(ad)')
      .eq('teslimat_id', id),
    supabase
      .from('geri_teslim_takipleri')
      .select('*, urunler(ad)')
      .eq('teslimat_id', id),
  ])

  if (!teslimat) notFound()

  return {
    teslimat,
    kalemler: kalemler ?? [],
    emanetler: emanetler ?? [],
    bekleyenler: bekleyenler ?? [],
  }
}

export function teslimFormFileName(teslimatNo: string | null | undefined) {
  const safeNo = String(teslimatNo ?? 'teslim-formu').replace(/[^a-zA-Z0-9ğüşöçıİĞÜŞÖÇ-]+/g, '-')
  return `${safeNo}-teslim-formu.pdf`
}
