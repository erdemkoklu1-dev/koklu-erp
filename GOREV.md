Mükemmel. Bölüm 7 de tamamen temiz:

```text
firma_id boş kayıt yok ✅
parent-child firma uyumsuzluğu yok ✅
şube-firma uyumsuzluğu yok ✅
veri temizlik özeti 38/38 sıfır ✅
```

Read-only envanter aşaması tamamlandı. Artık elimizde şu net sonuç var:

```text
Production’da RLS zaten açık.
Force RLS kapalı.
Veri tenant açısından temiz.
Fakat mevcut policy’lerin çoğu tenant güvenli değil.
Admin rolü “Super Admin” helper’ına takılabilir.
Bazı helper fonksiyonlar eksik.
```

Sıradaki doğru iş:

```text
Sprint 1.9 — Gerçek Policy Envanterine Göre Staging RLS Cleanup/Dry-Run Hazırlığı
```

Bu sprintte yine **production’da hiçbir şey çalıştırmayacağız**. Codex, gerçek policy adlarına göre staging/local için temizleme ve tenant policy planı hazırlayacak.

---

## Sprint 1.9 — Görev MD

````md
# GÖREV — Sprint 1.9: Gerçek Policy Envanterine Göre Staging RLS Cleanup/Dry-Run Hazırlığı

> Uygulama notu: Sprint 1.9 kapsamında yalnızca `db/*.sql`, `db/*.md` ve `GOREV.md` dosyaları hazırlanacaktır. Production üzerinde RLS/policy/veri değişikliği yapılmayacaktır.

## Amaç

Production Supabase üzerinde read-only RLS envanter sorguları çalıştırıldı ve aşağıdaki sonuçlar elde edildi:

### Veri Durumu

- `firma_id` boş kayıt yok.
- parent-child firma uyumsuzluğu yok.
- şube-firma uyumsuzluğu yok.
- Bölüm 7 veri temizlik kontrolünde tüm sonuçlar `0`.

### RLS Durumu

- Public şemadaki 56 tablonun tamamında `rls_enabled = true`.
- Tüm tablolarda `force_rls = false`.
- Production’da RLS zaten açık.

### Policy Durumu

- Mevcut policy listesinde çok sayıda tenant güvenli olmayan policy var.
- Fazla izin veren policy sayısı: 59.
- Risk patternleri:
  - `true`
  - `auth.uid() IS NOT NULL`
  - `anon`
  - `public`
  - `ALL`

### Helper Fonksiyon Durumu

Mevcut helper fonksiyonlar:

- `public.current_firma_id()` var.
- `public.is_super_admin()` var.

Eksik helper fonksiyonlar:

- `public.current_user_role()` yok.
- `public.current_user_sube_id()` yok.

Ek risk:

- `is_super_admin()` fonksiyonu `r.ad = 'Super Admin'` kontrolü yapıyor.
- Production kullanıcı rollerinde görünen en yüksek rol adı `Admin`.
- Bu nedenle mevcut `Admin` kullanıcılar `is_super_admin()` fonksiyonuna göre super admin sayılmayabilir.

Bu sprintin amacı, elde edilen gerçek policy adlarına ve helper durumuna göre **staging/local ortamda çalıştırılabilecek güvenli RLS cleanup + tenant policy dry-run planını hazırlamaktır.**

Bu sprintte production üzerinde hiçbir policy değiştirilmeyecek.

---

## 1. Kesin Yasaklar

Bu görevde kesinlikle şunlar yapılmayacak:

```txt
Production Supabase üzerinde DROP POLICY çalıştırma.
Production Supabase üzerinde CREATE POLICY çalıştırma.
Production Supabase üzerinde ALTER TABLE çalıştırma.
Production Supabase üzerinde FORCE ROW LEVEL SECURITY çalıştırma.
Production Supabase üzerinde ENABLE/DISABLE RLS çalıştırma.
Production verisi üzerinde INSERT / UPDATE / DELETE / TRUNCATE çalıştırma.
firma_id kolonlarını NOT NULL yapma.
Parser, fatura hesaplama, teknik rapor formülü, teslimat mantığı veya PDF tasarımı değiştirme.
UI redesign yapma.
````

Bu sprint yalnızca:

```txt
analiz,
staging/local SQL hazırlığı,
rollback hazırlığı,
test planı,
dokümantasyon
```

sprintidir.

---

## 2. Kullanılacak Read-Only Envanter Sonuçları

Aşağıdaki production çıktıları GOREV.md içine veya ayrı rapor dosyasına özetlenmeli:

### 2.1 RLS Açık/Kapalı Durumu

* 56 public tablo var.
* 56 tabloda RLS açık.
* 0 tabloda force RLS açık.

### 2.2 Kritik Tenant Tablolar

Şu tablolar tenant açısından temiz ve `firma_id` taşıyor:

```txt
customers
devices
service_forms
service_form_items
invoices
invoice_items
invoice_brokers
payments
teslimatlar
teslimat_kalemleri
teklifler
teklif_kalemleri
proforma_faturalar
proforma_fatura_kalemleri
teknik_raporlar
musteri_talepleri
is_planlari
planli_isler
brokers
araci_cari_hareketleri
subeler
kullanici_profiller
```

`firmalar` tablosunda `firma_id` olmaması normaldir; firma tablosu tenant’ın kendisidir.

### 2.3 Fazla İzin Veren Policy Grupları

Gerçek policy listesinde aşağıdaki risk grupları görüldü.

#### A. `anon` rolüne açık policy’ler

```txt
araci_cari_hareketleri / anon_all
mutabakat_formlari / anon_full_access
sube_gider_gelir / anon_all
subeler / anon_read
```

#### B. `public` rolüne `true` / `ALL` veren policy’ler

```txt
app_settings / Service role has full access
branches / branches_select
customers / customers_select, customers_insert, customers_update
devices / devices_select, devices_insert, devices_update
firmalar / firmalar_auth_read, firmalar_auth_insert, firmalar_auth_update
on_kayitlar / Service role has full access
service_forms / sf_select, sf_insert, sf_update, sf_delete
service_form_items / sfi_all
teklifler / Service role has full access
teklif_kalemleri / Service role has full access
teslimatlar / Service role has full access
teslimat_kalemleri / Service role has full access
teslimat_durum_gecmisi / Service role has full access
urunler / Service role has full access
```

#### C. `auth.uid() IS NOT NULL` ile tenant kontrolü olmadan izin veren policy’ler

```txt
customers
devices
service_forms
service_form_items
is_planlari
musteri_talepleri
planli_isler
proforma_faturalar
proforma_fatura_kalemleri
teknik_raporlar
maas_odemeleri
mesai_kayitlari
personeller
personel_izinler
personel_belgeler
performans_degerlendirmeleri
yillik_izin_hakki
teknik_hesap_ayarlari
```

---

## 3. Üretilecek Dosyalar

Aşağıdaki yeni dosyaları oluştur:

```txt
db/tenant_rls_policy_inventory_real.md
db/tenant_rls_staging_cleanup_real.sql
db/tenant_rls_staging_apply_tenant_policies_real.sql
db/tenant_rls_helper_upgrade_staging.sql
db/tenant_rls_staging_rollback_real.sql
db/tenant_rls_staging_test_matrix_real.md
db/tenant_rls_production_risk_assessment_real.md
```

Mevcut şu dosyaları gerekirse güncelle:

```txt
db/rls_inventory_analysis.md
db/tenant_rls_cleanup_plan.md
db/tenant_rls_production_readiness_gate.md
db/tenant_rls_negative_test_plan.md
```

Kod dosyası normalde değiştirme.

---

## 4. tenant_rls_policy_inventory_real.md

Yeni dosya:

```txt
db/tenant_rls_policy_inventory_real.md
```

Bu dosya gerçek production policy envanterinin analiz edilmiş hali olacak.

İçerik formatı:

```md
# Tenant RLS Real Policy Inventory

## 1. Genel Özet

- Public tablo sayısı: 56
- RLS açık tablo sayısı: 56
- Force RLS açık tablo sayısı: 0
- Fazla izin veren policy sayısı: 59

## 2. Production Veri Durumu

- firma_id boş kayıt: yok
- parent-child uyumsuzluk: yok
- şube-firma uyumsuzluk: yok

## 3. Helper Fonksiyon Durumu

| Fonksiyon | Var mı | Durum | Risk |
|---|---|---|---|
| current_firma_id | Evet | Çalışır | aktif=true kontrolü yok |
| is_super_admin | Evet | Rol adı Super Admin bekliyor | Production’da rol adı Admin görünüyor |
| current_user_role | Hayır | Eksik | Şube/rol policy için gerekli olabilir |
| current_user_sube_id | Hayır | Eksik | Şube policy için gerekli olabilir |

## 4. Riskli Policy Listesi

| Tablo | Policy | Rol | Komut | Risk Pattern | Staging Aksiyonu |
|---|---|---|---|---|---|

## 5. Tenant Policy ile Değiştirilecek Kritik Tablolar

| Tablo | Mevcut Risk | Yeni Policy Mantığı |
|---|---|---|
| customers | auth.uid() IS NOT NULL | firma_id = current_firma_id() OR is_super_admin() |
| devices | auth.uid() IS NOT NULL | firma_id = current_firma_id() OR is_super_admin() |
| service_forms | auth.uid() IS NOT NULL | firma_id = current_firma_id() OR is_super_admin() |
| service_form_items | auth.uid() IS NOT NULL | firma_id = current_firma_id() OR is_super_admin() |
| invoices | RLS açık ama policy yok | firma_id = current_firma_id() OR is_super_admin() |
| invoice_items | RLS açık ama policy yok | firma_id = current_firma_id() OR is_super_admin() |
| payments | RLS açık ama policy yok | firma_id = current_firma_id() OR is_super_admin() |
| teklifler | true/public | firma_id = current_firma_id() OR is_super_admin() |
| teklif_kalemleri | true/public | firma_id = current_firma_id() OR is_super_admin() |
| teslimatlar | true/public | firma_id = current_firma_id() OR is_super_admin() |
| teslimat_kalemleri | true/public | firma_id = current_firma_id() OR is_super_admin() |
| proforma_faturalar | auth.uid() IS NOT NULL | firma_id = current_firma_id() OR is_super_admin() |
| proforma_fatura_kalemleri | auth.uid() IS NOT NULL | firma_id = current_firma_id() OR is_super_admin() |
| teknik_raporlar | auth.uid() IS NOT NULL | firma_id = current_firma_id() OR is_super_admin() |
| brokers | true/authenticated | firma_id = current_firma_id() OR is_super_admin() |
| araci_cari_hareketleri | anon/public true | firma_id = current_firma_id() OR is_super_admin() |
| musteri_talepleri | auth.uid() IS NOT NULL + public true | firma_id = current_firma_id() OR is_super_admin() |
| is_planlari | auth.uid() IS NOT NULL + public true | firma_id = current_firma_id() OR is_super_admin() |
| planli_isler | auth.uid() IS NOT NULL + public true | firma_id = current_firma_id() OR is_super_admin() |

## 6. Global/Lookup Olarak Ayrı Değerlendirilecek Tablolar

| Tablo | Mevcut Durum | Öneri |
|---|---|---|
| urunler | public true | İlk aşamada authenticated read, yazma sadece admin |
| roller | authenticated true read | kalabilir ama yazma kapalı olmalı |
| modul_izinleri | authenticated true read | rol bazlı ayrıca incelenecek |
| device_types | public true read | lookup ise read kalabilir |
| teknik_hesap_ayarlari | auth all | ayrı ele alınmalı |
```

---

## 5. tenant_rls_helper_upgrade_staging.sql

Yeni dosya:

```txt
db/tenant_rls_helper_upgrade_staging.sql
```

Bu dosya **yalnızca staging/local içindir**.

En üste uyarı koy:

```sql
-- ==========================================================
-- STAGING ONLY
-- Production üzerinde çalıştırılmayacak.
-- Helper fonksiyon iyileştirme denemesi içindir.
-- ==========================================================
```

İçerik:

### 5.1 current_firma_id iyileştirmesi

Mevcut fonksiyon aktif kullanıcı kontrolü yapmıyor. Staging’de şu hale getir:

```sql
CREATE OR REPLACE FUNCTION public.current_firma_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT kp.firma_id
  FROM public.kullanici_profiller kp
  WHERE kp.id = auth.uid()
    AND kp.aktif = true
  LIMIT 1
$$;
```

### 5.2 is_super_admin iyileştirmesi

Production’da rol adı `Admin` görünüyor. Staging’de hem `Super Admin` hem `Admin` desteklensin:

```sql
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.kullanici_profiller kp
    JOIN public.roller r ON r.id = kp.rol_id
    WHERE kp.id = auth.uid()
      AND kp.aktif = true
      AND lower(coalesce(r.ad, '')) IN (
        'super admin',
        'super_admin',
        'admin',
        'sistem yöneticisi'
      )
  )
$$;
```

### 5.3 current_user_role oluştur

```sql
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.ad
  FROM public.kullanici_profiller kp
  LEFT JOIN public.roller r ON r.id = kp.rol_id
  WHERE kp.id = auth.uid()
    AND kp.aktif = true
  LIMIT 1
$$;
```

### 5.4 current_user_sube_id oluştur

```sql
CREATE OR REPLACE FUNCTION public.current_user_sube_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT kp.sube_id
  FROM public.kullanici_profiller kp
  WHERE kp.id = auth.uid()
    AND kp.aktif = true
  LIMIT 1
$$;
```

---

## 6. tenant_rls_staging_cleanup_real.sql

Yeni dosya:

```txt
db/tenant_rls_staging_cleanup_real.sql
```

Bu dosya **yalnızca staging/local içindir**.

Amacı: gerçek policy adlarına göre riskli policy’leri staging’de kaldırmak.

En üste uyarı koy:

```sql
-- ==========================================================
-- STAGING ONLY
-- Production üzerinde çalıştırılmayacak.
-- Gerçek production policy adlarına göre hazırlanmıştır.
-- ==========================================================
```

Aşağıdaki policy’ler staging’de kaldırılacak şekilde `DROP POLICY IF EXISTS` olarak yazılsın.

Öncelik 1 — tenant kritik tablolar:

```sql
DROP POLICY IF EXISTS customers_insert ON public.customers;
DROP POLICY IF EXISTS customers_select ON public.customers;
DROP POLICY IF EXISTS customers_update ON public.customers;

DROP POLICY IF EXISTS devices_insert ON public.devices;
DROP POLICY IF EXISTS devices_select ON public.devices;
DROP POLICY IF EXISTS devices_update ON public.devices;

DROP POLICY IF EXISTS sf_delete ON public.service_forms;
DROP POLICY IF EXISTS sf_insert ON public.service_forms;
DROP POLICY IF EXISTS sf_select ON public.service_forms;
DROP POLICY IF EXISTS sf_update ON public.service_forms;

DROP POLICY IF EXISTS sfi_all ON public.service_form_items;

DROP POLICY IF EXISTS proforma_auth_all ON public.proforma_faturalar;
DROP POLICY IF EXISTS proforma_kalem_auth_all ON public.proforma_fatura_kalemleri;

DROP POLICY IF EXISTS teknik_raporlar_auth_all ON public.teknik_raporlar;

DROP POLICY IF EXISTS "Authenticated users can do everything on brokers" ON public.brokers;
DROP POLICY IF EXISTS "Authenticated users can do everything on invoice_brokers" ON public.invoice_brokers;

DROP POLICY IF EXISTS anon_all ON public.araci_cari_hareketleri;
DROP POLICY IF EXISTS auth_all ON public.araci_cari_hareketleri;

DROP POLICY IF EXISTS operasyon_auth_all ON public.musteri_talepleri;
DROP POLICY IF EXISTS operasyon_service_all ON public.musteri_talepleri;

DROP POLICY IF EXISTS operasyon_auth_all ON public.is_planlari;
DROP POLICY IF EXISTS operasyon_service_all ON public.is_planlari;

DROP POLICY IF EXISTS operasyon_auth_all ON public.planli_isler;
DROP POLICY IF EXISTS operasyon_service_all ON public.planli_isler;
```

Not: Aynı policy adı farklı tablolarda kullanıldığı için `DROP POLICY ... ON public.tablo` şeklinde tabloyla birlikte yazılmalı.

Öncelik 2 — public true / service role isimli ama aslında herkese açık tenant tablolar:

```sql
DROP POLICY IF EXISTS "Service role has full access" ON public.teklifler;
DROP POLICY IF EXISTS "Service role has full access" ON public.teklif_kalemleri;
DROP POLICY IF EXISTS "Service role has full access" ON public.teslimatlar;
DROP POLICY IF EXISTS "Service role has full access" ON public.teslimat_kalemleri;
DROP POLICY IF EXISTS "Service role has full access" ON public.teslimat_durum_gecmisi;
DROP POLICY IF EXISTS "Service role has full access" ON public.on_kayitlar;
```

`urunler`, `roller`, `modul_izinleri`, `device_types`, `teknik_hesap_ayarlari` gibi lookup/ayar/personel tablolarını bu sprintte staging cleanup içine alma; ayrı güvenlik modeline bırak.

---

## 7. tenant_rls_staging_apply_tenant_policies_real.sql

Yeni dosya:

```txt
db/tenant_rls_staging_apply_tenant_policies_real.sql
```

Bu dosya **yalnızca staging/local içindir**.

Tenant policy şablonu:

```sql
CREATE POLICY table_name_tenant_select
ON public.table_name
FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
  OR firma_id = public.current_firma_id()
);
```

```sql
CREATE POLICY table_name_tenant_insert
ON public.table_name
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_super_admin()
  OR firma_id = public.current_firma_id()
);
```

```sql
CREATE POLICY table_name_tenant_update
ON public.table_name
FOR UPDATE
TO authenticated
USING (
  public.is_super_admin()
  OR firma_id = public.current_firma_id()
)
WITH CHECK (
  public.is_super_admin()
  OR firma_id = public.current_firma_id()
);
```

DELETE policy varsayılan olarak eklenmeyecek.

Şu tablolara SELECT/INSERT/UPDATE tenant policy oluştur:

```txt
customers
devices
service_forms
service_form_items
invoices
invoice_items
invoice_brokers
payments
teslimatlar
teslimat_kalemleri
teklifler
teklif_kalemleri
proforma_faturalar
proforma_fatura_kalemleri
teknik_raporlar
musteri_talepleri
is_planlari
planli_isler
brokers
araci_cari_hareketleri
```

Özel notlar:

* `invoices`, `invoice_items`, `payments` tablolarında policy_count 0 olduğu için staging’de doğrudan tenant policy eklenecek.
* `firmalar`, `kullanici_profiller`, `subeler` özel policy gerektirir; bu dosyanın sonunda ayrı bölüm aç.

### 7.1 firmalar özel policy

```sql
DROP POLICY IF EXISTS firmalar_tenant_select ON public.firmalar;
CREATE POLICY firmalar_tenant_select
ON public.firmalar
FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
  OR id = public.current_firma_id()
);
```

INSERT/UPDATE şimdilik ekleme veya sadece yorumda bırak.

### 7.2 kullanici_profiller özel policy

```sql
DROP POLICY IF EXISTS kullanici_profiller_self_select ON public.kullanici_profiller;
CREATE POLICY kullanici_profiller_self_select
ON public.kullanici_profiller
FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
  OR id = auth.uid()
  OR firma_id = public.current_firma_id()
);
```

UPDATE için ilk aşamada sadece kendi profili:

```sql
DROP POLICY IF EXISTS kullanici_profiller_self_update ON public.kullanici_profiller;
CREATE POLICY kullanici_profiller_self_update
ON public.kullanici_profiller
FOR UPDATE
TO authenticated
USING (
  public.is_super_admin()
  OR id = auth.uid()
)
WITH CHECK (
  public.is_super_admin()
  OR id = auth.uid()
);
```

### 7.3 subeler özel policy

```sql
DROP POLICY IF EXISTS subeler_tenant_select ON public.subeler;
CREATE POLICY subeler_tenant_select
ON public.subeler
FOR SELECT
TO authenticated
USING (
  public.is_super_admin()
  OR firma_id = public.current_firma_id()
);
```

---

## 8. tenant_rls_staging_rollback_real.sql

Yeni dosya:

```txt
db/tenant_rls_staging_rollback_real.sql
```

Bu dosya staging denemesinde geri dönüş için hazırlanacak.

İçerik:

* Yeni oluşturulan `*_tenant_select`, `*_tenant_insert`, `*_tenant_update` policy’leri kaldır.
* Helper fonksiyonları eski hale döndürmek için not ekle.
* Eski policy’leri geri oluşturmak için doğrudan production’daki riskli policy’lerin birebir CREATE taslağını **yorum satırı olarak** ekle.
* Rollback dosyası production’da çalıştırılmayacak.

---

## 9. tenant_rls_staging_test_matrix_real.md

Yeni dosya:

```txt
db/tenant_rls_staging_test_matrix_real.md
```

İçerik:

```md
# Tenant RLS Staging Test Matrix — Real Policy Cleanup

## Ön Koşullar

- Staging/local Supabase kullanılıyor.
- Production kullanılmıyor.
- En az iki firma var.
- En az iki kullanıcı var.
- Helper upgrade staging’de uygulandı.
- Cleanup staging’de uygulandı.
- Tenant policies staging’de uygulandı.

## Test Matrisi

| Modül | Liste | Detay | Oluşturma | Güncelleme | PDF/Yazdırma | Negatif Başka Firma Testi | Sonuç |
|---|---|---|---|---|---|---|---|
| customers |  |  |  |  | - |  |  |
| devices |  |  |  |  | - |  |  |
| service_forms |  |  |  |  |  |  |  |
| invoices |  |  |  |  |  |  |  |
| payments | - | - |  | - | - |  |  |
| teslimatlar |  |  |  |  |  |  |  |
| teklifler |  |  |  |  |  |  |  |
| proforma_faturalar |  |  |  |  |  |  |  |
| teknik_raporlar |  |  |  |  |  |  |  |
| operasyon |  |  |  |  |  |  |  |
| brokers/araci_cari |  |  |  |  | - |  |  |
| dashboard |  | - | - | - | - |  |  |

## Kritik Negatif Testler

- Başka firma müşterisi listede görünmemeli.
- Başka firma müşteri detay URL’si 404/yetkisiz olmalı.
- Başka firma faturasına ödeme eklenememeli.
- Başka firma servis formu PDF üretilememeli.
- Başka firma teklif/proforma PDF üretilememeli.
- Başka firma teknik rapor copy/quote/cancel engellenmeli.
```

---

## 10. tenant_rls_production_risk_assessment_real.md

Yeni dosya:

```txt
db/tenant_rls_production_risk_assessment_real.md
```

İçerik:

```md
# Tenant RLS Production Risk Assessment — Real Inventory

## Genel Karar

Production RLS şu anda açılmayacak / policy temizliği yapılmayacak.

## Neden

- 59 adet fazla izin veren policy var.
- Bazı tenant kritik tablolarda policy yok: invoices, invoice_items, payments.
- Bazı policy’ler anon/public true veriyor.
- is_super_admin helper production rol adıyla uyuşmayabilir.
- current_user_role ve current_user_sube_id helper’ları eksik.
- Staging dry-run ve rollback provası yapılmadı.

## En Riskli Tablolar

| Tablo | Risk |
|---|---|
| araci_cari_hareketleri | anon ALL true |
| mutabakat_formlari | anon ALL true |
| sube_gider_gelir | anon ALL true |
| teklifler | public ALL true |
| teslimatlar | public ALL true |
| customers | auth.uid() IS NOT NULL |
| devices | auth.uid() IS NOT NULL |
| service_forms | auth.uid() IS NOT NULL |
| invoices | RLS açık, policy yok |
| payments | RLS açık, policy yok |

## Production Öncesi Zorunlu Adımlar

- Staging DB oluştur.
- Helper upgrade staging’de test et.
- Gerçek policy cleanup staging’de test et.
- Tenant policy apply staging’de test et.
- Negatif testleri tamamla.
- Rollback provasını yap.
- Sonra production için ayrı bakım penceresi ve backup planı hazırla.
```

---

## 11. Mevcut Dosyaları Güncelle

### 11.1 db/rls_inventory_analysis.md

Gerçek production çıktılarına göre şu bölümleri doldur:

* RLS açık tablo sayısı: 56
* Force RLS açık tablo sayısı: 0
* Fazla izin veren policy sayısı: 59
* Helper durumu:

  * current_firma_id var
  * is_super_admin var
  * current_user_role yok
  * current_user_sube_id yok
* Veri temizlik özeti: tüm kontroller 0

### 11.2 db/tenant_rls_cleanup_plan.md

Gerçek policy adlarıyla staging cleanup planını güncelle.

### 11.3 db/tenant_rls_production_readiness_gate.md

Şu maddeleri işaretlenmemiş şekilde ekle:

```md
- [ ] Staging helper upgrade test edildi.
- [ ] Staging gerçek policy cleanup test edildi.
- [ ] Staging tenant policy apply test edildi.
- [ ] Staging negatif testler geçti.
- [ ] Staging rollback provası yapıldı.
```

---

## 12. Testler

Kod dosyası değiştirme. Sadece `db/*.sql`, `db/*.md`, gerekirse `GOREV.md` değişmeli.

Sonra çalıştır:

```powershell
npx.cmd tsc --noEmit
npm run build
```

Eğer `.next` cache hatası çıkarsa:

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npx.cmd tsc --noEmit
npm run build
```

---

## 13. Commit

Stage edilecek dosyalar:

```powershell
git add GOREV.md
git add db/tenant_rls_policy_inventory_real.md
git add db/tenant_rls_staging_cleanup_real.sql
git add db/tenant_rls_staging_apply_tenant_policies_real.sql
git add db/tenant_rls_helper_upgrade_staging.sql
git add db/tenant_rls_staging_rollback_real.sql
git add db/tenant_rls_staging_test_matrix_real.md
git add db/tenant_rls_production_risk_assessment_real.md
git add db/rls_inventory_analysis.md
git add db/tenant_rls_cleanup_plan.md
git add db/tenant_rls_production_readiness_gate.md
```

Kontrol:

```powershell
git diff --cached --name-only
```

Commit:

```powershell
git commit -m "docs: prepare real tenant RLS staging cleanup plan"
```

Push:

```powershell
git push
```

---

## 14. Görev Sonu Raporu

Görev bitince şu formatta rapor ver:

```md
# Sprint 1.9 Görev Sonu Raporu

## Yapılanlar

- Gerçek production policy envanteri analiz edildi.
- Staging helper upgrade SQL’i hazırlandı.
- Gerçek policy adlarına göre staging cleanup SQL’i hazırlandı.
- Tenant policy apply SQL’i hazırlandı.
- Rollback SQL’i hazırlandı.
- Test matrisi hazırlandı.
- Production risk assessment hazırlandı.

## Production’da İşlem Yapıldı mı?

- RLS değiştirildi mi? Hayır.
- Policy drop/create yapıldı mı? Hayır.
- Veri değiştirildi mi? Hayır.
- NOT NULL yapıldı mı? Hayır.

## Hazırlanan Dosyalar

- ...

## Kritik Bulgular

- Public şemada 56 tabloda RLS açık.
- Force RLS açık tablo yok.
- 59 adet fazla izin veren policy var.
- current_firma_id ve is_super_admin var.
- current_user_role ve current_user_sube_id eksik.
- is_super_admin rol adı production ile uyuşmayabilir.
- Veri temizlik kontrolleri temiz.

## Testler

- npx.cmd tsc --noEmit:
- npm run build:

## Commit / Push

- Commit hash:
- Push sonucu:

## Sonraki Adım

Production değil, staging/local Supabase üzerinde şu sırayla test yapılacak:

1. tenant_rls_helper_upgrade_staging.sql
2. tenant_rls_staging_cleanup_real.sql
3. tenant_rls_staging_apply_tenant_policies_real.sql
4. tenant_rls_staging_test_matrix_real.md testleri
5. tenant_rls_staging_rollback_real.sql rollback provası
