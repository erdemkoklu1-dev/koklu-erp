import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.generated'

/**
 * Generated `Database` şemasına **bağlı** service-role istemcisi.
 *
 * Neden ayrı bir factory:
 *   `src/lib/supabase/{service,server,client}.ts` genel istemcileri henüz
 *   `Database` generic'ine bağlanamıyor. Sebebi bir tercih değil, kanıtlanmış bir
 *   şema boşluğu: `customers`, `devices`, `service_forms`, `service_form_items`
 *   tablolarının CREATE TABLE migration'ı repoda YOK
 *   (`db/staging_migration_inventory.md` → "Kritik Gözlem"), bu yüzden generated
 *   tipte kolonları eksik. Genel istemciler bağlandığında bu dört tablo yüzünden
 *   301 TypeScript hatası oluşuyor — hepsi eksik şemadan kaynaklanıyor.
 *
 *   GOREV.md §15 bu durumu açık bir durma koşulu sayıyor: "`service_forms` veya
 *   diğer gerekli tabloların kanonik schema kaynağı belirsiz". Bu yüzden eksik
 *   kolonlar UYDURULMADI ve tip `any` ile etkisizleştirilMEDİ.
 *
 * Bu factory, şeması kanıtlanmış tablolar ve atomik RPC'ler üzerinde çalışan
 * **yeni/etkilenen** kod yollarına (teslimat, fatura, aggregate) gerçek tip
 * güvenliği sağlar. Şema boşluğu kapatıldığında genel istemciler de aynı
 * generic'e bağlanabilir ve bu dosya kaldırılabilir.
 *
 * Sonraki adım: dört tablo için CREATE TABLE migration'ı eklenmeli VEYA Gate 0'dan
 * geçmiş bir staging şemasından schema-only tanım alınmalıdır.
 */
export function createTypedServiceClient(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export type TypedServiceClient = SupabaseClient<Database>
