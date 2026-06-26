# Production Read-Only RLS Envanter Runbook

## Amaç

Bu runbook production Supabase üzerinde yalnızca `SELECT` sorgularıyla mevcut RLS/policy/helper durumunu çıkarmak içindir. RLS açma, policy değiştirme veya veri değiştirme adımı içermez.

## Kesinlikle Çalıştırılmayacak Dosyalar

- `db/tenant_rls_staging_dry_run_final.sql`
- `db/tenant_rls_staging_drop_permissive_policies.sql`
- `db/tenant_rls_drop_permissive_policies_draft.sql`

## Çalıştırılacak Dosya

- `db/rls_production_readonly_collection.sql`

## Sıra

1. Supabase SQL Editor aç.
2. Yeni query oluştur.
3. `rls_production_readonly_collection.sql` içindeki Bölüm 1'i çalıştır.
4. Sonucu kopyala ve `rls_production_inventory_results.md` içine yapıştır.
5. Bölüm 2, 3, 4, 5, 6 ve 7 için aynı işlemi tekrarla.
6. Hata alınırsa sorguyu durdur ve hata mesajını `rls_production_inventory_results.md` içindeki hata/not alanına kaydet.
7. Hiçbir write SQL çalıştırma.

## Beklenen Çıktılar

- RLS açık/kapalı tablo listesi.
- Mevcut policy listesi.
- Fazla izin veren policy listesi.
- Helper fonksiyon durumu.
- Kullanıcı profil/rol/firma durumu.
- Veri temizlik özeti.

## Dikkat Edilecekler

- SQL Editor'da sadece ilgili bölüm seçilerek çalıştırılmalı.
- Sonuçlar tablo olarak kopyalanmalı.
- Production bağlantısı kullanılıyorsa staging dry-run dosyaları kesinlikle açılmamalı veya çalıştırılmamalı.
- `service_role` anahtarının RLS'i bypass ettiği unutulmamalı; bu runbook yalnızca envanter toplar.

## Sonraki Adım

Bu çıktılar geldikten sonra `rls_inventory_analysis.md` gerçek production verileriyle doldurulacak ve staging dry-run gerçek policy adlarıyla netleştirilecek.
