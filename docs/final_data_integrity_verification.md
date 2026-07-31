# Köklü ERP Son Veri Bütünlüğü Sprinti — Görev Sonu Raporu

> Tarih: 2026-08-01 · Kapsam: GOREV.md üç yapısal risk
> Bu belge kod, şema ve gerçekten çalıştırılmış komut çıktılarına dayanır.
> **Hiçbir uzak veritabanında SQL çalıştırılmamıştır.**

## Genel Sonuç

- **Durum: KISMEN TAMAMLANDI — staging doğrulaması bekleniyor**
- Branch: `fix/aggregate-data-loss-and-invoice-parse`
- Başlangıç commit'i: `f76dac0`
- Son commit: `2c656bc`
- Push: **Yapılmadı** (istenmedi; dal yerelde)

Kod, migration, birim/sözleşme testleri, generated tipler ve CI kapısı tamamlandı.
Gerçek transaction davranışının doğrulanması Gate 0'a bağlı olduğu için **bloke**.

---

## Staging Gate

| Madde | Sonuç |
|---|---|
| `node scripts/verify-staging-env.mjs` | **exit 1 — FAILED** |
| Çıktı | `POSSIBLE PRODUCTION VALUE DETECTED in NEXT_PUBLIC_SUPABASE_URL` |
| Project adı production değil mi? | **Doğrulanamadı** — `.env.local` production'a işaret ediyor |
| Remote SQL çalıştırıldı mı? | **Hayır** |
| Supabase CLI production'a linklendi mi? | **Hayır** |
| Remote type generation | **Çalıştırılmadı** |

⇒ NO-GO davranışı uygulandı: migration/RPC dosyaları, uygulama kodu, testler ve CI
tamamlandı; remote apply ve remote integration testleri **`BLOKE — staging env
doğrulanmadı`** olarak bırakıldı.

---

## Teslimat Atomik Güncelleme

| Madde | Sonuç |
|---|---|
| Eski delete-then-insert kaldırıldı mı? | **Evet** — `updateTeslimat` altı bağımsız yazma yerine tek RPC çağrısı |
| Kullanılan RPC | `public.teslimat_update_atomic` (`db/teslimat_atomic_update_rpc.sql`) |
| Stok yaklaşımı | **Net delta** — eşdeğerlik ispatı `docs/teslimat_atomic_update_design.md` §4 |
| Emanet/geri teslim | **Kimlik bazlı upsert** (`kalem_id` doğal anahtar); silip-yeniden-yaratma yok; ilerlemiş kayıt korunur |
| FIFO kapatma | `teslimat_takip_kapatma` defteri ile geri alınabilir ⇒ tekrar çalıştırma idempotent |
| Idempotency | Kalıcı (`aggregate_idempotency` + `payload_fingerprint`); aynı key+payload replay, farklı payload conflict |
| Optimistic concurrency | `expected_updated_at` ⇒ `TESLIMAT_STALE_WRITE` |
| Rollback test kanıtı | **Yazıldı, ÇALIŞTIRILMADI** — `db/teslimat_atomic_update_tests.sql` (Gate 0 bekliyor) |

### Kanıtlanan ve düzeltilen domain hataları

| # | Hata | Kanıt | Durum |
|---|---|---|---|
| T1 | `reverseExistingStock` eski duruma bakmadan stok geri alıyor ⇒ `taslak→taslak` düzenlemede stok şişiyor | `teslimatlar.ts:450` vs `:633-648` | Delta modeliyle **çözüldü** |
| T2 | `syncTeslimatSideEffects` idempotent değil ⇒ durum geçişi stoku ikinci kez düşürüyor | `actions.ts:181-183` | **Kapsam dışı** — ayrı görev (tasarım §7.3) |
| T3 | `kalem_id` doğal anahtarı DB'de zorlanmıyor | `teslimatlar_migration.sql:80-108` | UNIQUE index **eklendi** (migration) |
| T4 | `emanet_takipleri`/`geri_teslim_takipleri` tenant listesinde yok ama kod `firma_id` yazıyor | `tenant_migration.sql:94-138` vs `teslimatlar.ts:343,366` | Kolon **eklendi** (migration) |
| T5 | `depo_hareketleri.firma_id` var ama hiç doldurulmuyor | `teslimatlar.ts:217-226` | RPC **dolduruyor** |
| T6 | `duzenle/page.tsx` kalem `id`'sini atıyor ⇒ kimlik bazlı diff imkânsız | `duzenle/page.tsx:51-66` | **Çözüldü** — `dbId` taşınıyor |

---

## Fatura Kalemi Güvenliği

| Madde | Sonuç |
|---|---|
| Parent invoice kısıtı | **Evet** — her update/delete `id + invoice_id` çifti ile; etkilenen satır sayısı doğrulanıyor |
| Tenant kontrolü | Firma, `kullanici_profiller`den **türetiliyor**; istemciden gelen `firma_id` yetki kanıtı sayılmıyor |
| Yabancı item ID testi | **Geçiyor** (birim) — update, delete ve broker için ayrı ayrı |
| Atomiklik/rollback testi | **Yazıldı, ÇALIŞTIRILMADI** — `db/invoice_atomic_update_tests.sql` |
| Sıralı mutation zinciri | **Kaldırıldı** — tek `invoice_update_atomic` çağrısı |
| Silme sırası | **EN SON** (eskiden ilk adımdı) |
| Eksik payload | Kalem **silmiyor**; boş liste açık onay istiyor |

---

## Generated Supabase Tipleri

| Madde | Sonuç |
|---|---|
| Kanonik schema kaynağı | `db/*.sql` migration zinciri (49 dosya) — ağ erişimsiz, secret'sız, belirlenimci |
| Neden staging/production değil | Production yasak; staging Gate 0 NO-GO |
| Generated dosya | `src/types/database.generated.ts` — 71 tablo, 9 enum |
| Bağlanan client factory'leri | `createTypedServiceClient()` → teslimat ve fatura RPC yolları |
| Genel factory'ler bağlandı mı? | **Hayır — bloke** (aşağıya bakınız) |
| `db:types:check` sonucu | **exit 0** (güncel) |
| CI drift gate | `.github/workflows/ci.yml` — schema preflight → drift → tsc → lint → test → build |

### Neden genel client'lar bağlanamadı (kanıtlı)

`createClient<Database>` üç genel factory'ye uygulandığında **301 TypeScript hatası**
oluşuyor. Hataların ~%90'ı dört tabloya dayanıyor: `customers` (173), `devices` (37),
`service_forms` (57), `service_form_items`. Bu tabloların **CREATE TABLE migration'ı
repoda yok** (`db/staging_migration_inventory.md` → "Kritik Gözlem"), yani generated
tipte kolonları eksik.

GOREV.md §15 bunu açık bir durma koşulu sayıyor. Bu yüzden:
- eksik kolonlar **uydurulmadı**,
- tip `any` / `as unknown as` / geniş index signature ile **etkisizleştirilmedi**,
- bunun yerine şeması kanıtlanmış tablolar ve RPC'ler için gerçek tip güvenliği
  veren ayrı bir factory eklendi ve yeni/etkilenen kod yollarına bağlandı.

### Üreticinin yakaladığı yeni bulgu — tenant listesi drift'i

`db/tenant_migration.sql` içindeki `tenant_tables` dizisinde **repoda karşılığı
olmayan 12 tablo adı** var:

```
backup_history, calisanlar, gelir_gider_hareketleri, hammadde_stok_girisler,
hatirlatmalar, maas_hareketleri, musteri_cari_belgeler, on_kayit_kalemler,
proforma_kalemleri, sabit_giderler, urun_stok_hareketleri, vergi_takvimleri
```

Gerçek adlar farklı (`calisanlar` → `employees`, `gelir_gider_hareketleri` →
`transactions`, `sabit_giderler` → `fixed_expenses`, `vergi_takvimleri` →
`tax_declarations`, `maas_hareketleri` → `salary_payments`, `hatirlatmalar` →
`hatirlatma_kayitlari` …). Migration `if to_regclass(...) is not null` ile korunduğu
için bu tablolar **sessizce atlanmış ve `firma_id` kolonunu hiç almamıştır**.

Bu, denetim raporundaki S1 (`proforma_kalemleri`) bulgusunun aynı sınıfıdır ama
**12 kat büyüğüdür** ve gerçek bir tenant izolasyon boşluğudur.
`PHANTOM_TENANT_TABLES` olarak generated dosyaya yazılır ve her `db:types:check`
çalıştırmasında raporlanır.

---

## Değişen Dosyalar

**Yeni**
- `docs/teslimat_atomic_update_design.md`, `docs/final_data_integrity_verification.md`
- `db/teslimat_atomic_update_rpc.sql`, `db/invoice_atomic_update_rpc.sql`
- `db/teslimat_atomic_update_tests.sql`, `db/invoice_atomic_update_tests.sql`
- `src/lib/teslimat/teslimat-update.ts`, `src/lib/invoice/invoice-update.ts`
- `src/lib/supabase/typed.ts`, `src/types/database.generated.ts`
- `scripts/db-schema-source.mjs`, `scripts/generate-db-types.mjs`
- `tests/teslimat-stock-delta.test.ts`, `tests/teslimat-line-identity.test.ts`,
  `tests/invoice-line-ownership.test.ts`, `tests/db-types-drift.test.ts`,
  `tests/integration-gate.test.ts`
- `.github/workflows/ci.yml`

**Değişen**
- `src/lib/teslimatlar.ts` (atomik akış; `reverseExistingStock` kaldırıldı)
- `src/app/(dashboard)/teslimatlar/{actions.ts,TeslimatForm.tsx,[id]/duzenle/page.tsx}`
- `src/app/(dashboard)/cari-hesap/faturalar/[id]/edit/actions.ts`
- `package.json`

**Dokunulmadı (kullanıcıya ait):** `.claude/settings.local.json`, `GOREV.md`

---

## Testler

| Kontrol | Komut | Sonuç |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | ✅ **Temiz** |
| Lint | `npm run lint` | ⚠️ 525 problem — **sprint öncesi/sonrası birebir aynı**; sıfır yeni problem |
| Unit / sözleşme | `npm test` | ✅ **187/187 geçti** (önceki 122 + 65 yeni) |
| Teslimat transaction/integration | `db/teslimat_atomic_update_tests.sql` | ⛔ **ÇALIŞTIRILMADI** — Gate 0 NO-GO |
| Fatura transaction/integration | `db/invoice_atomic_update_tests.sql` | ⛔ **ÇALIŞTIRILMADI** — Gate 0 NO-GO |
| Type drift | `npm run db:types:check` | ✅ **exit 0** |
| Build | `npm run build` | ✅ **Başarılı** |
| Staging gate | `node scripts/verify-staging-env.mjs` | ❌ **exit 1 (beklenen)** |

Mock çağrısı doğrulayan hiçbir test atomiklik kanıtı sayılmamıştır.
`tests/integration-gate.test.ts` zorunlu senaryoların sessizce düşürülmediğini
doğrular ve "çalıştırılmadı"yı "geçti" ile karıştırmaz.

---

## Güvenlik

| Madde | Sonuç |
|---|---|
| Production SQL çalıştırıldı mı? | **Hayır** |
| Production verisi okundu/değiştirildi mi? | **Hayır** |
| Production deploy yapıldı mı? | **Hayır** |
| Secret commit edildi mi? | **Hayır** (23 commit edilen dosyada desen taraması temiz) |
| Gerçek fatura/müşteri verisi commit edildi mi? | **Hayır** (test fikstürleri sabit sahte UUID) |
| Kullanıcının mevcut değişiklikleri korundu mu? | **Evet** — `.claude/settings.local.json` ve `GOREV.md` stage edilmedi |

---

## Deployment sırası (zorunlu)

```
1. Gate 0: node scripts/verify-staging-env.mjs → exit 0          [şu an: NO-GO]
2. Read-only preflight: db/staging_schema_required_objects_check.sql
3. Staging şema snapshot / yedek
4. db/aggregate_atomic_update_rpc.sql     (aggregate_idempotency tablosu)
5. db/teslimat_atomic_update_rpc.sql      (4'e BAĞIMLI)
6. db/invoice_atomic_update_rpc.sql       (4'e BAĞIMLI)
7. npm run db:types:generate
8. Uygulama kodunu deploy et
9. db/teslimat_atomic_update_tests.sql + db/invoice_atomic_update_tests.sql
10. Staging UI smoke/E2E
11. Production: AYRI görev + açık kullanıcı onayı
```

**Sıra ihlali riski:** 8. adım 5–6'dan önce yapılırsa teslimat düzenleme
`TESLIMAT_RPC_MISSING`, fatura düzenleme `INVOICE_RPC_MISSING` döndürür ve
**çalışmaz**. Bu bilinçlidir: sessizce eski güvensiz akışa düşmek yerine açık ve
teşhis edilebilir hata verilir. Rollback için önce kod eski sürüme alınır, sonra
RPC düşürülür. Rollback blokları veri kaybı yaratabilecek `DROP` işlemlerini
otomatik çalıştırmaz.

---

## Kalan Riskler

| # | Risk | Neden açık | Sonraki adım |
|---|---|---|---|
| R1 | Atomiklik gerçek transaction'da **doğrulanmadı** | Gate 0 NO-GO | `.env.local` staging'e çevrilip migration apply + SQL testleri |
| R2 | `service_forms`/`customers`/`devices`/`service_form_items` şema kaynağı belirsiz | Repoda CREATE TABLE yok | Migration eklenmeli veya staging'den schema-only alınmalı |
| R3 | 12 tablo `firma_id` almamış (tenant listesi drift'i) | Bu sprintte **yeni keşfedildi** | Ayrı tenant düzeltme görevi; adlar rapor §Generated'da |
| R4 | `syncTeslimatSideEffects` çift stok düşümü (T2) | `updateTeslimatDurumAction` akışı kapsam dışı | Ayrı görev |
| R5 | `deleteTeslimat` stok geri almıyor | `updateTeslimat` ile tutarsız; domain kararı gerekiyor | Kullanıcı kararı |
| R6 | `emanetGeriAlAction` / `geriTeslimYapAction` tenant kontrolü yok | Kapsam dışı | Ayrı güvenlik görevi |
| R7 | Negatif stok bloklanmıyor | Mevcut davranış korundu, raporlanıyor | Kullanıcı kararı |
| R8 | Genel Supabase client'ları tipe bağlanamadı | R2'ye bağlı | R2 kapanınca bağlanır |
| R9 | Lint 443 hatayla kırmızı | Sprint öncesi teknik borç | Ayrı temizlik görevi |
| R10 | UBL-TR XML / OCR parser yok | Anonimleştirilmiş fixture yok | Kullanıcıdan örnek |

---

## Kullanıcıdan Gereken Tek Sonraki Adım

**`.env.local` dosyasını staging Supabase projesine çevirin ve
`node scripts/verify-staging-env.mjs` komutunun exit 0 döndüğünü doğrulayın.**

Bu tek adım R1'i açar: migration'lar staging'e apply edilebilir, transaction /
rollback / idempotency / eşzamanlılık testleri gerçekten çalıştırılabilir ve
görev `TAMAMLANDI` durumuna geçebilir. Aynı ortam R2'nin çözümü için de
(schema-only tanım alma) tek güvenli kaynaktır.
