# RLS Production Inventory Interpretation Guide

## 1. RLS Açık/Kapalı Yorumu

- `rls_enabled = false`: tablo şu anda RLS ile korunmuyor.
- `rls_enabled = true`: tablo RLS altında.
- `force_rls = true`: owner/service davranışı dikkatle incelenmeli.

## 2. Fazla İzin Veren Policy Yorumu

Aşağıdaki patternler risklidir:

- `auth.uid() IS NOT NULL`
- `USING (true)`
- `WITH CHECK (true)`
- Herkese açık SELECT/INSERT/UPDATE policy'leri

Bunlar tenant RLS'e geçmeden önce staging'de kaldırılmalı veya tenant policy ile değiştirilmelidir. Production üzerinde doğrudan işlem yapılmamalıdır.

## 3. Helper Fonksiyon Yorumu

`current_firma_id()` şu mantığı sağlamalıdır:

- `auth.uid()` ile `kullanici_profiller.id` eşleşmeli.
- Kullanıcı aktif olmalı.
- `firma_id` dolu olmalı.

`is_super_admin()` gerçek rol adlarına göre test edilmelidir.

## 4. Production RLS Kararı

Production RLS ancak şu şartlarda düşünülebilir:

- Tenant audit temiz.
- Mevcut policy envanteri net.
- Fazla izin veren policy'lerin gerçek adları biliniyor.
- Staging dry-run geçti.
- Negatif testler geçti.
- Rollback provası yapıldı.

## 5. Bu Aşamadan Sonra Yapılacaklar

1. Kullanıcı Supabase'den read-only çıktıları alır.
2. Çıktılar `rls_production_inventory_results.md` içine işlenir.
3. `rls_inventory_analysis.md` gerçek verilerle doldurulur.
4. Staging dry-run SQL gerçek policy adlarına göre güncellenir.
5. Staging test yapılır.
