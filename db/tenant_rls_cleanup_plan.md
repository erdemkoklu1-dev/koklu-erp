# Tenant RLS Cleanup Planı - Sprint 1.6

Bu plan production üzerinde uygulanacak migration değildir. Amaç mevcut policy envanterini çıkarmak, fazla izin veren policy'leri kontrollü biçimde temizlemeye hazırlamak ve staging doğrulaması tamamlanmadan production RLS kararını engellemektir.

## Değiştirilmeyenler

- Production'da RLS açılmadı.
- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` çalıştırılmadı.
- `DROP POLICY`, `CREATE POLICY`, `FORCE ROW LEVEL SECURITY` çalıştırılmadı.
- `firma_id NOT NULL` yapılmadı.
- Veri silme/taşıma yapılmadı.
- Parser, hesaplama, teknik rapor formülü ve teslimat mantığı değiştirilmedi.

## Envanter Kaynakları

- `db/rls_policy_inventory.sql`: `pg_policies`, `pg_class.relrowsecurity`, `firma_id` kolon varlığı ve fazla izin veren policy adaylarını listeler.
- `db/rls_helper_checks.sql`: `current_firma_id()`, `is_super_admin()`, kullanıcı profili, firma ve şube bağlantılarını doğrular.
- `db/tenant_audit_checks.sql`: `firma_id IS NULL`, şube-firma, müşteri-firma ve parent-child uyumsuzluklarını kontrol eder.
- `db/tenant_visibility_test_report.md`: Sprint 1.5 görünürlük testi ve uygulama katmanı risklerini özetler.

## Fazla İzin Veren Policy Sınıfları

| Sınıf | Örnek | Risk | Aksiyon |
| --- | --- | --- | --- |
| `USING (true)` / `WITH CHECK (true)` | `"Service role has full access"`, `auth_all`, `anon_all` | Authenticated veya anon role tenant ayrımı olmadan erişebilir | Tenant policy hazır olmadan kaldırma; staging'de yerine tenant policy ile test et |
| `auth.uid() is not null` | `*_auth_all`, `operasyon_auth_all`, `proforma_auth_all` | Her oturum açmış kullanıcı tüm firmaların kaydını görebilir/değiştirebilir | Tenant policy ile birebir davranış testi sonrası kaldır |
| `anon_all` | `araci_cari_hareketleri`, bazı şube/lookup tabloları | Public anon erişim tenant verisi sızdırabilir | Tenant verisi taşıyan tablolarda öncelikli temizlik adayı |
| Global lookup policy | `urunler`, teknik ayar/lookup tabloları | Bazıları bilinçli global olabilir | Tenant verisi taşımıyorsa ayrı sınıflandır; gereksiz tenant policy ekleme |

## Öncelik Sırası

1. Tenant çekirdek tabloları: `customers`, `devices`, `service_forms`, `invoices`, `payments`.
2. Operasyon ve teklif/teslimat tabloları: `teslimatlar`, `teslimat_kalemleri`, `teklifler`, `teklif_kalemleri`, `musteri_talepleri`, `is_planlari`, `planli_isler`.
3. Finans alt tabloları: `invoice_items`, `invoice_brokers`, `proforma_faturalar`, `proforma_fatura_kalemleri`.
4. Teknik rapor ve aracı cari: `teknik_raporlar`, `brokers`, `araci_cari_hareketleri`.
5. Kapsam dışı/global tablolar: `urunler`, `subeler`, `tedarikciler`, `personel_*`, fabrika ve hatırlatma tabloları ayrıca sınıflandırılmalı.

## Uygulama Stratejisi

1. Staging veritabanında `rls_policy_inventory.sql`, `rls_helper_checks.sql` ve `tenant_audit_checks.sql` çalıştır.
2. `firma_id` eksik, null veya ilişki uyumsuzluğu olan tablo varsa RLS geçişini durdur.
3. Her tablo için mevcut geniş policy'yi tenant policy taslağıyla eşleştir.
4. Staging'de tek tablo veya küçük tablo grubu için geçiş denemesi yap.
5. Normal kullanıcı, şube kullanıcısı ve Super Admin ile liste, detay, PDF/yazdırma, insert, update, delete senaryolarını test et.
6. Service role kullanan API route'larında manuel firma kontrolünün RLS'ten bağımsız kaldığını doğrula.
7. Production için ayrı, onaylı, küçük batch'ler halinde migration hazırla.

## Hazır Görünen Tablolar

Sprint 1.5 raporuna göre audit scriptleri 0 sonuç dönerse şu tablolar RLS için hazır adaydır:

`customers`, `devices`, `service_forms`, `service_form_items`, `invoices`, `invoice_items`, `invoice_brokers`, `payments`, `teslimatlar`, `teslimat_kalemleri`, `teklifler`, `teklif_kalemleri`, `proforma_faturalar`, `proforma_fatura_kalemleri`, `teknik_raporlar`, `musteri_talepleri`, `is_planlari`, `brokers`, `araci_cari_hareketleri`.

## Ek Test İsteyenler

- `planli_isler`: parent/ilişki uyumu canlı staging verisiyle tekrar doğrulanmalı.
- Client-side anon sorgu kullanan ekranlar: RLS açılınca beklenen veri filtreleme davranışı staging'de elle test edilmeli.
- `subeler`: hem tenant kapsamı hem global seçim/şube yetkisi davranışı olduğu için ayrı policy tasarımı gerekir.
- Global lookup tabloları: `urunler`, teknik ayarlar ve benzer tablolar tenant verisi taşımadığı sürece tenant RLS grubuna dahil edilmemeli.

## Production Kararı

Production RLS için hazır değiliz. Gerekçe: bu sprint yalnızca envanter, dry-run taslakları ve risk planı üretir; staging üzerinde policy değişikliği ve uçtan uca kullanıcı senaryoları henüz tamamlanmamıştır.

## Sprint 1.9 Gerçek Envanter Güncellemesi

Production read-only envanterine göre:

- Public şemada 56 tablonun tamamında RLS açık.
- Force RLS açık tablo yok.
- Veri temizlik özetinde 38/38 kontrol `0`.
- Fazla izin veren policy sayısı 59.
- `current_firma_id()` ve `is_super_admin()` mevcut.
- `current_user_role()` ve `current_user_sube_id()` eksik.
- `is_super_admin()` rol adı `Super Admin` beklediği için production'da görünen `Admin` rolüyle uyuşmayabilir.

Gerçek policy adlarıyla staging cleanup dosyası:

- `db/tenant_rls_staging_cleanup_real.sql`

Gerçek tenant policy apply dosyası:

- `db/tenant_rls_staging_apply_tenant_policies_real.sql`

Staging sırası:

1. `db/tenant_rls_helper_upgrade_staging.sql`
2. `db/tenant_rls_staging_cleanup_real.sql`
3. `db/tenant_rls_staging_apply_tenant_policies_real.sql`
4. `db/tenant_rls_staging_test_matrix_real.md`
5. `db/tenant_rls_staging_rollback_real.sql`

Production policy temizliği için karar hâlâ hazır değil. Önce staging/local dry-run ve rollback provası tamamlanmalıdır.
