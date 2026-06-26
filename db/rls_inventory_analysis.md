# RLS Inventory Analysis

Bu dosya ilk analiz şablonudur. `db/rls_inventory_output_template.md` doldurulup gerçek SQL çıktıları paylaşıldıktan sonra somut tablo/policy kararları buraya işlenecektir.

## 1. Genel Özet

- İncelenen tablo sayısı:
- RLS açık tablo sayısı:
- RLS kapalı tablo sayısı:
- Force RLS açık tablo sayısı:
- Mevcut policy sayısı:
- Fazla izin veren policy sayısı:
- Eksik helper fonksiyon sayısı:
- Eksik `firma_id` kolonu olan tenant tablo sayısı:

## 2. Tenant RLS'e Hazır Tablolar

| Tablo | firma_id var mı | RLS durumu | Mevcut policy riski | Hazır mı |
| --- | ---: | --- | --- | --- |
| customers |  |  |  |  |
| devices |  |  |  |  |
| service_forms |  |  |  |  |
| service_form_items |  |  |  |  |
| invoices |  |  |  |  |
| invoice_items |  |  |  |  |
| invoice_brokers |  |  |  |  |
| payments |  |  |  |  |
| teslimatlar |  |  |  |  |
| teslimat_kalemleri |  |  |  |  |
| teklifler |  |  |  |  |
| teklif_kalemleri |  |  |  |  |
| proforma_faturalar |  |  |  |  |
| proforma_fatura_kalemleri |  |  |  |  |
| teknik_raporlar |  |  |  |  |
| musteri_talepleri |  |  |  |  |
| is_planlari |  |  |  |  |
| planli_isler |  |  |  |  |
| brokers |  |  |  |  |
| araci_cari_hareketleri |  |  |  |  |

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
| current_firma_id |  |  |  |
| is_super_admin |  |  |  |
| current_user_role |  |  |  |
| current_user_sube_id |  |  |  |

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

-
