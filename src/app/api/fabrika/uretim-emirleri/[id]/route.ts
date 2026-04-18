import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServiceClient()

  const [{ data: emir, error }, { data: hareketler }] = await Promise.all([
    supabase
      .from('uretim_emirleri')
      .select('*, urunler(id, ad, kategori, kdv_haric_fiyat)')
      .eq('id', id)
      .single(),
    supabase
      .from('uretim_hareketleri')
      .select('*, hammaddeler(id, ad, birim)')
      .eq('uretim_emri_id', id)
      .order('tarih'),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json({ emir, hareketler: hareketler ?? [] })
}
