# GÖREV — Sprint 1.5: Tenant Güvenlik Denetimi, Kaçak Sorgu Tespiti ve RLS Hazırlık

## Amaç

Köklü ERP’nin ticari SaaS altyapısı için tenant/firma ayrımı kademeli olarak kuruldu.

Tamamlananlar:

* `firmalar` tablosu oluşturuldu.
* Varsayılan `Köklü Yangın` firması oluşturuldu.
* `kullanici_profiller.firma_id` dolu.
* `subeler.firma_id` dolu.
* Kritik tablolara `firma_id` eklendi.
* Mevcut kayıtlar Köklü firmasına bağlandı.
* Yeni müşteri oluşturunca `customers.firma_id` doluyor.
* Yeni cihaz oluşturunca `devices.firma_id` doluyor.
* Servis formu, teklif, teslimat, teknik rapor, operasyon, fatura, ödeme, aracı cari kayıtlarında `firma_id` boş kayıt kalmadı.
* EXOPANEL müşterisi geçici olarak test firmasına taşınarak görünürlük testi yapıldı.
* Normal kullanıcıda farklı firmaya ait müşteri listede görünmedi.
* Doğrudan URL erişim testi başarılı geçti.
* EXOPANEL tekrar Köklü firmasına geri alındı.
* TypeScript ve build daha önce başarılı geçti.

Bu sprintin amacı:

1. Uygulama katmanında hâlâ tenant filtresi eksik kalan sorguları tespit etmek.
2. Service role kullanılan API route’larında tenant güvenlik kontrolü var mı denetlemek.
3. RLS açmadan önce riskli noktaları listelemek.
4. `firma_id IS NULL` kalmadığını tekrar doğrulamak.
5. RLS policy taslaklarını hazırlamak, ancak bu sprintte RLS’i aktif etmemek.
6. `firma_id NOT NULL` için hazır olmayan tabloları tespit etmek, ancak bu sprintte NOT NULL yapmamak.
7. Ticari SaaS’a geçiş öncesi tenant güvenlik raporu üretmek.

---

## 1. Çok Önemli Kısıtlar

Bu görevde kesinlikle şunlar yapılmayacak:

```txt
RLS policy aktif etme.
ALTER TABLE ... ENABLE ROW LEVEL SECURITY yapma.
firma_id kolonlarını NOT NULL yapma.
Mevcut kayıt silme.
Mevcut müşteri/fatura/cihaz verisi taşıma.
Fatura parser mantığını değiştirme.
KDV/toplam/iskonto hesaplarını değiştirme.
Teknik rapor formüllerini değiştirme.
Teslimat iptal/silme mantığını değiştirme.
Aracı komisyon formülünü değiştirme.
```

Bu sprint **denetim ve hazırlık sprintidir**.

---

## 2. İncelenecek Ana Dosyalar

Aşağıdaki klasör ve dosyalar taranacak:

```txt
src/app/(dashboard)/**
src/app/api/**
src/lib/**
src/lib/auth/tenant-scope.ts
src/lib/auth/branch-scope.ts
src/lib/supabase/**
```

Özellikle şu dosyalar dikkatli incelenecek:

```txt
src/app/api/invoices/route.ts
src/app/api/odeme-kaydet/route.ts
src/app/api/toplu-odeme/route.ts
src/app/api/pdf-fatura-save/route.ts
src/app/api/gelen-fatura-import/route.ts
src/app/api/gelen-pdf-save/route.ts
src/app/api/efatura-import/route.ts

src/app/(dashboard)/customers/**
src/app/(dashboard)/devices/**
src/app/(dashboard)/cihazlar/**
src/app/(dashboard)/service-forms/**
src/app/(dashboard)/teslimatlar/**
src/app/(dashboard)/fiyat-teklifleri/**
src/app/(dashboard)/cari-hesap/**
src/app/(dashboard)/operasyon/**
src/app/(dashboard)/teknik-raporlar/**
src/app/(dashboard)/araclar/**
src/app/(dashboard)/dashboard/page.tsx
```

---

## 3. Tenant Helper Kontrolü

Önce mevcut tenant helper dosyasını incele:

```txt
src/lib/auth/tenant-scope.ts
```

Aşağıdaki fonksiyonların doğru çalıştığını doğrula:

```txt
requireCurrentFirmaId()
getCurrentTenantAccess()
applyTenantScope()
filterVisibleTenantRows()
assertBranchBelongsToFirma()
assertCustomerBelongsToFirma()
```

Eksik varsa, mevcut mimariyi bozmadan tamamla.

Beklenen kurallar:

```txt
Normal kullanıcı:
  sadece kendi kullanici_profiller.firma_id kapsamındaki kayıtları görür ve işler.

Super Admin:
  ileride tüm firmaları görebilir, ancak mevcut tek firma kullanımını bozmaz.

Şube kullanıcısı:
  önce firma filtresi, sonra şube filtresi uygulanır.
```

Filtre sırası:

```txt
1. Tenant / firma scope
2. Şube scope
3. Sayfa filtreleri
4. Arama / tarih / durum filtreleri
```

---

## 4. Kaçak Sorgu Denetimi

Kod tabanında aşağıdaki pattern’leri ara:

```txt
.from('customers')
.from("customers")
.from('devices')
.from("devices")
.from('service_forms')
.from("service_forms")
.from('invoices')
.from("invoices")
.from('payments')
.from("payments")
.from('teslimatlar')
.from("teslimatlar")
.from('teklifler')
.from("teklifler")
.from('teknik_raporlar')
.from("teknik_raporlar")
.from('musteri_talepleri')
.from("musteri_talepleri")
.from('is_planlari')
.from("is_planlari")
.from('brokers')
.from("brokers")
.from('araci_cari_hareketleri')
.from("araci_cari_hareketleri")
```

Her sorgu için kontrol et:

```txt
Liste sorgusunda tenant filtresi var mı?
Detay sorgusunda tenant filtresi var mı?
PDF/yazdırma sorgusunda tenant kontrolü var mı?
Silme/güncelleme işleminde kayıt aynı firmaya ait mi kontrol ediliyor mu?
Service role kullanılıyorsa manuel tenant kontrolü var mı?
```

Eğer sorgu public ayar tablosu veya global lookup ise tenant filtresi gerekmeyebilir. Ancak bu durum raporda belirtilmeli.

---

## 5. Service Role API Güvenlik Denetimi

`createServiceClient()` kullanılan route’ları özellikle denetle.

Service role RLS’i bypass edebileceği için bu route’larda mutlaka manuel firma kontrolü olmalı.

Aranacak pattern:

```txt
createServiceClient()
```

Her service role route için şu soruları cevapla:

```txt
Bu route hangi tabloya okuma/yazma yapıyor?
Kullanıcının firma_id değeri alınıyor mu?
İşlem yapılan kayıt kullanıcının firmasına ait mi kontrol ediliyor mu?
Yeni kayıt oluşturuluyorsa firma_id yazılıyor mu?
Güncelleme/silme işleminde firma_id kontrolü var mı?
```

Örnek güvenli yapı:

```ts
const firmaId = await requireCurrentFirmaId()

const { data: invoice } = await supabase
  .from('invoices')
  .select('id, firma_id')
  .eq('id', invoiceId)
  .maybeSingle()

if (!invoice || invoice.firma_id !== firmaId) {
  return NextResponse.json(
    { error: 'Bu kayıt kullanıcının firmasına ait değil.' },
    { status: 403 }
  )
}
```

---

## 6. Detay ve PDF Route Kontrolü

Aşağıdaki türde route’lar özellikle kontrol edilecek:

```txt
[id]/page.tsx
[id]/edit/page.tsx
[id]/pdf/page.tsx
[id]/yazdir/page.tsx
[id]/delete-action.ts
[id]/copy/route.ts
[id]/quote/route.ts
```

Kural:

```txt
ID ile gelen kayıt önce firma_id kontrolünden geçmeli.
Kayıt bulunamazsa veya başka firmaya aitse güvenli hata verilmeli.
```

Yanlış örnek:

```ts
const { data } = await supabase
  .from('customers')
  .select('*')
  .eq('id', id)
  .single()
```

Doğru örnek:

```ts
let query = supabase
  .from('customers')
  .select('*')
  .eq('id', id)

query = applyTenantScope(query, access)

const { data } = await query.maybeSingle()
```

---

## 7. Dashboard Denetimi

Dashboard sorgularında tenant filtresi eksik kalmamalı.

Kontrol edilecek kartlar:

```txt
Toplam müşteri
Toplam cihaz
SKT yaklaşan/geçen cihazlar
Servis formu sayıları
Fatura toplamları
Tahsilat/borç kartları
Teklif sayıları
Teslimat özetleri
Operasyon talepleri
Teknik rapor sayıları
Aracı cari özetleri
```

Her kart için:

```txt
Firma filtresi uygulanıyor mu?
Şube filtresi uygulanıyorsa firma filtresinden sonra mı uygulanıyor?
Teknik personel finansal kartları görmeme kuralı bozulmuş mu?
```

---

## 8. SQL Denetim Scripti Oluştur

Yeni bir dosya oluştur:

```txt
db/tenant_audit_checks.sql
```

Bu dosya sadece kontrol sorguları içermeli. Veri değiştirmemeli.

İçeriğinde şu kontroller olmalı:

### 8.1 Firma ID boş kayıt kontrolü

```sql
SELECT 'customers' AS tablo, COUNT(*) AS bos_kayit FROM public.customers WHERE firma_id IS NULL
UNION ALL
SELECT 'devices', COUNT(*) FROM public.devices WHERE firma_id IS NULL
UNION ALL
SELECT 'service_forms', COUNT(*) FROM public.service_forms WHERE firma_id IS NULL
UNION ALL
SELECT 'invoices', COUNT(*) FROM public.invoices WHERE firma_id IS NULL
UNION ALL
SELECT 'invoice_items', COUNT(*) FROM public.invoice_items WHERE firma_id IS NULL
UNION ALL
SELECT 'payments', COUNT(*) FROM public.payments WHERE firma_id IS NULL
UNION ALL
SELECT 'teslimatlar', COUNT(*) FROM public.teslimatlar WHERE firma_id IS NULL
UNION ALL
SELECT 'teslimat_kalemleri', COUNT(*) FROM public.teslimat_kalemleri WHERE firma_id IS NULL
UNION ALL
SELECT 'teklifler', COUNT(*) FROM public.teklifler WHERE firma_id IS NULL
UNION ALL
SELECT 'teklif_kalemleri', COUNT(*) FROM public.teklif_kalemleri WHERE firma_id IS NULL
UNION ALL
SELECT 'teknik_raporlar', COUNT(*) FROM public.teknik_raporlar WHERE firma_id IS NULL
UNION ALL
SELECT 'musteri_talepleri', COUNT(*) FROM public.musteri_talepleri WHERE firma_id IS NULL
UNION ALL
SELECT 'is_planlari', COUNT(*) FROM public.is_planlari WHERE firma_id IS NULL
UNION ALL
SELECT 'planli_isler', COUNT(*) FROM public.planli_isler WHERE firma_id IS NULL
UNION ALL
SELECT 'brokers', COUNT(*) FROM public.brokers WHERE firma_id IS NULL
UNION ALL
SELECT 'araci_cari_hareketleri', COUNT(*) FROM public.araci_cari_hareketleri WHERE firma_id IS NULL;
```

Eğer bazı tablolar yoksa yorum satırı olarak bırakılabilir.

### 8.2 Şube-firma uyumsuzluğu kontrolü

```sql
SELECT 'customers' AS tablo, c.id, c.firma_id, c.sube_id, s.firma_id AS sube_firma_id
FROM public.customers c
JOIN public.subeler s ON s.id = c.sube_id
WHERE c.firma_id IS DISTINCT FROM s.firma_id;
```

Benzer kontroller şu tablolar için de eklenmeli:

```txt
invoices
teslimatlar
teklifler
service_forms
musteri_talepleri
is_planlari
```

### 8.3 Müşteri-firma uyumsuzluğu kontrolü

Örneğin cihazlar:

```sql
SELECT d.id, d.customer_id, d.firma_id, c.firma_id AS customer_firma_id
FROM public.devices d
JOIN public.customers c ON c.id = d.customer_id
WHERE d.firma_id IS DISTINCT FROM c.firma_id;
```

Benzer kontroller:

```txt
service_forms.customer_id
invoices.customer_id
teslimatlar.customer_id
teklifler.customer_id
```

---

## 9. RLS Policy Taslak Dosyası Hazırla, Ancak Çalıştırma

Yeni dosya oluştur:

```txt
db/tenant_rls_policy_draft.sql
```

Bu dosya **taslak** olacak. Başında çok net uyarı olacak:

```sql
-- DİKKAT:
-- Bu dosya taslaktır.
-- Bu sprintte Supabase üzerinde çalıştırılmayacak.
-- RLS aktif etmezden önce tenant_audit_checks.sql sonucu temiz olmalıdır.
```

Taslakta şu mantık hazırlanabilir:

```sql
-- ÖRNEK TASLAK
-- ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY customers_tenant_select
-- ON public.customers
-- FOR SELECT
-- USING (
--   firma_id = public.current_firma_id()
--   OR public.is_super_admin()
-- );
```

Ama bu dosyada hiçbir şey otomatik uygulanmamalı. Tüm policy satırları yorum satırı olarak kalabilir.

Kapsanacak tablolar:

```txt
customers
devices
service_forms
invoices
invoice_items
payments
teslimatlar
teslimat_kalemleri
teklifler
teklif_kalemleri
proforma_faturalar
teknik_raporlar
musteri_talepleri
is_planlari
planli_isler
brokers
araci_cari_hareketleri
```

---

## 10. NOT NULL Hazırlık Raporu

Bu sprintte `firma_id NOT NULL` yapılmayacak.

Ancak hangi tabloların hazır olduğu raporlanacak.

Rapor formatı:

```txt
Tablo adı
firma_id boş kayıt sayısı
İlişki uyumsuzluğu var mı?
Yeni kayıt akışında firma_id yazılıyor mu?
NOT NULL için hazır mı?
```

Örnek:

```txt
customers
bos_kayit: 0
ilişki uyumsuzluğu: yok
yeni kayıt testi: geçti
NOT NULL hazır: evet
```

Eğer emin olunamıyorsa:

```txt
NOT NULL hazır: hayır / tekrar test gerekli
```

---

## 11. Test Firması Görünürlük Testi Dokümantasyonu

Aşağıdaki test akışı dokümante edilecek:

```txt
1. Test Yangın Firması oluşturuldu.
2. EXOPANEL müşterisi geçici olarak test firmasına taşındı.
3. Normal Köklü admin kullanıcısında müşteri listesinde görünmedi.
4. Doğrudan URL erişimi güvenli şekilde engellendi.
5. EXOPANEL tekrar Köklü firmasına alındı.
```

Bu test sonucu yeni bir dosyaya yazılabilir:

```txt
db/tenant_visibility_test_report.md
```

İçerik:

```txt
Test edilen kayıt
Eski firma_id
Yeni geçici firma_id
Liste görünürlüğü sonucu
Detay URL sonucu
Geri alma sonucu
Son karar
```

---

## 12. Kodda Düzeltme Yapılacaksa Sınır

Bu görev esasen denetimdir. Ancak açıkça eksik tenant filtresi bulunursa küçük ve sınırlı düzeltme yapılabilir.

Düzeltme yapılabilecek alanlar:

```txt
Eksik .eq('firma_id', firmaId)
Eksik applyTenantScope
Eksik firma_id insert alanı
Eksik firma/şube/müşteri uyum kontrolü
```

Düzeltme yapılmayacak alanlar:

```txt
Modül iş mantığı
Hesaplama formülleri
Parser
PDF tasarım
UI redesign
RLS
NOT NULL
```

---

## 13. Kabul Kriterleri

* [ ] `tenant_audit_checks.sql` oluşturuldu.
* [ ] `tenant_rls_policy_draft.sql` oluşturuldu, ancak çalıştırılmadı.
* [ ] `tenant_visibility_test_report.md` oluşturuldu.
* [ ] Service role API route’ları tenant açısından denetlendi.
* [ ] Dashboard tenant filtresi denetlendi.
* [ ] Detay/PDF/yazdırma route’ları denetlendi.
* [ ] `firma_id IS NULL` kayıt kontrolü temiz.
* [ ] Şube-firma uyumsuzluk kontrolü temiz veya raporlandı.
* [ ] Müşteri-firma uyumsuzluk kontrolü temiz veya raporlandı.
* [ ] NOT NULL hazırlık raporu çıkarıldı.
* [ ] RLS için hangi tablolar hazır, hangileri beklemeli raporlandı.
* [ ] TypeScript geçti.
* [ ] Build geçti.
* [ ] RLS aktif edilmedi.
* [ ] NOT NULL yapılmadı.

---

## 14. Testler

Çalıştır:

```bash
npx tsc --noEmit
npm run build
```

Ayrıca localhost’ta hızlı kontrol:

```txt
/customers
/customers/[id]
/service-forms
/service-forms/[id]
/teslimatlar
/fiyat-teklifleri
/cari-hesap
/teknik-raporlar
/operasyon
/araclar
/dashboard
```

Her sayfada:

```txt
Liste geliyor mu?
Detay açılıyor mu?
Console hatası var mı?
Tenant filtresi nedeniyle yanlış boş ekran var mı?
```

---

## 15. Görev Sonu Raporu

İş bitince şunları yaz:

```txt
Tenant audit sonucunda hangi dosyalar incelendi?
Eksik tenant filtresi bulundu mu?
Bulunduysa hangi dosyalarda düzeltildi?
Service role kullanılan route’larda güvenlik durumu nedir?
Dashboard tenant filtresi durumu nedir?
PDF/yazdırma route’ları güvenli mi?
tenant_audit_checks.sql sonucu nedir?
tenant_rls_policy_draft.sql oluşturuldu mu?
RLS bu sprintte aktif edildi mi? Cevap hayır olmalı.
NOT NULL bu sprintte yapıldı mı? Cevap hayır olmalı.
Hangi tablolar RLS için hazır görünüyor?
Hangi tablolar ek test istiyor?
TypeScript sonucu
Build sonucu
```
