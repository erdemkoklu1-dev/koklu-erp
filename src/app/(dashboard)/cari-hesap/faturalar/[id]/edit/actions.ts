'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createTypedServiceClient } from '@/lib/supabase/typed'
import { assertBranchBelongsToFirma, assertCustomerBelongsToFirma, requireCurrentFirmaId } from '@/lib/auth/tenant-scope'
import { mapInvoiceRpcError, planInvoiceLines, type InvoiceErrorCode } from '@/lib/invoice/invoice-update'

export type UpdateInvoiceResult =
  | { success: true }
  | { success: false; error: string; code?: InvoiceErrorCode }

interface ItemUpdate {
  id: string
  description: string
  quantity: number
  unit: string
  unit_price: number
  kdv_rate: number
}

interface ItemInsert {
  line_order: number
  description: string
  quantity: number
  unit: string
  unit_price: number
  kdv_rate: number
}

interface BrokerUpdate {
  id: string
  commission_rate: number
  commission_amount: number
}

interface BrokerInsert {
  broker_id: string
  commission_rate: number
  commission_amount: number
}

type InvoiceData = {
  invoice_type: string
  customer_id: string | null
  musteri_unvan?: string | null
  musteri_vergi_no?: string | null
  musteri_telefon?: string | null
  musteri_email?: string | null
  musteri_adres?: string | null
  musteri_il?: string | null
  musteri_ilce?: string | null
  supplier_name: string | null
  supplier_tax_no: string | null
  tedarikci_adres?: string | null
  tedarikci_il?: string | null
  tedarikci_ilce?: string | null
  invoice_date: string
  due_date: string | null
  subtotal: number
  kdv_amount: number
  stopaj_rate: number
  stopaj_amount: number
  total_amount: number
  description: string | null
  notes: string | null
  sube_id: string | null
}

/**
 * Fatura düzenleme — **tek PostgreSQL transaction** içinde.
 *
 * Eski akış (denetim raporu §2.5):
 *   - yazmalar sıralı ve transaction dışındaydı ⇒ ortada hata olursa fatura
 *     kısmen güncellenmiş kalıyordu;
 *   - **silme ilk adımdaydı** ⇒ kayıpsız sıra kuralına aykırı;
 *   - `invoice_items` silme/güncelleme yalnızca `eq('id', ...)` ile yapılıyordu
 *     ⇒ başka faturaya ait bir kalem kimliği gönderilirse o satır siliniyordu.
 *
 * Artık her `invoice_items` / `invoice_brokers` mutasyonu `id + invoice_id`
 * çiftiyle sınırlıdır, etkilenen satır sayısı doğrulanır ve uyuşmazlıkta bütün
 * işlem rollback olur.
 */
export async function updateInvoiceAction(
  invoiceId: string,
  invoiceData: InvoiceData,
  itemsToDelete: string[],
  itemsToUpdate: ItemUpdate[],
  itemsToInsert: ItemInsert[],
  brokersToDelete: string[],
  brokersToUpdate: BrokerUpdate[],
  brokersToInsert: BrokerInsert[],
  options: { expectedUpdatedAt?: string | null; idempotencyKey?: string | null } = {},
): Promise<UpdateInvoiceResult> {
  const supabase = createServiceClient()

  let firmaId: string
  let userId: string | null = null

  // ── Tenant güvenliği: fatura kullanıcının firmasına ait mi + şube/müşteri uyumu ──
  try {
    firmaId = await requireCurrentFirmaId()
    const authClient = await createServerClient()
    const { data: { user } } = await authClient.auth.getUser()
    userId = user?.id ?? null

    const { data: existing, error: readErr } = await supabase
      .from('invoices')
      .select('id, firma_id')
      .eq('id', invoiceId)
      .maybeSingle()
    if (readErr) return { success: false, error: readErr.message }
    if (!existing) return { success: false, error: 'Fatura bulunamadı.' }
    if (existing.firma_id !== firmaId) {
      return { success: false, error: 'Bu kayıt kullanıcının firmasına ait değil.' }
    }
    await assertBranchBelongsToFirma(invoiceData.sube_id, firmaId)
    await assertCustomerBelongsToFirma(invoiceData.customer_id, firmaId)
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Firma doğrulaması başarısız.' }
  }

  // ── Mevcut alt satır kimlikleri: YALNIZCA bu faturaya ait olanlar ──
  const [{ data: existingItems, error: itemsReadErr }, { data: existingBrokers, error: brokersReadErr }] =
    await Promise.all([
      supabase.from('invoice_items').select('id').eq('invoice_id', invoiceId),
      supabase.from('invoice_brokers').select('id').eq('invoice_id', invoiceId),
    ])
  if (itemsReadErr) return { success: false, error: mapInvoiceRpcError(itemsReadErr).message }
  if (brokersReadErr) return { success: false, error: mapInvoiceRpcError(brokersReadErr).message }

  // ── Yabancı kimlik daha DB'ye gitmeden reddedilir (son söz RPC'nindir) ──
  const plan = planInvoiceLines(
    (existingItems ?? []).map(row => String(row.id)),
    (existingBrokers ?? []).map(row => String(row.id)),
    {
      items: [
        ...itemsToUpdate.map(item => ({
          id: item.id,
          fields: {
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unit_price: item.unit_price,
            kdv_rate: item.kdv_rate,
          },
        })),
        ...itemsToInsert.map(item => ({
          id: null,
          fields: {
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unit_price: item.unit_price,
            kdv_rate: item.kdv_rate,
            line_order: item.line_order,
          },
        })),
      ],
      deleteItemIds: itemsToDelete,
      brokers: [
        ...brokersToUpdate.map(b => ({
          id: b.id,
          fields: { commission_rate: b.commission_rate, commission_amount: b.commission_amount },
        })),
        ...brokersToInsert.map(b => ({
          id: null,
          fields: {
            broker_id: b.broker_id,
            commission_rate: b.commission_rate,
            commission_amount: b.commission_amount,
          },
        })),
      ],
      deleteBrokerIds: brokersToDelete,
      // Kullanıcı bütün kalemleri silmek istiyorsa bunu açık niyetle taşımalı.
      confirmDeleteAllLines: false,
    },
  )
  if (!plan.ok) return { success: false, error: plan.error.message, code: plan.error.code }

  // ── Tek atomik çağrı ──
  // Generated `Database` şemasına bağlı istemci: RPC argümanları `any` değildir.
  const typed = createTypedServiceClient()
  const { error: rpcError } = await typed.rpc('invoice_update_atomic', {
    p_invoice_id: invoiceId,
    p_invoice_patch: invoiceData,
    p_items: plan.value.items,
    p_delete_item_ids: plan.value.deleteItemIds,
    p_brokers: plan.value.brokers,
    p_delete_broker_ids: plan.value.deleteBrokerIds,
    p_confirm_delete_all: false,
    p_expected_updated_at: options.expectedUpdatedAt ?? null,
    p_idempotency_key: options.idempotencyKey ?? null,
    p_user_id: userId,
    p_firma_id: firmaId,
  })

  if (rpcError) {
    // Sessizce eski güvensiz (kapsamsız `eq('id')`) akışa DÜŞÜLMEZ.
    console.error('[updateInvoiceAction] rpc hatası:', { invoiceId, code: rpcError.code })
    const mapped = mapInvoiceRpcError(rpcError)
    return { success: false, error: mapped.message, code: mapped.code }
  }

  revalidatePath('/cari-hesap/gelen-faturalar')
  revalidatePath('/cari-hesap/giden-faturalar')
  revalidatePath('/cari-hesap/faturalar')
  revalidatePath(`/cari-hesap/faturalar/${invoiceId}`)
  revalidatePath(`/cari-hesap/faturalar/${invoiceId}/edit`)

  return { success: true }
}
