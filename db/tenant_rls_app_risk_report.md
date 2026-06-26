# Tenant RLS Uygulama Risk Raporu - Sprint 1.6

## Özet

Sprint 1.6 kapsamında production üzerinde RLS açılmadı, policy silinmedi, policy oluşturulmadı ve `firma_id NOT NULL` yapılmadı. Çalışma, RLS öncesi policy envanteri ve staging hazırlık dokümantasyonudur.

Production RLS için şu an hazır değiliz. Staging'de policy değişikliği, client-side anon sorgu davranışı ve rollback provası tamamlanmadan production geçişi yapılmamalı.

## RLS'e Hazır Aday Tablolar

Audit scriptleri staging/canlıda 0 uyumsuzluk döndürürse RLS'e hazır adaylar:

`customers`, `devices`, `service_forms`, `service_form_items`, `invoices`, `invoice_items`, `invoice_brokers`, `payments`, `teslimatlar`, `teslimat_kalemleri`, `teklifler`, `teklif_kalemleri`, `proforma_faturalar`, `proforma_fatura_kalemleri`, `teknik_raporlar`, `musteri_talepleri`, `is_planlari`, `brokers`, `araci_cari_hareketleri`.

## Ek Test İsteyen Tablolar ve Alanlar

| Alan | Risk | Gereken test |
| --- | --- | --- |
| `planli_isler` | Sprint 1.5 raporunda ilişki uyumu için tekrar test notu var | Parent/şube/firma uyumu ve yeni kayıt akışı staging'de doğrulanmalı |
| Client-side anon sorgular | RLS kapalıyken uygulama mantığına bağlı izolasyon; RLS açılınca davranış değişebilir | Müşteri/cihaz/aracı seçim listeleri ve edit ekranları gerçek kullanıcıyla test edilmeli |
| `subeler` | Hem tenant ilişkisi hem global seçim/şube yetkisi davranışı var | Ayrı policy tasarımı ve şube kullanıcısı testi gerekli |
| Global lookup tabloları | Tenant verisi taşımayan tablolar yanlışlıkla tenant policy ile kırılabilir | `urunler`, teknik ayarlar, ayar tabloları ayrı sınıflandırılmalı |
| Service role route'ları | RLS'i bypass eder | Manuel `firma_id` kontrolleri korunmalı ve negatif API testleri yapılmalı |

## Mevcut Fazla İzin Veren Policy Riskleri

Migration taramasında aşağıdaki policy türleri görüldü:

- `USING (true)` / `WITH CHECK (true)`: tenant ayrımı yapmaz.
- `auth.uid() is not null`: tüm authenticated kullanıcıları aynı kapsamda görür.
- `anon_all`: oturum açmamış role için de geniş erişim riski taşır.

Bu policy'ler tenant policy hazır olmadan kaldırılmamalı; ancak production RLS sertleştirmesi için staging'de temizlenmeleri gerekir.

## Uygulama Katmanı Riski

- Server component ve API route'ların çoğunda `applyTenantScope`, `requireCurrentFirmaId`, `assertBranchBelongsToFirma`, `assertCustomerBelongsToFirma` kullanımı mevcut.
- Service role kullanılan route'larda RLS'e güvenilmemeli; manuel firma kontrolü ana güvenlik katmanı olarak kalmalı.
- Dashboard için doğru filtre sırası hedefleniyor: önce firma, sonra şube, sonra sayfa/arama/tarih/durum filtreleri.
- PDF/yazdırma route'ları id bazlı olduğu için staging negatif testleri zorunlu.

## Production Geçiş Riski

| Risk | Etki | Azaltım |
| --- | --- | --- |
| Fazla izin veren policy kalması | Firmalar arası veri görünürlüğü | `rls_policy_inventory.sql` ile geçiş öncesi/sonrası envanter |
| Tenant policy eksikliği | Ekran/API veri göremez veya yazamaz | Küçük batch, staging smoke test, rollback planı |
| Service role bypass | RLS beklenen korumayı sağlamaz | Manuel firma kontrolleri ve 403 negatif testleri |
| Client-side anon sorgu kırılması | Seçim listeleri veya edit ekranları boş kalabilir | RLS sonrası ekran bazlı test |
| Helper fonksiyon hatası | Tüm tenant filtreleri yanlış çalışır | `rls_helper_checks.sql` ve kullanıcı bazlı test |

## Karar

Production RLS için hazır değiliz. Hazır olmak için staging'de en az bir tam tablo grubu üzerinde tenant policy, fazla izin veren policy temizliği, negatif erişim testleri ve rollback provası tamamlanmalı.
