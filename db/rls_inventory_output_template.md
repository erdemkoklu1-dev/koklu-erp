# RLS Inventory Output Template

> Not: Production çıktıları için artık `db/rls_production_readonly_collection.sql` ve `db/rls_production_inventory_results.md` kullanılacaktır.

Bu dosya, Supabase SQL Editor'da yalnızca read-only sorgular çalıştırıldıktan sonra sonuçların yapıştırılması için hazırlanmıştır. Production üzerinde policy değiştirme, RLS açma veya veri değiştirme adımı içermez.

## 1. RLS Açık/Kapalı Tablo Durumu

Kullanıcı buraya `db/rls_policy_inventory.sql` içindeki RLS tablo durum sorgusunun çıktısını yapıştıracak.

```sql
-- Sorgu:
-- SELECT ... relrowsecurity ...
```

Sonuç:

| schema_name | table_name | rls_enabled | force_rls |
| --- | --- | --- | --- |
|  |  |  |  |

## 2. Mevcut Policy Listesi

Kullanıcı buraya `pg_policies` çıktısını yapıştıracak.

| schemaname | tablename | policyname | permissive | roles | cmd | qual | with_check |
| --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |

## 3. Fazla İzin Veren Policy'ler

Özellikle şu pattern'leri içeren policy'ler:

- `auth.uid() IS NOT NULL`
- `true`
- `USING (true)`
- `WITH CHECK (true)`

| tablename | policyname | cmd | qual | with_check | risk |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |

## 4. Helper Fonksiyon Çıktıları

Kullanıcı buraya `db/rls_helper_checks.sql` çıktılarının özetini yapıştıracak.

| function_name | var mı | not |
| --- | --- | --- |
| current_firma_id |  |  |
| is_super_admin |  |  |
| current_user_role |  |  |
| current_user_sube_id |  |  |

## 5. Kullanıcı Profil Kontrolü

| id | firma_id | sube_id | aktif | rol_adi |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## 6. Tenant Audit Özeti

`db/tenant_audit_checks.sql` sonucu:

| kontrol | beklenen | sonuç | not |
| --- | --- | --- | --- |
| firma_id boş kayıt | 0 |  |  |
| parent-child uyumsuzluk | 0 satır |  |  |
| şube-firma uyumsuzluk | 0 satır |  |  |
| müşteri-firma uyumsuzluk | 0 satır |  |  |

## 7. Ek Notlar

- Hata alınan sorgular:
- Eksik tablo/kolon:
- Şüpheli policy:
- Production bağlantısı mıydı? Hayır / Evet:
- Çıktıyı alan kişi ve tarih:
