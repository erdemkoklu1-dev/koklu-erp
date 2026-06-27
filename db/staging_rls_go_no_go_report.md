# Staging RLS Dry-Run Go/No-Go Raporu

> Bu rapor staging/local dry-run sonuçlarına dayanır. Production RLS değişikliği bu rapor onaylanmadan yapılmaz. Raporun var olması production onayı anlamına gelmez.

## 1. Kapsam

Bu rapor, tenant RLS dry-run'ının staging/local Supabase üzerinde çalıştırılması sonucunda production'a geçiş için **Go** mu yoksa **No-Go** mu olduğunu belgeler.

| Alan | Değer |
| --- | --- |
| Sprint | 2.0 — Staging RLS dry-run execution plan |
| Tarih | |
| Hazırlayan | |
| Ortam | staging/local (production değil) |

## 2. Go Kriterleri (Hepsi Sağlanmalı)

### Environment Safety

- [ ] Production URL kullanılmadı.
- [ ] Production anon key kullanılmadı.
- [ ] Production service role key kullanılmadı.
- [ ] Supabase project adı staging/local olarak doğrulandı.
- [ ] Preflight başlamadan önce ortam ayrımı onaylandı.

### Dry-Run Kriterleri

- [ ] Ortam doğrulama checklist'i tamamlandı (`staging_rls_environment_setup.md`).
- [ ] Preflight kontrolleri beklenen sonuçları verdi (`staging_rls_preflight_checks.sql`).
- [ ] Helper upgrade uygulandı; dört fonksiyon da mevcut.
- [ ] Cleanup sonrası riskli policy kalmadı.
- [ ] Tenant policy apply başarıyla tamamlandı.
- [ ] Post-apply kontrolleri beklenen sonuçları verdi (`staging_rls_post_apply_checks.sql`).
- [ ] `npx.cmd tsc --noEmit` ve `npm run build` geçti.
- [ ] Uygulama smoke testleri geçti.
- [ ] Tüm negatif tenant testleri geçti.
- [ ] Admin/Super Admin rolü beklenen şekilde tüm tenantları görebildi.
- [ ] Rollback provası başarıyla yapıldı.
- [ ] Manuel test sonuçları dolduruldu (`staging_rls_manual_test_results.md`).

## 3. No-Go Tetikleyicileri (Biri Bile Olursa No-Go)

- [ ] Bir kullanıcı başka firmanın kaydını görebildi.
- [ ] Yetkili kullanıcı kendi firmasının kaydını göremedi.
- [ ] `current_firma_id()` null veya yanlış firma döndürdü.
- [ ] `is_super_admin()` production rol adıyla (Admin) uyuşmadı.
- [ ] Cleanup sonrası riskli/anon policy kaldı.
- [ ] Tenant policy beklenen tablolarda oluşmadı.
- [ ] PDF/yazdırma route'unda başka firma kaydı üretilebildi.
- [ ] Dashboard başka firma aggregate değerini içerdi.
- [ ] Service role route'u manuel tenant kontrolünü atladı.
- [ ] Rollback provası başarısız oldu veya denenemedi.
- [ ] `tsc`/`build` başarısız oldu.

## 4. Sonuç Özeti

| Kategori | Durum (Geçti/Kaldı/Yapılmadı) |
| --- | --- |
| Ortam izolasyonu | |
| Preflight | |
| Helper upgrade | |
| Cleanup | |
| Tenant policy apply | |
| Post-apply | |
| tsc + build | |
| Uygulama smoke | |
| Negatif testler | |
| Rollback provası | |

## 5. Karar

```txt
[ ] GO     — Production planlamasına geçilebilir (ayrı bakım penceresi + backup ile).
[ ] NO-GO  — Eksikler giderilmeden production'a geçilmez.
[ ] TEKRAR — Belirli adımlar tekrar test edilecek.
```

Gerekçe:

-

## 6. Go Durumunda Sonraki Adımlar

> Not: Bu adımlar yine production'da otomatik çalıştırma yetkisi vermez. Production migration ayrı onay, bakım penceresi ve backup gerektirir.

1. Production bakım penceresi belirle.
2. Production backup/snapshot al.
3. Migration uygulayacak ve onaylayacak kişileri belirle.
4. Cleanup + apply SQL'lerini production'a uyarlanmış sürümüyle hazırla.
5. Rollback scriptini ve smoke test listesini hazır tut.
6. `db/tenant_rls_production_readiness_gate.md` kapılarını tekrar gözden geçir.

## 7. No-Go Durumunda Sonraki Adımlar

1. Başarısız kontrolleri `staging_rls_manual_test_results.md` üzerinden listele.
2. İlgili SQL/helper/policy dosyasını staging'de düzelt.
3. Dry-run'ı baştan çalıştır.
4. Bu raporu yeni sonuçlarla güncelle.

## 8. Mevcut Karar

Staging dry-run henüz çalıştırılmadığı için varsayılan karar **NO-GO**'dur. Karar, dry-run tamamlanıp bu rapor doldurulduktan sonra güncellenecektir.

## 9. Sprint 2.2 Preflight Hazırlık Kararı

Bu bölüm, preflight SQL çalıştırılmadan önceki ortam/env güvenlik aşamasının (Sprint 2.2) kararını kaydeder. Bu karar tüm dry-run'ın değil, yalnızca "preflight'e geçilebilir mi" sorusunun cevabıdır.

| Kontrol | Sonuç |
| --- | --- |
| Staging/local ortam seçildi | |
| `scripts/verify-staging-env.mjs` çalıştırıldı | |
| Script production hint yakaladı mı? | |
| `npx.cmd tsc --noEmit` geçti | |
| `npm run build` geçti | |
| Env safety checklist Sprint 2.2 bölümü dolduruldu | |

### Sprint 2.2 Kararı

```txt
[ ] GO     — Ayrı staging/local ortam doğrulandı; sonraki adım db/staging_rls_preflight_checks.sql.
[ ] NO-GO  — Ortam production veya belirsiz; preflight SQL çalıştırılmaz.
```

Gerekçe:

-

> Bu repodaki mevcut `.env.local` production projesine işaret ettiği sürece `verify-staging-env.mjs` `exit 1` döner ve Sprint 2.2 kararı zorunlu olarak **NO-GO**'dur. GO kararı, ancak production olmayan ayrı bir staging/local ortam `.env.local`'a tanımlanıp script `exit 0` döndürdüğünde verilebilir.
