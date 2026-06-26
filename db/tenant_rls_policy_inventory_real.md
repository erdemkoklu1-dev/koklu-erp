# Tenant RLS Real Policy Inventory

Bu doküman production read-only envanter sonuçlarının analiz edilmiş halidir. Production üzerinde RLS, policy veya veri değişikliği yapılmamıştır.

## 1. Genel Özet

- Public tablo sayısı: 56
- RLS açık tablo sayısı: 56
- Force RLS açık tablo sayısı: 0
- Fazla izin veren policy sayısı: 59

## 2. Production Veri Durumu

- `firma_id` boş kayıt: yok
- Parent-child uyumsuzluk: yok
- Şube-firma uyumsuzluk: yok
- Bölüm 7 veri temizlik kontrolü: 38/38 sonuç `0`

## 3. Helper Fonksiyon Durumu

| Fonksiyon | Var mı | Durum | Risk |
| --- | --- | --- | --- |
| `current_firma_id` | Evet | Çalışır | `aktif = true` kontrolü staging'de doğrulanmalı |
| `is_super_admin` | Evet | Rol adı `Super Admin` bekliyor | Production'da rol adı `Admin` görünüyor; admin kullanıcılar helper'a takılabilir |
| `current_user_role` | Hayır | Eksik | Şube/rol policy için gerekli olabilir |
| `current_user_sube_id` | Hayır | Eksik | Şube policy için gerekli olabilir |

## 4. Riskli Policy Listesi

| Tablo | Policy | Rol | Komut | Risk Pattern | Staging Aksiyonu |
| --- | --- | --- | --- | --- | --- |
| `araci_cari_hareketleri` | `anon_all` | anon | ALL | `true` | Drop + tenant policy |
| `araci_cari_hareketleri` | `auth_all` | authenticated | ALL | `true` | Drop + tenant policy |
| `mutabakat_formlari` | `anon_full_access` | anon | ALL | `true` | Bu sprint dışında ayrı model |
| `sube_gider_gelir` | `anon_all` | anon | ALL | `true` | Bu sprint dışında ayrı model |
| `subeler` | `anon_read` | anon | SELECT | `true` | Özel tenant policy ile staging test |
| `customers` | `customers_select` | public/authenticated | SELECT | `true` / geniş | Drop + tenant policy |
| `customers` | `customers_insert` | public/authenticated | INSERT | `true` / geniş | Drop + tenant policy |
| `customers` | `customers_update` | public/authenticated | UPDATE | `true` / geniş | Drop + tenant policy |
| `devices` | `devices_select` | public/authenticated | SELECT | `true` / geniş | Drop + tenant policy |
| `devices` | `devices_insert` | public/authenticated | INSERT | `true` / geniş | Drop + tenant policy |
| `devices` | `devices_update` | public/authenticated | UPDATE | `true` / geniş | Drop + tenant policy |
| `service_forms` | `sf_select` | public/authenticated | SELECT | `true` / geniş | Drop + tenant policy |
| `service_forms` | `sf_insert` | public/authenticated | INSERT | `true` / geniş | Drop + tenant policy |
| `service_forms` | `sf_update` | public/authenticated | UPDATE | `true` / geniş | Drop + tenant policy |
| `service_forms` | `sf_delete` | public/authenticated | DELETE | `true` / geniş | Drop; DELETE tenant policy ekleme |
| `service_form_items` | `sfi_all` | public/authenticated | ALL | `true` / geniş | Drop + tenant policy |
| `teklifler` | `Service role has full access` | public | ALL | `true` | Drop + tenant policy |
| `teklif_kalemleri` | `Service role has full access` | public | ALL | `true` | Drop + tenant policy |
| `teslimatlar` | `Service role has full access` | public | ALL | `true` | Drop + tenant policy |
| `teslimat_kalemleri` | `Service role has full access` | public | ALL | `true` | Drop + tenant policy |
| `proforma_faturalar` | `proforma_auth_all` | authenticated | ALL | `auth.uid() IS NOT NULL` | Drop + tenant policy |
| `proforma_fatura_kalemleri` | `proforma_kalem_auth_all` | authenticated | ALL | `auth.uid() IS NOT NULL` | Drop + tenant policy |
| `teknik_raporlar` | `teknik_raporlar_auth_all` | authenticated | ALL | `auth.uid() IS NOT NULL` | Drop + tenant policy |
| `musteri_talepleri` | `operasyon_auth_all` | authenticated | ALL | `auth.uid() IS NOT NULL` | Drop + tenant policy |
| `musteri_talepleri` | `operasyon_service_all` | public | ALL | `true` | Drop + tenant policy |
| `is_planlari` | `operasyon_auth_all` | authenticated | ALL | `auth.uid() IS NOT NULL` | Drop + tenant policy |
| `is_planlari` | `operasyon_service_all` | public | ALL | `true` | Drop + tenant policy |
| `planli_isler` | `operasyon_auth_all` | authenticated | ALL | `auth.uid() IS NOT NULL` | Drop + tenant policy |
| `planli_isler` | `operasyon_service_all` | public | ALL | `true` | Drop + tenant policy |
| `brokers` | `Authenticated users can do everything on brokers` | authenticated | ALL | `true` / geniş | Drop + tenant policy |
| `invoice_brokers` | `Authenticated users can do everything on invoice_brokers` | authenticated | ALL | `true` / geniş | Drop + tenant policy |

## 5. Tenant Policy ile Değiştirilecek Kritik Tablolar

| Tablo | Mevcut Risk | Yeni Policy Mantığı |
| --- | --- | --- |
| `customers` | `true` / geniş policy | `firma_id = current_firma_id() OR is_super_admin()` |
| `devices` | `true` / geniş policy | `firma_id = current_firma_id() OR is_super_admin()` |
| `service_forms` | `true` / geniş policy | `firma_id = current_firma_id() OR is_super_admin()` |
| `service_form_items` | `true` / geniş policy | `firma_id = current_firma_id() OR is_super_admin()` |
| `invoices` | RLS açık ama policy yok | `firma_id = current_firma_id() OR is_super_admin()` |
| `invoice_items` | RLS açık ama policy yok | `firma_id = current_firma_id() OR is_super_admin()` |
| `payments` | RLS açık ama policy yok | `firma_id = current_firma_id() OR is_super_admin()` |
| `teklifler` | public ALL true | `firma_id = current_firma_id() OR is_super_admin()` |
| `teklif_kalemleri` | public ALL true | `firma_id = current_firma_id() OR is_super_admin()` |
| `teslimatlar` | public ALL true | `firma_id = current_firma_id() OR is_super_admin()` |
| `teslimat_kalemleri` | public ALL true | `firma_id = current_firma_id() OR is_super_admin()` |
| `proforma_faturalar` | `auth.uid() IS NOT NULL` | `firma_id = current_firma_id() OR is_super_admin()` |
| `proforma_fatura_kalemleri` | `auth.uid() IS NOT NULL` | `firma_id = current_firma_id() OR is_super_admin()` |
| `teknik_raporlar` | `auth.uid() IS NOT NULL` | `firma_id = current_firma_id() OR is_super_admin()` |
| `brokers` | authenticated wide | `firma_id = current_firma_id() OR is_super_admin()` |
| `araci_cari_hareketleri` | anon/public true | `firma_id = current_firma_id() OR is_super_admin()` |
| `musteri_talepleri` | auth/public wide | `firma_id = current_firma_id() OR is_super_admin()` |
| `is_planlari` | auth/public wide | `firma_id = current_firma_id() OR is_super_admin()` |
| `planli_isler` | auth/public wide | `firma_id = current_firma_id() OR is_super_admin()` |

## 6. Global/Lookup Olarak Ayrı Değerlendirilecek Tablolar

| Tablo | Mevcut Durum | Öneri |
| --- | --- | --- |
| `urunler` | public true | İlk aşamada authenticated read; yazma sadece admin |
| `roller` | authenticated true read | Kalabilir ama yazma kapalı olmalı |
| `modul_izinleri` | authenticated true read | Rol bazlı ayrıca incelenecek |
| `device_types` | public true read | Lookup ise read kalabilir |
| `teknik_hesap_ayarlari` | auth all | Ayrı ele alınmalı |
| `personel_*` | auth all | Tenant kapsamına ayrı sprintte alınmalı |
