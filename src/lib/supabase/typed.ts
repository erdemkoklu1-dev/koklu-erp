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
 *   tipte kolonları eksik.
 *
 *   ── GERÇEK ÖLÇÜM (2026-08-02, bu sprintte yeniden yapıldı) ────────────────
 *   `createServiceClient`'a `Database` bağlanıp `tsc --noEmit` çalıştırıldığında:
 *
 *       toplam hata                              125  →  118
 *       ├─ eksik dört tablo kaynaklı              76  →   76   (BLOKE)
 *       ├─ eksik FK ilişkisi kaynaklı              7  →    0   (bu sprintte ÇÖZÜLDÜ)
 *       └─ diğer uygulama tarafı daraltma hataları 42  →   42
 *
 *   Not: önceki oturumun raporundaki "301 hata" değeri hata SATIRLARINI değil
 *   devam satırlarını da sayıyordu; gerçek hata sayısı yukarıdadır.
 *
 *   İkinci sütun, üretecin `Relationships` alanını gerçek FK'lerden doldurmasından
 *   sonrasıdır: gömülü kaynak sorguları (`select('a, subeler(ad)')`) artık tip
 *   düzeyinde çözülüyor.
 *
 *   Kalan 76 hata kolon uydurmadan kapatılamaz; kalan 42 hata ise ancak bu 76
 *   kapandıktan sonra gerçekten doğrulanabilir (aksi hâlde derlenemeyen bir
 *   ağaçta körlemesine düzeltme olur). GOREV.md §11 eksik şemayı tahmin ederek
 *   tipe kolon eklemeyi ve hataları `any` ile bastırmayı YASAKLIYOR; ikisi de
 *   yapılmadı.
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
