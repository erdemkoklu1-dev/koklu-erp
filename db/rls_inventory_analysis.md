# RLS Inventory Analysis

Bu dosya ilk analiz şablonudur. `db/rls_inventory_output_template.md` doldurulup gerçek SQL çıktıları paylaşıldıktan sonra somut tablo/policy kararları buraya işlenecektir.

## Production Read-Only Çıktı Bekleniyor

Bu analiz dosyası, kullanıcı Supabase SQL Editor'dan read-only çıktıları aldıktan sonra doldurulacaktır. Henüz production policy temizliği veya RLS uygulanmamıştır.

## 1. Genel Özet

- İncelenen tablo sayısı: 56 public tablo
- RLS açık tablo sayısı: 56
- RLS kapalı tablo sayısı: 0
- Force RLS açık tablo sayısı: 0
- Mevcut policy sayısı: production çıktısında çok sayıda mevcut policy var
- Fazla izin veren policy sayısı: 59
- Eksik helper fonksiyon sayısı: 2 (`current_user_role`, `current_user_sube_id`)
- Eksik `firma_id` kolonu olan tenant tablo sayısı: kritik tenant tablolarda yok; `firmalar` için `firma_id` olmaması normal

## 2. Tenant RLS'e Hazır Tablolar

| Tablo | firma_id var mı | RLS durumu | Mevcut policy riski | Hazır mı |
| --- | ---: | --- | --- | --- |
| customers | Evet | açık | geniş select/insert/update | Staging cleanup sonrası |
| devices | Evet | açık | geniş select/insert/update | Staging cleanup sonrası |
| service_forms | Evet | açık | geniş select/insert/update/delete | Staging cleanup sonrası |
| service_form_items | Evet | açık | `sfi_all` | Staging cleanup sonrası |
| invoices | Evet | açık | policy yok | Tenant policy eklenince |
| invoice_items | Evet | açık | policy yok | Tenant policy eklenince |
| invoice_brokers | Evet | açık | geniş authenticated | Staging cleanup sonrası |
| payments | Evet | açık | policy yok | Tenant policy eklenince |
| teslimatlar | Evet | açık | public true | Staging cleanup sonrası |
| teslimat_kalemleri | Evet | açık | public true | Staging cleanup sonrası |
| teklifler | Evet | açık | public true | Staging cleanup sonrası |
| teklif_kalemleri | Evet | açık | public true | Staging cleanup sonrası |
| proforma_faturalar | Evet | açık | `auth.uid() IS NOT NULL` | Staging cleanup sonrası |
| proforma_fatura_kalemleri | Evet | açık | `auth.uid() IS NOT NULL` | Staging cleanup sonrası |
| teknik_raporlar | Evet | açık | `auth.uid() IS NOT NULL` | Staging cleanup sonrası |
| musteri_talepleri | Evet | açık | auth/public wide | Staging cleanup sonrası |
| is_planlari | Evet | açık | auth/public wide | Staging cleanup sonrası |
| planli_isler | Evet | açık | auth/public wide | Staging cleanup sonrası |
| brokers | Evet | açık | geniş authenticated | Staging cleanup sonrası |
| araci_cari_hareketleri | Evet | açık | anon/public true | Staging cleanup sonrası |

## 3. Fazla İzin Veren Policy'ler

| Tablo | Policy | Risk | Staging önerisi | Production önerisi |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## 4. Korunacak Policy'ler

| Tablo | Policy | Neden korunacak |
| --- | --- | --- |
|  |  |  |

## 5. Kaldırılması Gereken Policy'ler

Bu liste sadece staging dry-run içindir. Production kararı için staging test ve rollback provası gerekir.

| Tablo | Policy | Drop sırası | Not |
| --- | --- | --- | --- |
|  |  |  |  |

## 6. Helper Fonksiyon Analizi

| Fonksiyon | Durum | Risk | Öneri |
| --- | --- | --- | --- |
| current_firma_id | Var | Aktif kullanıcı kontrolü staging'de doğrulanmalı | `aktif = true` ile staging upgrade |
| is_super_admin | Var | `Super Admin` bekliyor, production rolü `Admin` görünüyor | `Admin` ve `Super Admin` destekli staging upgrade |
| current_user_role | Yok | Rol bazlı policy için eksik | Staging helper olarak oluştur |
| current_user_sube_id | Yok | Şube policy için eksik | Staging helper olarak oluştur |

## 6.1 Veri Temizlik Özeti

- `firma_id` boş kayıt yok.
- Parent-child firma uyumsuzluğu yok.
- Şube-firma uyumsuzluğu yok.
- Production read-only Bölüm 7 sonucu: 38/38 kontrol `0`.

## 7. RLS Dry-Run Riskleri

- Service role route riskleri:
- Client-side anon query riskleri:
- Dashboard aggregate riskleri:
- PDF/yazdırma riskleri:
- Import/supplier match riskleri:
- Şube kapsamı riskleri:
- Global lookup tablo riskleri:

## 8. Son Karar

Production RLS:

- Hazır değil / Staging dry-run sonrası tekrar değerlendirilecek.

Gerekçe:

- Production'da RLS zaten açık olsa da 59 fazla izin veren policy var.
- Gerçek policy cleanup, helper upgrade, tenant policy apply, negatif test ve rollback provası staging/local ortamda tamamlanmadan production policy değişikliği yapılmamalı.
