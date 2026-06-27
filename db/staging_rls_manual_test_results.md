# Staging RLS Dry-Run Manuel Test Sonuç Şablonu

> Yalnızca staging/local Supabase için doldurulur. Production'da hiçbir test çalıştırılmaz.

Bu şablon, `db/staging_rls_execution_order.md` adımlarının sonuçlarını kayıt altına almak içindir. Her bölümü çalıştırma sırasında doldur. Boş bırakılan satır "yapılmadı" sayılır.

## 0. Ortam Bilgisi

| Alan | Değer |
| --- | --- |
| Tarih | |
| Çalıştıran | |
| Ortam (staging projesi / local docker) | |
| Supabase proje adı | |
| Production değil mi? (Evet/Hayır) | |
| Snapshot/backup alındı mı? | |
| Firma sayısı | |
| Kullanıcı sayısı | |
| Admin/Super Admin rolü var mı? | |

## 1. Preflight Sonuçları (`staging_rls_preflight_checks.sql`)

| Kontrol | Beklenen | Gözlenen | Sonuç |
| --- | --- | --- | --- |
| Public tablo sayısı | ~56 | | |
| RLS açık tablo sayısı | tablo sayısı ile aynı | | |
| Force RLS açık tablo sayısı | 0 | | |
| RLS kapalı tablo (Bölüm 2) | 0 satır | | |
| Helper fonksiyon sayısı (Bölüm 3) | 2 (upgrade öncesi) | | |
| Düşürülecek riskli policy'ler (Bölüm 4) | mevcut | | |
| Tenant policy'ler (Bölüm 5) | 0 satır | | |
| anon açık policy'ler (Bölüm 6) | mevcut (riskli) | | |
| Policy'siz RLS tabloları (Bölüm 7) | invoices/invoice_items/payments | | |
| firma_id boş kayıt (Bölüm 8) | tümü 0 | | |

Notlar:

-

## 2. Helper Upgrade Sonuçları (`tenant_rls_helper_upgrade_staging.sql`)

| Fonksiyon | Oluştu/Güncellendi mi | Sonuç |
| --- | --- | --- |
| current_firma_id | | |
| is_super_admin | | |
| current_user_role | | |
| current_user_sube_id | | |

Notlar:

-

## 3. Cleanup Sonuçları (`tenant_rls_staging_cleanup_real.sql`)

| Kontrol | Beklenen | Gözlenen | Sonuç |
| --- | --- | --- | --- |
| Öncelik 1 riskli policy'ler düştü | Evet | | |
| Öncelik 2 "Service role has full access" policy'leri düştü | Evet | | |
| Hata/uyarı çıktı mı | Hayır | | |

Notlar:

-

## 4. Apply Sonuçları (`tenant_rls_staging_apply_tenant_policies_real.sql`)

| Kontrol | Beklenen | Gözlenen | Sonuç |
| --- | --- | --- | --- |
| Tenant policy'ler oluştu | Evet | | |
| Özel policy'ler (firmalar/kullanici_profiller/subeler) oluştu | Evet | | |
| Hata/uyarı çıktı mı | Hayır | | |

Notlar:

-

## 5. Post-Apply Sonuçları (`staging_rls_post_apply_checks.sql`)

| Kontrol | Beklenen | Gözlenen | Sonuç |
| --- | --- | --- | --- |
| Helper fonksiyon sayısı (Bölüm 1) | 4 | | |
| is_super_admin tanımı 'admin' içeriyor (Bölüm 2) | Evet | | |
| Kalan riskli policy (Bölüm 3) | 0 satır | | |
| Tenant policy'ler (Bölüm 4) | mevcut | | |
| Tenant policy sayısı her tabloda >= 3 (Bölüm 5) | Evet | | |
| Özel policy'ler (Bölüm 6) | 4 satır | | |
| anon açık tenant policy (Bölüm 7) | 0 (tenant tablolarında) | | |
| Policy'siz RLS tabloları (Bölüm 8) | invoices/invoice_items/payments yok | | |

Notlar:

-

## 6. Uygulama Smoke Testleri

| Test | Beklenen | Gözlenen | Sonuç |
| --- | --- | --- | --- |
| `npx.cmd tsc --noEmit` | Hata yok | | |
| `npm run build` | Başarılı | | |
| Login + dashboard açılıyor | Evet | | |
| Köklü kullanıcısı kendi verisini görüyor | Evet | | |
| Fatura ödeme akışı çalışıyor | Evet | | |
| Servis formu + kalemleri çalışıyor | Evet | | |
| Teklif/proforma PDF üretiliyor | Evet | | |
| Teknik rapor copy/quote/cancel çalışıyor | Evet | | |

## 7. Negatif Tenant Testleri

| Senaryo | Beklenen | Gözlenen | Sonuç |
| --- | --- | --- | --- |
| Başka firma müşterisi listede görünmüyor | Görünmemeli | | |
| Başka firma müşteri detay URL'si 404/yetkisiz | Engellenmeli | | |
| Başka firma faturasına ödeme eklenemiyor | Engellenmeli | | |
| Başka firma servis formu PDF üretilemiyor | Engellenmeli | | |
| Başka firma teklif/proforma PDF üretilemiyor | Engellenmeli | | |
| Başka firma teknik rapor copy/quote/cancel engelleniyor | Engellenmeli | | |
| Başka firma aracı cari hareketi görünmüyor | Görünmemeli | | |
| Dashboard başka firma aggregate değerini içermiyor | İçermemeli | | |
| Client-side anon sorgu başka firma verisi döndürmüyor | Döndürmemeli | | |
| Admin/Super Admin tüm firmaları görebiliyor | Görebilmeli | | |

## 8. Rollback Provası (`tenant_rls_staging_rollback_real.sql`)

| Kontrol | Beklenen | Gözlenen | Sonuç |
| --- | --- | --- | --- |
| Tenant policy'ler kaldırıldı | Evet | | |
| Snapshot restore denendi (opsiyonel) | | |
| Rollback sonrası uygulama açılıyor | Evet | | |
| Rollback sonrası policy envanteri alındı | Evet | | |

Notlar:

-

## 9. Genel Değerlendirme

| Alan | Değer |
| --- | --- |
| Tüm preflight kontrolleri geçti mi | |
| Tüm post-apply kontrolleri geçti mi | |
| Tüm negatif testler geçti mi | |
| Rollback provası başarılı mı | |
| Karar (Go / No-Go / Tekrar değerlendir) | |

Açık sorunlar / engeller:

-
