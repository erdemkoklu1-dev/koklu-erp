# Tenant RLS Staging Test Matrix - Real Policy Cleanup

## Ön Koşullar

- Staging/local Supabase kullanılıyor.
- Production kullanılmıyor.
- En az iki firma var.
- En az iki kullanıcı var.
- Helper upgrade staging'de uygulandı.
- Cleanup staging'de uygulandı.
- Tenant policies staging'de uygulandı.
- Staging snapshot/backup hazır.

## Test Matrisi

| Modül | Liste | Detay | Oluşturma | Güncelleme | PDF/Yazdırma | Negatif Başka Firma Testi | Sonuç |
| --- | --- | --- | --- | --- | --- | --- | --- |
| customers |  |  |  |  | - |  |  |
| devices |  |  |  |  | - |  |  |
| service_forms |  |  |  |  |  |  |  |
| invoices |  |  |  |  |  |  |  |
| payments | - | - |  | - | - |  |  |
| teslimatlar |  |  |  |  |  |  |  |
| teklifler |  |  |  |  |  |  |  |
| proforma_faturalar |  |  |  |  |  |  |  |
| teknik_raporlar |  |  |  |  |  |  |  |
| operasyon |  |  |  |  |  |  |  |
| brokers/araci_cari |  |  |  |  | - |  |  |
| dashboard |  | - | - | - | - |  |  |

## Kritik Negatif Testler

- Başka firma müşterisi listede görünmemeli.
- Başka firma müşteri detay URL'si 404/yetkisiz olmalı.
- Başka firma faturasına ödeme eklenememeli.
- Başka firma servis formu PDF üretilememeli.
- Başka firma teklif/proforma PDF üretilememeli.
- Başka firma teknik rapor copy/quote/cancel engellenmeli.
- Başka firma aracı cari hareketi görünmemeli.
- Dashboard başka firma aggregate değerlerini içermemeli.

## Başarı Kriteri

- Normal kullanıcı yalnızca kendi firma verisini görür.
- Admin/Super Admin rol helper'ı staging'de beklenen sonucu verir.
- Service role route'larında manuel firma kontrolü çalışır.
- DELETE policy eklenmediği halde uygulama soft-delete/cancel akışları bozulmaz.

## Dry-Run Bağlantısı (Sprint 2.0)

Bu matris, staging dry-run akışının 6. adımında doldurulur. Çalıştırma sırası ve sonuç şablonu için bkz:

- `db/staging_rls_execution_order.md` — çalıştırma sırası.
- `db/staging_rls_preflight_checks.sql` — apply öncesi durum kontrolü.
- `db/staging_rls_post_apply_checks.sql` — apply sonrası doğrulama.
- `db/staging_rls_manual_test_results.md` — manuel test sonuç şablonu (bu matrisin sonuçları oraya da işlenir).
- `db/staging_rls_go_no_go_report.md` — Go/No-Go kararı.

Matristeki her satır, `staging_rls_manual_test_results.md` içindeki "Negatif Tenant Testleri" bölümüyle tutarlı doldurulmalıdır.
