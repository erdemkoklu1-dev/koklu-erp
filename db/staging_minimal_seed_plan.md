# Staging Minimum Anonim Seed Planı

> Yalnızca staging Supabase projesi içindir. Production verisi kopyalanmaz; tüm veri anonim/sentetiktir. Bu doküman secret içermez.

Amaç: tenant izolasyonunu (ve negatif testleri) anlamlı kılacak **en küçük** veri setini staging'de oluşturmak.

## 1. İlke

- Gerçek müşteri adı, telefon, vergi no, e-posta kullanılmaz.
- Tüm değerler "Test ..." gibi açıkça sahte değerlerdir.
- En az **iki firma** olmalı ki bir firmanın kullanıcısı diğerinin verisini görmemeli.

## 2. Firmalar

`db/tenant_migration.sql` zaten `Köklü Yangın` (slug `koklu-yangin`) firmasını seed eder. Staging'de ikinci bir test firması eklenir.

```sql
-- STAGING ONLY
INSERT INTO public.firmalar (ad, slug, telefon, email, adres, aktif)
VALUES ('Test Yangın Firması', 'test-yangin', '0000000000', 'test@example.com', 'Test Adres', true)
ON CONFLICT (slug) DO NOTHING;
```

Sonuç: en az iki firma → `koklu-yangin` ve `test-yangin`.

## 3. Roller

`db/rbac_migration.sql` rolleri seed eder (Admin, Saha Tekniker, İdari Çalışan, Pazarlamacı, Fabrika). Ek rol gerekmez.

> Önemli: Seed rollerinde en yüksek rol adı `Admin`'dir; `Super Admin` rolü yoktur. Bu, `is_super_admin()` helper'ının neden `Admin` adını da kapsaması gerektiğini gösteren bilinen bir durumdur (bkz. `db/tenant_rls_helper_upgrade_staging.sql`).

## 4. Şubeler

Her firmaya en az bir şube:

```sql
-- STAGING ONLY (kolon adlarını staging şemasına göre doğrula)
INSERT INTO public.subeler (ad, firma_id)
SELECT 'Köklü Merkez', id FROM public.firmalar WHERE slug = 'koklu-yangin'
ON CONFLICT DO NOTHING;

INSERT INTO public.subeler (ad, firma_id)
SELECT 'Test Merkez', id FROM public.firmalar WHERE slug = 'test-yangin'
ON CONFLICT DO NOTHING;
```

## 5. Kullanıcı Profilleri

Auth kullanıcıları manuel oluşturulduktan sonra (bkz. `db/staging_manual_auth_user_setup.md`), her kullanıcı doğru firmaya bağlanır:

```sql
-- STAGING ONLY
-- <KOKLU_USER_UUID> ve <TEST_USER_UUID> Auth'tan alınan gerçek UUID'lerdir.
UPDATE public.kullanici_profiller
SET firma_id = (SELECT id FROM public.firmalar WHERE slug = 'koklu-yangin')
WHERE id = '<KOKLU_USER_UUID>';

UPDATE public.kullanici_profiller
SET firma_id = (SELECT id FROM public.firmalar WHERE slug = 'test-yangin')
WHERE id = '<TEST_USER_UUID>';
```

En az bir kullanıcı `Admin` rolünde, diğeri normal (tenant kısıtlı) rolde olmalı.

## 6. Her Firmaya Örnek Tenant Verisi

Negatif testlerin anlamlı olması için her firmada en az birkaç kayıt olmalı. Minimum öneri (firma başına):

| Tablo | Adet | Not |
| --- | --- | --- |
| customers | 2 | "Test Müşteri A1", "Test Müşteri A2" |
| devices | 1-2 | bir müşteriye bağlı |
| service_forms | 1 | bir cihaza bağlı |
| invoices | 1 | + 1 invoice_items + 1 payment |
| teklifler | 1 | + 1 teklif_kalemleri |
| teslimatlar | 1 | + 1 teslimat_kalemleri |
| teknik_raporlar | 1 | |

Kural: her child kaydın `firma_id` değeri parent ile **aynı** firmaya işaret etmeli; iki firmanın verisi birbirine karışmamalı.

## 7. Seed Sonrası Doğrulama

- İki firma mevcut.
- Her firmada en az bir aktif kullanıcı.
- Her firmada en az bir müşteri ve birkaç tenant kaydı.
- `firma_id` boş kayıt yok (kontrol: `db/staging_rls_preflight_checks.sql` Bölüm 8).

Doğrulama tamamlanınca `db/staging_preflight_before_sql_checklist.md` adımına geçilir.

## Sprint 2.4 Notu

Minimal seed için SQL şablonu:

- db/staging_minimal_seed_template.sql

Bu dosya production'da çalıştırılmayacak.
