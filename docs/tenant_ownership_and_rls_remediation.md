# Tenant Sahiplik Envanteri ve RLS Remediation

> Kapsam: GOREV.md Faz A + Faz B
> Branch: `fix/aggregate-data-loss-and-invoice-parse`
> Staging Gate 0: **NO-GO** (`node scripts/verify-staging-env.mjs` → exit 1,
> `.env.local` production project hint taşıyor)
> ⇒ Bu belgedeki bütün "staging" sütunları **ÇALIŞTIRILMADI — STAGING NO-GO**.

---

## 0. Bu belgenin kanıt kaynağı

Hiçbir eşleme "isim benziyor" gerekçesiyle yapılmamıştır. Kullanılan kaynaklar:

| Kaynak | Ne kanıtlar |
|---|---|
| `db/*.sql` içindeki `CREATE TABLE` ifadeleri | Tablonun gerçekten var olduğunu |
| `REFERENCES public.X(id)` FK'leri | Güvenilir parent zincirini |
| `scripts/db-schema-source.mjs` şema modeli | `firma_id` kolonunun varlığını |
| `db/tenant_migration.sql` `tenant_tables` dizisi | Hangi adların hedeflendiğini |
| `rg "from('<tablo>')" src/` | Uygulamanın gerçekten hangi tabloyu sorguladığını |

Şema modeli üzerinden yapılan tarama, `db/` dizinindeki 50 migration dosyasından
**71 gerçek tablo** çıkarmıştır. `npm run db:types:drift` bu modeli her CI
çalışmasında yeniden üretir; bu belge o çıktının insan tarafından okunabilir
yorumudur.

---

## 1. Kritik bulgu — asıl risk hayalet adlar DEĞİL

`db/tenant_migration.sql` (satır 91-160) bir `tenant_tables text[]` dizisi
üzerinde döner ve her tabloya `firma_id` ekler. Döngü şu koruma ile sarılıdır:

```sql
if to_regclass(format('public.%I', table_name)) is not null then
```

Bu koruma sayesinde var olmayan 12 ad **hata vermeden, sessizce atlanmıştır**.
Yani:

* Hayalet adların kendisi doğrudan bir sızıntı üretmez (öyle bir tablo yoktur).
* **Asıl açık**, o adların temsil etmesi gereken *gerçek* tabloların
  `tenant_tables` listesinde hiç bulunmamasıdır. Bu tablolar `firma_id`
  almamıştır ve uygulama tarafından **tenant filtresi olmadan** sorgulanmaktadır.

Etkilenen modüller: finans (gelir/gider, sabit gider, vergi), İK/bordro,
hatırlatma kuralları, müşteri cari belgeleri, ürün stok bakiyesi, yedekleme.

---

## 2. Zorunlu eşleme tablosu (12 hayalet ad)

Sütun anlamları:
**S?** = staging'de var mı · **DF** = doğrudan `firma_id` mi ·
**PÜ** = parent üzerinden mi

| # | Phantom ad | Gerçek tablo/adlar | S? | DF | PÜ | Backfill kaynağı | RLS modeli | Karar / kanıt |
|---|---|---|---|---|---|---|---|---|
| 1 | `proforma_kalemleri` | `proforma_fatura_kalemleri` | ÇALIŞTIRILMADI | ✅ zaten var | — | gerekmiyor | `firma_id = current_firma_id()` | **Sınıf 1** — ad drift'i. Tablo kendi migration'ında (`proforma_migration.sql`) `firma_id` taşıyor; yalnızca policy eksikti. Denetim raporundaki S1 bulgusu doğrulandı. |
| 2 | `on_kayit_kalemler` | *(tablo yok)* — `on_kayitlar.kalemler` JSONB kolonu | ÇALIŞTIRILMADI | — | — | — | parent `on_kayitlar` policy'si | **Sınıf 4 — obsolete.** `db/on_kayit_kalemler_migration.sql` yalnızca `ALTER TABLE public.on_kayitlar ADD COLUMN kalemler JSONB` yapar. Hiçbir zaman tablo olmamıştır; liste hatalıdır. |
| 3 | `hammadde_stok_girisler` | `depo_hareketleri` (`kaynak='hammadde'`) | ÇALIŞTIRILMADI | ✅ zaten var | — | gerekmiyor | mevcut | **Sınıf 4 — obsolete.** `src/app/api/fabrika/stok-giris/route.ts:36` doğrudan `depo_hareketleri`'ne yazar; ayrı bir giriş tablosu yoktur. `depo_hareketleri` listede vardır ve `firma_id` almıştır. |
| 4 | `urun_stok_hareketleri` | `depo_hareketleri` (hareket) + `urun_stok` (bakiye) | ÇALIŞTIRILMADI | ❌ `urun_stok` | ✅ `urunler` | `urun_stok.urun_id → urunler.firma_id` | `EXISTS(urunler)` | **Sınıf 2.** `urun_stok` 1:1 bakiye tablosudur (`urun_id UNIQUE`); yinelenen `firma_id` yerine parent üzerinden RLS. |
| 5 | `musteri_cari_belgeler` | `documents`, `customer_accounts` | ÇALIŞTIRILMADI | ❌ | ✅ `customers` (+`invoices`,`payments`) | FK zinciri | `EXISTS(customers ∪ invoices ∪ payments)` | **Sınıf 2.** `documents`ta üç parent de nullable; üçü de boşsa satırın tenant'ı YOKTUR ⇒ fail-closed (hiçbir tenant görmez) ve bulgu defterine sayılır. |
| 6 | `hatirlatmalar` | `hatirlatma_kayitlari`, `hatirlatma_kurallari` | ÇALIŞTIRILMADI | `kurallari` ✅ (yeni) | `kayitlari` ✅ `customers` | kural → `hatirlatma_sablonlari.firma_id` | kayıt: `EXISTS(customers)` · kural: doğrudan | **Sınıf 2 + Sınıf 1.** `hatirlatma_sablonlari` listede olduğu için `firma_id` taşır; kural onu devralır. |
| 7 | `calisanlar` | `personeller` (aktif İK) + `employees` (eski finans/bordro) | ÇALIŞTIRILMADI | ikisi de | — | `employees`: FK yok | doğrudan | **Sınıf 1 + Sınıf 5.** `personeller` listede, `firma_id` var. `employees` PARALEL ve eski bir modüldür, hiçbir tenant FK'si yoktur ⇒ tek-firma guard'a bağlı. |
| 8 | `maas_hareketleri` | `maas_odemeleri` (personeller), `salary_payments` (employees) | ÇALIŞTIRILMADI | `salary_payments` ✅ (yeni) | `maas_odemeleri` ✅ `personeller` | `maas_odemeleri`: `personel_id → personeller.firma_id` | `EXISTS(personeller)` / doğrudan | **Sınıf 2 + Sınıf 5.** İki paralel bordro modülü var; yalnızca `personeller` zinciri güvenilirdir. |
| 9 | `gelir_gider_hareketleri` | `transactions`, `sube_gider_gelir` | ÇALIŞTIRILMADI | `transactions` ✅ (yeni) | `sube_gider_gelir` ✅ `subeler` | `transactions.invoice_id → invoices.firma_id` (kısmî) | `EXISTS(subeler)` / doğrudan | **Sınıf 2 + Sınıf 5.** `transactions.invoice_id` nullable ⇒ faturasız gelir/gider satırlarının tenant'ı FK'den türetilemez. |
| 10 | `sabit_giderler` | `fixed_expenses` | ÇALIŞTIRILMADI | ✅ (yeni) | — | güvenilir kaynak YOK (`category_id → expense_categories`, o da tenant'sız) | doğrudan | **Sınıf 5 → tek-firma guard.** |
| 11 | `vergi_takvimleri` | `tax_declarations` | ÇALIŞTIRILMADI | ✅ (yeni) | — | hiç FK YOK | doğrudan | **Sınıf 5 → tek-firma guard.** Tablonun hiçbir foreign key'i yoktur. |
| 12 | `backup_history` | `backup_jobs`, `backup_logs`, `backup_restores`, `backup_settings` | ÇALIŞTIRILMADI | jobs/restores/settings ✅ (yeni) | `backup_logs` ✅ `backup_jobs` | `created_by`/`requested_by`/`updated_by` → `kullanici_profiller.firma_id` | `EXISTS(backup_jobs)` / doğrudan | **Sınıf 2 + Sınıf 1.** Yedekleme çıktısı tenant verisi taşır; sahiplik zorunludur. |

### 2b. Listede hiç bulunmayan diğer gerçek tablolar

Aynı taramada, `tenant_tables` listesinde olmayan ve `firma_id` taşımayan başka
tablolar da bulunmuştur. Bunlar da bu remediation'ın kapsamındadır:

| Tablo | Sınıf | Tenant kaynağı |
|---|---|---|
| `mesai_kayitlari`, `personel_belgeler`, `personel_izinler`, `performans_degerlendirmeleri`, `yillik_izin_hakki` | 2 | `personel_id → personeller` |
| `uretim_hareketleri` | 2 | `uretim_emri_id → uretim_emirleri` |
| `kullanici_sube_yetkileri` | 2 | `sube_id → subeler` |
| `customer_accounts` | 2 | `customer_id → customers` |
| `giris_kayitlari` | 5 | güvenilir FK yok → tek-firma guard |
| `expense_categories` | 5 | güvenilir FK yok → tek-firma guard |
| `roller`, `rol_yetkileri`, `modul_izinleri`, `kullanici_rolleri` | 3 (global/reference) | tenant'a ait değil — **kapsam dışı** |
| `firmalar` | tenant kökü | — |
| `emanet_takipleri`, `geri_teslim_takipleri`, `teslimat_durum_gecmisi`, `teslimat_takip_kapatma` | 1 | `db/teslimat_atomic_update_rpc.sql` §1 ile `firma_id` aldı |

---

## 3. Sınıflandırma kuralları

1. **Doğrudan tenant-owned** — satırda doğrulanabilir `firma_id`; RLS
   `firma_id = current_firma_id()`.
2. **Parent-owned child** — tenant NOT NULL bir FK üzerinden türetilir.
   Yinelenen `firma_id` **eklenmez** (iki kaynak arasında drift riski);
   RLS `EXISTS (parent … AND parent.firma_id = current_firma_id())`.
3. **Global/reference** — tenant'a ait değildir; bu migration'ın kapsamı dışında.
4. **Eski/karşılıksız** — gerçek tabloda karşılığı yoktur; liste hatasıdır.
5. **Belirsiz** — güvenilir tenant kaynağı yoktur; ancak kanıtlanabilir
   tek-firma guard'ı ile doldurulur, aksi hâlde NULL bırakılıp raporlanır.

---

## 4. Neden "her tabloya firma_id" YAPILMADI

GOREV.md §3 bunu açıkça yasaklar ve teknik gerekçe de aynı yöndedir: `urun_stok`
gibi bir bakiye satırının `firma_id`'si ile `urunler.firma_id` birbirinden
ayrılabilir (ürün başka firmaya taşınırsa bakiye eski firmada kalır). Tek
gerçeklik kaynağı parent olmalıdır. Bu yüzden 14 tablo parent-owned bırakılmış,
yalnızca gerçekten kaynaksız olan 11 tabloya kolon eklenmiştir.

---

## 5. Backfill güvenlik modeli

```
1. Güvenilir FK zincirinden türetilebilenler        → doldurulur
2. Kalanlar + veritabanında TAM 1 firma var         → o firmaya atanır
                                                      (tahmin değil, zorunluluk)
3. Kalanlar + birden fazla firma var                → HİÇBİR ATAMA YAPILMAZ
                                                      NULL kalır + bulgu defterine
                                                      sayımıyla yazılır
```

3. maddedeki satırlar RLS altında **hiçbir tenant'a görünmez**
(`null = current_firma_id()` daima NULL ⇒ policy geçmez). Bu bilinçli bir
fail-closed davranıştır: yanlış tenant'a göstermektense hiç göstermemek.

Ad/ünvan benzerliğine dayalı backfill **hiçbir yerde kullanılmamıştır**.

---

## 6. Üretilen dosyalar

| Dosya | Tür | Çalıştırıldı mı? |
|---|---|---|
| `db/read_only_tenant_ownership_audit.sql` | Salt-okunur denetim (SELECT + katalog) | **HAYIR — STAGING NO-GO** |
| `db/tenant_ownership_rls_remediation.sql` | Forward-only migration | **HAYIR — STAGING NO-GO** |
| `docs/tenant_ownership_and_rls_remediation.md` | Bu belge | — |

Her iki SQL dosyası da tarihî migration'ları değiştirmez.

---

## 7. Migration öncesi / sonrası beklenen sonuçlar

Aşağıdaki tablo, `db/read_only_tenant_ownership_audit.sql` çalıştırıldığında
doldurulacaktır. Şu an **hiçbir gerçek ölçüm yoktur**.

| Kontrol | Migration ÖNCESİ beklenen | Migration SONRASI beklenen | Gerçek ölçüm |
|---|---|---|---|
| `firma_id` taşımayan tablo sayısı (§B1) | ≥ 29 | yalnızca global/reference + parent-owned | ÇALIŞTIRILMADI |
| RLS kapalı ama `firma_id` taşıyan tablo (§C3) | > 0 | 0 | ÇALIŞTIRILMADI |
| RLS açık ama policy'si olmayan tablo (§C2) | > 0 | 0 | ÇALIŞTIRILMADI |
| Eksik komut policy'si (§C4) | çok sayıda | 0 (kapsamdaki tablolarda) | ÇALIŞTIRILMADI |
| `firma_id IS NULL` satır sayısı (§D1) | > 0 | 0 (tek firma varsa) | ÇALIŞTIRILMADI |
| Parent↔child çelişkisi (§E1) | 0 beklenir | 0 | ÇALIŞTIRILMADI |
| Tenant'ı belirsiz child satır (§E2) | ? | bulgu defterinde sayılı | ÇALIŞTIRILMADI |
| `tenant_remediation_findings` satır sayısı | — | 0 (ideal) | ÇALIŞTIRILMADI |
| `SECURITY DEFINER` + sabit `search_path` (§G1) | kısmen | tamamı | ÇALIŞTIRILMADI |
| PUBLIC execute açık fonksiyon (§G2) | > 0 | 0 | ÇALIŞTIRILMADI |

---

## 8. Tenant negatif test planı (gerçek staging gerektirir)

Mock Supabase testi **RLS kanıtı değildir**. Aşağıdakiler yalnızca iki gerçek
tenant ve iki gerçek `authenticated` kullanıcı ile, gerçek PostgreSQL RLS
altında koşulduğunda PASS sayılır.

| # | Senaryo | Beklenen | Durum |
|---|---|---|---|
| T1 | Tenant A kullanıcısı Tenant B satırını `SELECT` eder | 0 satır | ÇALIŞTIRILMADI |
| T2 | Tenant A, Tenant B parent'ına child `INSERT` eder | policy reddi | ÇALIŞTIRILMADI |
| T3 | Tenant A, Tenant B child kaydını `UPDATE` eder | 0 satır etkilenir | ÇALIŞTIRILMADI |
| T4 | Tenant A, Tenant B child kaydını `DELETE` eder | 0 satır etkilenir | ÇALIŞTIRILMADI |
| T5 | İstemci sahte `firma_id` gönderir | yetki kazanmaz (`current_firma_id()` profilden gelir) | ÇALIŞTIRILMADI |
| T6 | Yetkili Tenant A kullanıcısı kendi kaydında işlem yapar | başarılı | ÇALIŞTIRILMADI |
| T7 | `firma_id IS NULL` satır authenticated kullanıcıya görünür mü? | HAYIR (fail-closed) | ÇALIŞTIRILMADI |
| T8 | Service-role bakım yolu uygulama kullanıcı yoluyla karışır mı? | HAYIR | ÇALIŞTIRILMADI |
| T9 | `emanet_takipleri` yabancı tenant kimliğiyle kapatılabilir mi? | HAYIR — `TESLIMAT_TAKIP_NOT_FOUND` | ÇALIŞTIRILMADI |

T9'un uygulama tarafı bu sprintte kapatılmıştır
(`db/teslimat_takip_action_atomic.sql`); RLS tarafı hâlâ staging kanıtı bekler.

---

## 9. Açık blokajlar

| Blokaj | Neden açık | Production engeli mi? |
|---|---|---|
| Bütün staging ölçümleri | Gate 0 NO-GO (`.env.local` production'a bakıyor) | **EVET** |
| `customers`, `devices`, `service_forms`, `service_form_items` sahipliği | CREATE TABLE kaynağı repoda yok; kolon/kısıt varsayılamaz | **EVET** |
| `employees` / `salary_payments` vs `personeller` / `maas_odemeleri` | İki paralel İK modülü var; hangisinin canlı olduğu ürün kararı | HAYIR (izolasyon her ikisinde de kuruluyor) |
| `expense_categories` tenant başına mı, global mi? | Kanıt yok; şimdilik tenant-owned varsayıldı ve guard'a bağlandı | HAYIR |
| `NOT NULL` sıkılaştırması | Backfill staging'de doğrulanmadan uygulanamaz | HAYIR (ayrı forward migration) |
| `roller` / RBAC tablolarının tenant modeli | Ayrı ürün kararı | HAYIR |
