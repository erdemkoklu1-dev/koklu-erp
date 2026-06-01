import { createClient } from '@/lib/supabase/server'

type RouteParams = { params: Promise<{ id: string }> }

export async function POST(_request: Request, { params }: RouteParams) {
  const { id } = await params
  const supabase = await createClient()

  try {
    const { error } = await supabase
      .from('teknik_raporlar')
      .update({ durum: 'İptal', updated_at: new Date().toISOString() })
      .eq('id', id)

    if (error) {
      console.error('[teknik-raporlar][cancel] update failed', { id, error })
      return Response.json({ error: 'Teknik rapor iptal edilemedi. Lütfen tekrar deneyin.' }, { status: 500 })
    }

    return Response.json({ message: 'Teknik rapor iptal edildi.' })
  } catch (error) {
    console.error('[teknik-raporlar][cancel] unexpected error', { id, error })
    return Response.json({ error: 'Teknik rapor iptal edilemedi. Lütfen tekrar deneyin.' }, { status: 500 })
  }
}
