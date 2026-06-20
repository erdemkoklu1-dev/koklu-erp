# Tenant Görünürlük Testi ve RLS Hazırlık Raporu — Sprint 1.5

**Tarih:** 2026-06-20
**Kapsam:** Tenant güvenlik denetimi, kaçak sorgu tespiti, RLS hazırlık.
**Bu sprintte RLS aktif EDİLMEDİ. firma_id NOT NULL YAPILMADI. Veri silme/taşıma YAPILMADI.**

---

## 1. Test Firması Görünürlük Testi (önceki sprintte yapıldı, dokümantasyon)

| Alan | Değer |
| --- | --- |
| Test edilen kayıt | EXOPANEL müşterisi |
| Eski firma_id | Köklü Yangın (`koklu-yangin`) |
| Yeni geçici firma_id | Test Yangın Firması |
| Liste görünürlüğü sonucu | Normal Köklü admin kullanıcısının müşteri listesinde **görünmedi** ✅ |
| Detay URL sonucu | Doğrudan `/customers/[id]` erişimi **güvenli engellendi** (kayıt bulunamadı) ✅ |
| Geri alma sonucu | EXOPANEL tekrar Köklü firmasına alındı ✅ |
| Son karar | Sunucu tarafı tenant filtresi (`applyTenantScope`) çalışıyor; görünürlük izolasyonu doğrulandı |

> Not: Bu test sunucu tarafı (server component + service-role + `applyTenantScope`) okuma yolları için geçerlidir. İstemci tarafı `anon` anahtarıyla doğrudan sorgu yapan sayfalar için izolasyon RLS açılınca tam olarak garanti edilecektir (bkz. Bölüm 4).

---

## 2. Bu Sprintte Yapılan Denetim ve Düzeltmeler

### 2.1 Denetlenen tenant helper'ı (`src/lib/auth/tenant-scope.ts`)
Tüm beklenen fonksiyonlar mevcut ve doğru çalışıyor:
`requireCurrentFirmaId()`, `getCurrentTenantAccess()` / `getCurrentTenantAccessFromSession()`, `applyTenantScope()`, `filterVisibleTenantRows()`, `assertBranchBelongsToFirma()`, `assertCustomerBelongsToFirma()`, `assertDevicesBelongToFirma()`, `withFirmaId()`. Helper'da değişiklik gerekmedi.

### 2.2 Bulunan ve düzeltilen eksik tenant kontrolleri

| Dosya | Sorun | Düzeltme |
| --- | --- | --- |
| `src/app/api/teknik-raporlar/[id]/route.ts` (DELETE) | `createClient()` ile id'ye göre rapor okunuyor/siliniyor, **firma kontrolü yoktu** (RLS kapalı olduğundan başka firmanın raporu silinebilirdi) | `requireCurrentFirmaId()` + `firma_id` eşitlik kontrolü eklendi, uyumsuzsa 403 |
| `src/app/api/teknik-raporlar/[id]/cancel/route.ts` (POST) | id'ye göre kör `update`, **firma kontrolü yoktu** | Önce kayıt okunup `firma_id` doğrulanıyor, uyumsuzsa 403 |
| `src/app/api/gelen-supplier-match-source/route.ts` (GET) | `invoices` (alış) tedarikçi listesi **firma filtresi olmadan** dönüyordu (firmalar arası tedarikçi adı sızıntısı) | `requireCurrentFirmaId()` + `.eq('firma_id', firmaId)` eklendi |
| `src/app/(dashboard)/operasyon/talepler/[id]/duzenle/page.tsx` | `musteri_talepleri` yalnızca şube filtresiyle okunuyordu; **admin için firma filtresi yoktu** | `applyTenantScope` eklendi |
| `src/app/(dashboard)/operasyon/talepler/yeni/page.tsx` | `customers` ve `devices` yalnızca şube scope; admin için firmalar arası sızıntı | `applyTenantScope(applyBranchScope(...))` eklendi |
| `src/app/(dashboard)/operasyon/is-planlari/yeni/page.tsx` | `customers` ve `musteri_talepleri` yalnızca şube scope | `applyTenantScope` eklendi |

> Düzeltmeler bilinçli olarak küçük tutuldu: yalnızca eksik `firma_id` filtresi / kontrolü eklendi. Hesaplama, parser, teknik rapor formülü, teslimat mantığı **değiştirilmedi**.

### 2.3 Denetlenip GÜVENLİ bulunan kritik service-role route'ları

| Route | Durum |
| --- | --- |
| `api/invoices/route.ts` (GET/POST) | ✅ `applyTenantScope` (GET), `requireCurrentFirmaId` + şube/müşteri assert + insert firma_id (POST) |
| `api/invoices/[id]/route.ts` (DELETE) | ✅ Okuma + `firma_id` eşitlik kontrolü, uyumsuzsa 403 |
| `api/odeme-kaydet/route.ts` | ✅ Fatura firma_id doğrulanıyor, payment insert firma_id |
| `api/toplu-odeme/route.ts` | ✅ Her fatura için firma_id doğrulaması |
| `api/pdf-fatura-save/route.ts` | ✅ Müşteri/şube assert, tüm insert'lerde firma_id |
| `api/gelen-fatura-import/route.ts` | ✅ Şube assert, firma scoped duplicate kontrolü, firma_id |
| `api/gelen-pdf-save/route.ts` | ✅ Şube assert, firma scoped, firma_id |
| `api/efatura-import/route.ts` | ✅ firma scoped okuma + firma_id insert |
| `api/customers/[id]/route.ts` (GET/DELETE) | ✅ `applyTenantScope` ile okuma/silme/pasife alma |
| `api/teknik-raporlar/[id]/quote|copy/route.ts` | ✅ `requireCurrentFirmaId` + firma_id kontrolü + assert |
| `api/teslimatlar/[id]/pdf/route.ts` | ✅ `getTeslimFormData` içinden `applyTenantScope` ile korunuyor |
| `api/tenant-create/route.ts` | ✅ Tüm action'larda `withFirmaId` + müşteri/şube/aracı assert |

### 2.4 Dashboard tenant filtresi
`src/app/(dashboard)/dashboard/page.tsx`: tüm kartlar `applyTenantScope` ardından `applyBranchScope` ile (doğru sıra: önce firma, sonra şube) sorgulanıyor. Teknik/muhasebe rol kartı gizleme kuralları korunuyor. ✅

---

## 3. firma_id IS NULL ve Uyumsuzluk Durumu

`db/tenant_audit_checks.sql` çalıştırılarak doğrulanmalıdır (read-only). Önceki sprintte tüm temel tablolar varsayılan firmaya bağlandığı için `firma_id IS NULL` sayılarının **0** olması beklenir. Bu kod denetimi DB'yi değiştirmediğinden sayıların canlıda script ile teyit edilmesi gerekir.

---

## 4. RLS / NOT NULL Hazırlık Tablosu

Format: tablo · firma_id boş kayıt · ilişki uyumsuzluğu · yeni kayıt akışı firma_id yazıyor mu · NOT NULL/RLS hazır mı.

| Tablo | firma_id boş | İlişki uyumsuzluğu | Yeni kayıt firma_id | NOT NULL/RLS hazır |
| --- | --- | --- | --- | --- |
| customers | 0 (script ile teyit) | yok (beklenen) | evet (tenant-create / import / API) | **EVET** |
| devices | 0 | yok | evet | **EVET** |
| service_forms | 0 | yok | evet (tenant-create) | **EVET** |
| service_form_items | 0 | parent ile aynı | evet (trigger ile parent formdan) | **EVET** |
| invoices | 0 | yok | evet | **EVET** |
| invoice_items | 0 | parent ile aynı | evet | **EVET** |
| invoice_brokers | 0 | parent fatura ile aynı | evet (trigger ile parent faturadan) | **EVET** |
| payments | 0 | yok | evet | **EVET** |
| teslimatlar | 0 | yok | evet | **EVET** |
| teslimat_kalemleri | 0 | parent ile aynı | evet | **EVET** |
| teklifler | 0 | yok | evet | **EVET** |
| teklif_kalemleri | 0 | parent ile aynı | evet | **EVET** |
| proforma_faturalar | 0 | yok | evet | **EVET** |
| proforma_fatura_kalemleri | 0 | parent ile aynı | evet (trigger ile parent proformadan) | **EVET** |
| teknik_raporlar | 0 | yok | evet (delete/cancel bu sprint düzeltildi) | **EVET (yeni test sonrası)** |
| musteri_talepleri | 0 | yok | evet | **EVET (yeni test sonrası)** |
| is_planlari | 0 | yok | evet | **EVET** |
| planli_isler | 0 | doğrulanmalı | evet | **Tekrar test gerekli** |
| brokers | 0 | yok | evet (tenant-create) | **EVET — ama bkz. istemci-anon riski** |
| araci_cari_hareketleri | 0 | aracı ile aynı | evet (aracı assert) | **EVET** |

### Sprint 1.5B final kontrol
Canlı Supabase üzerinde manuel çalıştırılan eksik child tablo tenant tamamlama adımları repo içine kalıcı migration olarak eklendi: `db/tenant_missing_child_firma_id_sync.sql`.

Final denetim sonucu:
- `firma_id` boş kayıt yok.
- Parent-child firma uyumsuzluğu yok.
- Şube-firma uyumsuzluğu yok.
- Eksik üç tablo tamamlandı: `invoice_brokers`, `proforma_fatura_kalemleri`, `service_form_items`.

---

## 5. İstemci Tarafı (anon) Doğrudan Sorgu Riski — RLS ile Kapanacak

Aşağıdaki sayfalar `@/lib/supabase/client` (anon anahtar) ile **doğrudan** tenant tablolarına okuma/yazma yapıyor ve RLS kapalı olduğu için şu an firma izolasyonu **yalnızca uygulama mantığına** bağlı. Bunlar bu sprintte yeniden yazılmadı (büyük refactor + modül mantığı kapsam dışı), ancak RLS açılınca otomatik kapanacak. Liste:

- `src/app/(dashboard)/araclar/[id]/edit/page.tsx` — `brokers` doğrudan `select`/`update` (firma guard yok; anon).
- `src/app/(dashboard)/araclar/new/page.tsx` — broker oluşturma (tenant-create kullanılmalı; takip).
- `src/app/(dashboard)/devices/new/page.tsx` — müşteri/ürün açılır listeleri anon `select` (yazma `tenant-create` ile güvenli).
- Genel kalıp: çok sayıda `'use client'` sayfasında müşteri/cihaz açılır listeleri anon `select` ile besleniyor.

**Öneri:** RLS politikaları (`tenant_rls_policy_draft.sql`) devreye alınınca bu yolların hepsi firma bazında filtrelenecek. Geçişe kadar yazma işlemleri mümkün olduğunca `api/tenant-create` veya server action üzerinden yapılmalı.

---

## 6. Kapsam Dışı / Henüz Tenant'lanmamış Tablolar (bilgi)

`tedarikciler` ve `fixed_expenses` (sabit_giderler) için ilgili API route'larında firma filtresi yok; ancak bu tablolar GÖREV'in öncelikli tenant tablo listesinde değil ve `firma_id` kolonu kullanımı kodda görülmedi. Ticari SaaS öncesi ayrı bir sprintte ele alınmalı.

---

## 7. Hangi Tablolar RLS İçin Hazır / Hangileri Ek Test İstiyor

**RLS'e hazır (audit script 0 dönerse):**
customers, devices, service_forms, service_form_items, invoices, invoice_items, invoice_brokers, payments, teslimatlar, teslimat_kalemleri, teklifler, teklif_kalemleri, proforma_faturalar, proforma_fatura_kalemleri, teknik_raporlar, musteri_talepleri, is_planlari, araci_cari_hareketleri, brokers.

**Ek test / işlem gerekiyor:**
- `planli_isler` — ilişki uyumsuzluğu sorgusu canlıda teyit edilmeli.
- İstemci-anon doğrudan sorgu yapan sayfalar (Bölüm 5) — RLS açılmadan tam izole değil.
- Birçok modül tablosunda **izin verici (`auth.uid() is not null`) RLS policy'leri zaten açık** (ör. proforma). RLS sertleştirmesi bu eski policy'lerin DROP edilip tenant policy ile değiştirilmesini gerektirir; önce `pg_policies` envanteri çıkarılmalı.

---

## 8. Sonuç

- RLS bu sprintte **aktif edilmedi.** ❌ (kasıtlı)
- NOT NULL bu sprintte **yapılmadı.** ❌ (kasıtlı)
- Veri silme/taşıma **yapılmadı.**
- Parser / hesaplama / teknik rapor formülü / teslimat mantığı **değiştirilmedi.**
- 6 dosyada eksik tenant filtresi/kontrolü tespit edilip düzeltildi.
- 3 denetim/taslak dosyası üretildi: `tenant_audit_checks.sql`, `tenant_rls_policy_draft.sql`, `tenant_visibility_test_report.md`.
