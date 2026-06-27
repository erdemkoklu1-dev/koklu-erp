# Tenant RLS Production Risk Assessment - Real Inventory

## Genel Karar

Production RLS policy temizliği şu anda yapılmayacak. Bu sprint yalnızca gerçek production envanterine göre staging/local cleanup ve tenant policy dry-run hazırlığıdır.

## Neden

- 59 adet fazla izin veren policy var.
- Bazı tenant kritik tablolarda policy yok: `invoices`, `invoice_items`, `payments`.
- Bazı policy'ler anon/public `true` veriyor.
- `is_super_admin` helper production rol adıyla uyuşmayabilir.
- `current_user_role` ve `current_user_sube_id` helper'ları eksik.
- Staging dry-run ve rollback provası yapılmadı.

## En Riskli Tablolar

| Tablo | Risk |
| --- | --- |
| `araci_cari_hareketleri` | anon ALL true |
| `mutabakat_formlari` | anon ALL true |
| `sube_gider_gelir` | anon ALL true |
| `teklifler` | public ALL true |
| `teslimatlar` | public ALL true |
| `customers` | geniş select/insert/update |
| `devices` | geniş select/insert/update |
| `service_forms` | geniş select/insert/update/delete |
| `invoices` | RLS açık, policy yok |
| `payments` | RLS açık, policy yok |

## Production Öncesi Zorunlu Adımlar

- Staging DB oluştur.
- Helper upgrade staging'de test et.
- Gerçek policy cleanup staging'de test et.
- Tenant policy apply staging'de test et.
- Negatif testleri tamamla.
- Rollback provasını yap.
- Production için ayrı bakım penceresi ve backup planı hazırla.

## Production Kararı

Hazır değil. Production policy cleanup için staging test matrisi ve rollback provası tamamlanmadan ilerlenmemeli.

## Staging Dry-Run Risk Azaltımı (Sprint 2.0)

Production riskini düşürmek için tüm değişiklikler önce izole staging/local ortamda dry-run ile denenir. Bu sprintte hazırlanan ortam ve kontrol dosyaları:

- `db/staging_rls_environment_setup.md` — production'dan izole staging ortam kurulumu.
- `db/staging_rls_execution_order.md` — dry-run çalıştırma sırası ve durdurma kuralı.
- `db/staging_rls_preflight_checks.sql` — apply öncesi read-only durum kontrolü.
- `db/staging_rls_post_apply_checks.sql` — apply sonrası read-only doğrulama.
- `db/staging_rls_manual_test_results.md` — manuel test ve negatif test sonuç şablonu.
- `db/staging_rls_go_no_go_report.md` — Go/No-Go karar raporu.

Bu dosyalar production'da çalıştırılmaz; yalnızca staging dry-run sürecini yönetir. Production karar gerekçesi, bu dry-run sonuçları `staging_rls_go_no_go_report.md` üzerinden **Go** olarak işaretlenene kadar değişmez.
