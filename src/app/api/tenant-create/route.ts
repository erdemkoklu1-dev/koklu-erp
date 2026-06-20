import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import {
  assertBranchBelongsToFirma,
  assertCustomerBelongsToFirma,
  requireCurrentFirmaId,
  withFirmaId,
} from '@/lib/auth/tenant-scope'

type JsonObject = Record<string, unknown>

function asObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {}
}

function asRows(value: unknown): JsonObject[] {
  if (Array.isArray(value)) return value.map(asObject)
  const row = asObject(value)
  return Object.keys(row).length > 0 ? [row] : []
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

async function validateRows(rows: JsonObject[], firmaId: string) {
  for (const row of rows) {
    await assertBranchBelongsToFirma(text(row.sube_id), firmaId)
    await assertCustomerBelongsToFirma(text(row.customer_id) ?? text(row.musteri_id), firmaId)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const action = String(body?.action ?? '')
    const firmaId = await requireCurrentFirmaId()
    const supabase = createServiceClient()

    if (action === 'customers') {
      const row = asObject(body.payload)
      await assertBranchBelongsToFirma(text(row.sube_id), firmaId)
      const { data, error } = await supabase
        .from('customers')
        .insert(withFirmaId(row, firmaId))
        .select('id')
        .single()
      if (error) throw error
      return NextResponse.json(data)
    }

    if (action === 'devices') {
      const rows = asRows(body.payload)
      if (rows.length === 0) return NextResponse.json({ error: 'Cihaz verisi eksik' }, { status: 400 })
      await validateRows(rows, firmaId)
      const { data, error } = await supabase
        .from('devices')
        .insert(rows.map(row => withFirmaId(row, firmaId)))
        .select('id')
      if (error) throw error
      return NextResponse.json({ ids: (data ?? []).map(row => row.id) })
    }

    if (action === 'service_forms') {
      const form = asObject(body.form)
      const items = asRows(body.items)
      await validateRows([form], firmaId)
      const { data, error } = await supabase
        .from('service_forms')
        .insert(withFirmaId(form, firmaId))
        .select('id')
        .single()
      if (error) throw error
      if (!data?.id) return NextResponse.json({ error: 'Servis formu ID alınamadı' }, { status: 500 })

      if (items.length > 0) {
        const { error: itemError } = await supabase.from('service_form_items').insert(
          items.map(item => ({ ...item, service_form_id: data.id })),
        )
        if (itemError) {
          await supabase.from('service_forms').delete().eq('id', data.id)
          throw itemError
        }
      }
      return NextResponse.json({ id: data.id })
    }

    if (action === 'brokers') {
      const row = asObject(body.payload)
      const { data, error } = await supabase
        .from('brokers')
        .insert(withFirmaId(row, firmaId))
        .select('id')
        .single()
      if (error) throw error
      return NextResponse.json(data)
    }

    if (action === 'araci_cari_hareketleri') {
      const row = asObject(body.payload)
      const brokerId = text(row.araci_id)
      if (!brokerId) return NextResponse.json({ error: 'Aracı seçimi zorunludur' }, { status: 400 })
      const { data: broker, error: brokerError } = await supabase
        .from('brokers')
        .select('id, firma_id')
        .eq('id', brokerId)
        .maybeSingle()
      if (brokerError) throw brokerError
      if (!broker) return NextResponse.json({ error: 'Seçilen aracı bulunamadı' }, { status: 404 })
      if (broker.firma_id !== firmaId) {
        return NextResponse.json({ error: 'Seçilen aracı kullanıcının firmasına ait değil.' }, { status: 403 })
      }
      await assertBranchBelongsToFirma(text(row.sube_id), firmaId)
      const { data, error } = await supabase
        .from('araci_cari_hareketleri')
        .insert(withFirmaId(row, firmaId))
        .select('*, subeler(ad)')
        .single()
      if (error) throw error
      return NextResponse.json(data)
    }

    if (action === 'teklifler') {
      const teklif = asObject(body.teklif)
      const kalemler = asRows(body.kalemler)
      await validateRows([teklif], firmaId)
      const { data, error } = await supabase
        .from('teklifler')
        .insert(withFirmaId(teklif, firmaId))
        .select('id')
        .single()
      if (error) throw error
      if (!data?.id) return NextResponse.json({ error: 'Teklif ID alınamadı' }, { status: 500 })

      if (kalemler.length > 0) {
        const { error: kalemError } = await supabase.from('teklif_kalemleri').insert(
          kalemler.map(kalem => withFirmaId({ ...kalem, teklif_id: data.id }, firmaId)),
        )
        if (kalemError) {
          await supabase.from('teklifler').delete().eq('id', data.id)
          throw kalemError
        }
      }
      return NextResponse.json({ id: data.id })
    }

    if (action === 'proforma_faturalar') {
      const proforma = asObject(body.proforma)
      const kalemler = asRows(body.kalemler)
      await validateRows([proforma], firmaId)
      const { data, error } = await supabase
        .from('proforma_faturalar')
        .insert(withFirmaId(proforma, firmaId))
        .select('id')
        .single()
      if (error) throw error
      if (!data?.id) return NextResponse.json({ error: 'Proforma ID alınamadı' }, { status: 500 })

      if (kalemler.length > 0) {
        const { error: kalemError } = await supabase.from('proforma_fatura_kalemleri').insert(
          kalemler.map(kalem => withFirmaId({ ...kalem, proforma_id: data.id }, firmaId)),
        )
        if (kalemError) {
          await supabase.from('proforma_faturalar').delete().eq('id', data.id)
          throw kalemError
        }
      }
      return NextResponse.json({ id: data.id })
    }

    if (action === 'teknik_raporlar') {
      const row = asObject(body.payload)
      await validateRows([row], firmaId)
      const { data, error } = await supabase
        .from('teknik_raporlar')
        .insert(withFirmaId(row, firmaId))
        .select('id')
        .single()
      if (error) throw error
      return NextResponse.json(data)
    }

    if (action === 'on_kayitlar') {
      const row = asObject(body.payload)
      await validateRows([row], firmaId)
      const { data, error } = await supabase
        .from('on_kayitlar')
        .insert(withFirmaId(row, firmaId))
        .select('id')
        .single()
      if (error) throw error
      return NextResponse.json(data)
    }

    return NextResponse.json({ error: 'Geçersiz kayıt tipi' }, { status: 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Beklenmeyen hata'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
