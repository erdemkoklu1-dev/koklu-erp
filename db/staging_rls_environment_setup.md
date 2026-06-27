# Staging RLS Ortam Hazırlık Rehberi

> Bu doküman yalnızca staging/local Supabase ortamı içindir. Production Supabase üzerinde hiçbir SQL çalıştırılmaz, RLS/policy/veri değişikliği yapılmaz.

Bu rehber, tenant RLS dry-run'ının production'a dokunmadan güvenle çalıştırılabilmesi için gereken staging/local ortamın nasıl hazırlanacağını adım adım anlatır.

## 1. Amaç

- Production'dan tamamen izole bir staging/local Supabase ortamı kurmak.
- Gerçek policy envanterine göre hazırlanan helper upgrade, cleanup ve tenant policy SQL'lerini bu izole ortamda denemek.
- Negatif tenant testleri ve rollback provasını burada yapmak.
- Hiçbir aşamada production bağlantısı kullanmamak.

## 2. Kritik İzolasyon Kuralı

```txt
Bu sprintte production Supabase projesine bağlanılmaz.
Production URL, anon key veya service role key hiçbir SQL/uygulama adımında kullanılmaz.
Tüm SQL dosyaları yalnızca staging/local Supabase üzerinde çalıştırılır.
```

Bağlanmadan önce her zaman doğrula: `SELECT current_database(), inet_server_addr();` çıktısının production olmadığını kontrol et.

## 3. Staging Ortam Seçenekleri

İki yoldan biri tercih edilebilir.

### 3.1 Seçenek A — Ayrı Supabase Staging Projesi

1. Supabase üzerinde yeni bir proje oluştur (örn. `koklu-erp-staging`).
2. Projeyi production'dan farklı bir organizasyon/isim altında tut.
3. Production şemasını migration dosyalarından kur:
   - `db/*.sql` içindeki migration dosyalarını kronolojik sırayla uygula.
   - Yalnızca şema migration'larını uygula; RLS dry-run dosyalarını (`tenant_rls_staging_*`, `staging_rls_*`) bu aşamada uygulama.
4. Production verisinin **kopyasını taşıma**; bunun yerine anonimleştirilmiş/sentetik test verisi oluştur.

### 3.2 Seçenek B — Local Supabase (Docker)

1. `supabase start` ile local stack'i ayağa kaldır.
2. Migration'ları `supabase db reset` veya manuel `psql` ile uygula.
3. `.env.local` dosyasında local Supabase URL/KEY kullanıldığını doğrula.

## 4. Gerekli Test Verisi

Tenant izolasyonunun doğrulanabilmesi için en az iki firma ve iki kullanıcı gerekir.

| Varlık | Asgari | Açıklama |
| --- | --- | --- |
| Firma | 2 | Örn. "Köklü" ve "Test Firma" |
| Kullanıcı (kullanici_profiller) | 2 | Her firmaya en az bir aktif kullanıcı |
| Rol (roller) | 2+ | En az bir normal rol ve bir `Admin`/`Super Admin` rolü |
| Şube (subeler) | 2+ | Her firmaya en az bir şube |
| Müşteri, cihaz, fatura, teklif vb. | Her firmada birkaç kayıt | Negatif testlerin anlamlı olması için her tenantta veri olmalı |

Test verisi kuralları:

- Her tenant kaydının `firma_id` alanı doğru firmaya işaret etmeli.
- Child kayıtların `firma_id` değeri parent kayıtla aynı olmalı.
- En az bir kullanıcı normal rol (tenant kısıtlı), en az bir kullanıcı `Admin` rolünde olmalı.

## 5. Ortam Doğrulama Checklist

Dry-run'a başlamadan önce:

- [ ] Bağlanılan Supabase projesi production **değil**.
- [ ] `.env.local` staging/local URL ve KEY ile çalışıyor.
- [ ] Production service role key hiçbir yerde kullanılmıyor.
- [ ] Staging DB snapshot/backup alındı (rollback provası için gerekli).
- [ ] En az iki firma ve iki kullanıcı mevcut.
- [ ] En az bir `Admin`/`Super Admin` rolü mevcut.
- [ ] `db/tenant_audit_checks.sql` staging'de temiz sonuç veriyor.
- [ ] `db/staging_rls_preflight_checks.sql` çalıştırıldı ve sonuçlar beklenen değerlerle uyumlu.

## 6. İlgili Dosyalar

| Dosya | Rol |
| --- | --- |
| `db/staging_rls_execution_order.md` | Dry-run çalıştırma sırası |
| `db/staging_rls_preflight_checks.sql` | Apply öncesi durum kontrolü |
| `db/staging_rls_post_apply_checks.sql` | Apply sonrası doğrulama |
| `db/staging_rls_manual_test_results.md` | Manuel test sonuç şablonu |
| `db/staging_rls_go_no_go_report.md` | Go/No-Go karar raporu |
| `db/tenant_rls_helper_upgrade_staging.sql` | Helper fonksiyon upgrade (staging only) |
| `db/tenant_rls_staging_cleanup_real.sql` | Riskli policy temizliği (staging only) |
| `db/tenant_rls_staging_apply_tenant_policies_real.sql` | Tenant policy apply (staging only) |
| `db/tenant_rls_staging_rollback_real.sql` | Rollback (staging only) |

## 7. Önemli Not

Bu doküman ve bağlı SQL dosyaları production RLS onayı anlamına gelmez. Production kararı yalnızca staging dry-run, negatif testler ve rollback provası başarıyla tamamlandıktan sonra `db/staging_rls_go_no_go_report.md` ve `db/tenant_rls_production_readiness_gate.md` üzerinden verilir.

## Sprint 2.1 Notu

RLS dry-run işleminden önce staging/local ortamın production'dan ayrıştığı doğrulanacaktır. Bunun için bkz. `db/staging_rls_env_safety_checklist.md`, `db/staging_rls_dry_run_env_template.md` ve `scripts/verify-staging-env.mjs`.

İlk çalıştırılacak dosya:

- `db/staging_rls_preflight_checks.sql`

Policy/helper değişikliği yapan dosyalar ancak preflight temizse çalıştırılacaktır.
