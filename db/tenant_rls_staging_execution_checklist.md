# Tenant RLS Staging Execution Checklist

## A. Başlamadan Önce

- [ ] Production değil, staging/local Supabase kullanıldığı doğrulandı.
- [ ] Staging DB backup/snapshot alındı.
- [ ] `.env.local` staging Supabase URL/KEY ile çalışıyor.
- [ ] Production service key kullanılmıyor.
- [ ] En az iki firma var.
- [ ] En az iki kullanıcı var.
- [ ] Test verileri tenant ayrımı yapacak şekilde hazır.
- [ ] `tenant_audit_checks.sql` staging'de temiz.
- [ ] `rls_policy_inventory.sql` staging'de çalıştırıldı.
- [ ] `rls_helper_checks.sql` staging'de çalıştırıldı.
- [ ] `rls_inventory_output_template.md` gerçek çıktı ile dolduruldu.
- [ ] `rls_inventory_analysis.md` gerçek policy adlarıyla dolduruldu.

## B. Çalıştırma Sırası

1. `db/rls_policy_inventory.sql` çalıştır.
2. `db/rls_helper_checks.sql` çalıştır.
3. `db/tenant_audit_checks.sql` çalıştır.
4. Fazla izin veren gerçek policy adlarını `db/rls_inventory_analysis.md` içine işle.
5. `db/tenant_rls_staging_dry_run_final.sql` staging/local üzerinde uygula.
6. `db/tenant_rls_staging_drop_permissive_policies.sql` kullanılacaksa önce placeholder'ları gerçek policy adlarıyla değiştir.
7. Uygulama smoke testlerini yap.
8. Negatif testleri yap.
9. Rollback provasını yap.
10. Envanter sorgularını tekrar çalıştır ve kalan fazla izin veren policy'leri raporla.

## C. Başarılı Kabul Kriterleri

- [ ] Köklü kullanıcısı kendi verilerini görüyor.
- [ ] Test firma kullanıcısı Köklü verilerini göremiyor.
- [ ] Doğrudan ID ile farklı tenant kaydı 0 sonuç/403/404 veriyor.
- [ ] Fatura ödeme akışı çalışıyor.
- [ ] Servis formu ve kalemleri çalışıyor.
- [ ] Teslimat ve PDF çalışıyor.
- [ ] Teklif ve proforma PDF çalışıyor.
- [ ] Teknik rapor copy/quote/cancel çalışıyor.
- [ ] Dashboard kendi firma sayılarını gösteriyor.
- [ ] Service role route'larda manuel tenant kontrolü çalışıyor.
- [ ] Client-side anon sorgularda başka firma verisi görünmüyor.

## D. Durdurma Kriterleri

- [ ] Kullanıcı başka firmaya ait kaydı görebiliyor.
- [ ] Yetkili kullanıcı kendi firmasındaki kayıtları göremiyor.
- [ ] `current_firma_id()` yanlış firma veya null döndürüyor.
- [ ] Service role route'u manuel firma kontrolünü atlıyor.
- [ ] PDF/yazdırma route'larında başka firma kaydı üretilebiliyor.
- [ ] Dashboard başka firma aggregate değerlerini içeriyor.

## E. Rollback Provası

- [ ] Rollback scripti staging'de denenebilir durumda.
- [ ] Staging snapshot geri dönüşü test edildi.
- [ ] Rollback sonrası uygulama smoke testleri geçti.
- [ ] Rollback sonrası policy envanteri alındı.
