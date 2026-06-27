# Tenant RLS Production Readiness Gate

Production'da RLS açmadan önce bu kapıların tamamı geçmelidir. Bu dosyanın oluşturulması production RLS onayı anlamına gelmez.

## 1. Veri Kapısı

- [ ] `firma_id` boş kayıt yok.
- [ ] Parent-child uyumsuzluk yok.
- [ ] Şube-firma uyumsuzluk yok.
- [ ] Müşteri-firma uyumsuzluk yok.
- [ ] `tenant_audit_checks.sql` temiz.
- [ ] `planli_isler` tekrar test edildi.
- [ ] Child tablolarda `firma_id` parent kayıtla aynı.

## 2. Policy Kapısı

- [ ] Production read-only RLS inventory çıktıları alındı.
- [ ] Mevcut policy envanteri çıkarıldı.
- [ ] Fazla izin veren policy'ler belirlendi.
- [ ] Hangi policy'lerin düşeceği gerçek adlarıyla doğrulandı.
- [ ] Uydurma policy adı kullanılmadı.
- [ ] RLS helper fonksiyonları doğrulandı.
- [ ] Helper fonksiyon çıktıları doğrulandı.
- [ ] Fazla izin veren policy'lerin gerçek adları doğrulandı.
- [ ] Tenant policy staging'de çalıştı.
- [ ] Kalan global/lookup policy'ler bilinçli olarak sınıflandırıldı.
- [ ] `FORCE ROW LEVEL SECURITY` gerekmiyor kararı doğrulandı.

## 3. Uygulama Kapısı

- [ ] `npx.cmd tsc --noEmit` geçti.
- [ ] `npm run build` geçti.
- [ ] Localhost/staging uygulama testleri geçti.
- [ ] Negatif tenant testleri geçti.
- [ ] PDF/yazdırma testleri geçti.
- [ ] Dashboard testleri geçti.
- [ ] Service role route testleri geçti.
- [ ] Client-side anon sorgu testleri geçti.
- [ ] Şube kullanıcısı testleri geçti.

## 4. Rollback Kapısı

- [ ] Rollback scripti hazır.
- [ ] Staging'de rollback provası yapıldı.
- [ ] Staging helper upgrade test edildi.
- [ ] Staging gerçek policy cleanup test edildi.
- [ ] Staging tenant policy apply test edildi.
- [ ] Staging negatif testler geçti.
- [ ] Staging rollback provası yapıldı.
- [ ] Backup/snapshot prosedürü hazır.
- [ ] Production bakım penceresi belirlendi.
- [ ] Rollback sonrası smoke test listesi hazır.
- [ ] Policy envanteri rollback öncesi ve sonrası saklanıyor.

## 5. Operasyon Kapısı

- [ ] Production bağlantısı ile staging bağlantısı net ayrıldı.
- [ ] Production service key kullanılmadığı doğrulandı.
- [ ] Migration uygulayacak kişi ve onaylayan kişi belirlendi.
- [ ] Uygulama release planı RLS migration ile eşleşiyor.
- [ ] Log/monitoring kontrol noktaları belirlendi.

## 5.1 Staging Dry-Run Kapısı (Sprint 2.0)

- [ ] Staging ortam kurulumu yapıldı (`staging_rls_environment_setup.md`).
- [ ] `staging_rls_preflight_checks.sql` çalıştırıldı ve sonuçlar beklenenle uyumlu.
- [ ] Helper upgrade + cleanup + tenant policy apply sırasıyla uygulandı (`staging_rls_execution_order.md`).
- [ ] `staging_rls_post_apply_checks.sql` çalıştırıldı ve sonuçlar beklenenle uyumlu.
- [ ] Manuel test sonuçları dolduruldu (`staging_rls_manual_test_results.md`).
- [ ] Go/No-Go raporu **Go** olarak işaretlendi (`staging_rls_go_no_go_report.md`).

## 6. Karar

Production RLS:

- [ ] Hazır
- [ ] Hazır değil
- [ ] Staging test sonrası tekrar değerlendirilecek

Notlar:

-

## 7. Bu Sprint İçin Geçerli Karar

Sprint 1.7 sonunda production RLS hazır değildir. Karar, staging dry-run ve negatif testler tamamlandıktan sonra tekrar verilecektir.
