Ekrandaki hata şunu gösteriyor:

```text
[teknik-raporlar][save] kayıt başarısız {}
```

Ama hata objesi `{}` olarak loglanmış. Bu da gerçek hatanın yakalanmadığını gösteriyor. Yani şu an asıl sorun sadece kayıt hatası değil; **kayıt hatasının sebebi de görünmüyor.** Önce hata yakalama ve loglama düzeltilmeli, sonra kayıt payload / Supabase insert/update tarafı kontrol edilmeli.

Aşağıdaki görev dosyasını Claude Code’a verelim.

````md
# GÖREV — Teknik Rapor Kaydetme Hatası: Havalandırma Test Raporu Kayıt Başarısız `{}` Düzeltmesi

## Sorun

Havalandırma Test Raporu kaydedilirken Next.js runtime ekranında şu hata oluşuyor:

```txt
[teknik-raporlar][save] kayıt başarısız {}
````

Hata yeri:

```txt
src/app/(dashboard)/teknik-raporlar/_components/TechnicalReportForm.tsx
onSubmit
yaklaşık satır: 522
```

Kod parçasında catch bloğu şu şekilde görünüyor:

```ts
catch (error) {
  console.error('[teknik-raporlar][save] kayıt başarısız', {
    error,
    message: error instanceof Error ? error.message : String(error),
    reportType,
  })
}
```

Ancak logda hata `{}` olarak geliyor. Bu yüzden gerçek hata sebebi anlaşılmıyor.

Bu görevde amaç:

1. Teknik rapor kaydetme hatasını gerçek sebebiyle görünür hale getirmek.
2. Havalandırma Test Raporu kaydının neden başarısız olduğunu bulmak.
3. `ventilation_test` rapor tipinin `technical_reports` kayıt mimarisiyle uyumlu kaydedilmesini sağlamak.
4. Eksik kolon / yanlış payload / yanlış status / yanlış route / yanlış Supabase response problemlerini düzeltmek.
5. Kaydet, Kaydet ve Yazdır, PDF/Detay yönlendirme akışlarını çalışır hale getirmek.

---

## 1. Önce Hata Loglama Düzeltilecek

Mevcut catch bloğu gerçek Supabase hatasını göstermiyor.

`TechnicalReportForm.tsx` içinde `onSubmit` fonksiyonunda catch şu hale getirilsin:

```ts
function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }

  if (typeof error === 'object' && error !== null) {
    return JSON.parse(JSON.stringify(error, Object.getOwnPropertyNames(error)))
  }

  return {
    message: String(error),
  }
}
```

Sonra catch:

```ts
catch (error) {
  console.error('[teknik-raporlar][save] kayıt başarısız', {
    error: serializeError(error),
    reportType,
    submitIntent,
    values,
    inputData,
    resultData,
  })

  setSubmitError(
    error instanceof Error
      ? error.message
      : 'Teknik rapor kaydedilemedi. Konsol detaylarını kontrol edin.'
  )
}
```

Ama dikkat: `values`, `inputData`, `resultData` çok büyükse sadece geliştirme ortamında loglansın.

```ts
if (process.env.NODE_ENV === 'development') {
  console.error(...)
}
```

---

## 2. Supabase Hatası Throw Edilmeli

Eğer kayıt fonksiyonunda şu yapı varsa:

```ts
const { data, error } = await supabase
  .from('technical_reports')
  .insert(payload)

if (error) {
  throw error
}
```

Supabase error objesi bazen düz `{}` gibi görünebilir. Bu yüzden özel hata üret:

```ts
if (error) {
  throw new Error(
    `[technical_reports_insert_failed] ${error.message || 'Bilinmeyen Supabase hatası'} | code=${error.code || '-'} | details=${error.details || '-'} | hint=${error.hint || '-'}`
  )
}
```

Update için de aynı mantık uygulanmalı.

---

## 3. Kaydetme Fonksiyonu Bulunacak

Şu dosyaları kontrol et:

```txt
src/app/(dashboard)/teknik-raporlar/_components/TechnicalReportForm.tsx
src/lib/technical-reports/actions.ts
src/lib/technical-reports/technical-reports.ts
src/app/api/technical-reports/route.ts
src/app/(dashboard)/teknik-raporlar/actions.ts
```

Gerçek kayıt nerede yapılıyorsa orada Supabase insert/update response açıkça kontrol edilmeli.

---

## 4. `ventilation_test` Payload Kontrolü

Havalandırma Test Raporu kaydedilirken payload şu yapıya uygun olmalı:

```ts
const payload = {
  report_type: 'ventilation_test',
  title: values.title || 'Havalandırma Test Raporu',
  report_date: values.report_date,
  customer_id: values.customer_id || null,
  manual_customer_name: values.manual_customer_name || values.customer_name || null,
  sube_id: values.sube_id || values.branch_id || null,
  status: values.status || 'calculated',
  input_data: inputData,
  result_data: resultData,
  notes: values.notes || null,
}
```

Aşağıdaki hatalar kontrol edilsin:

* `sube_id` boş mu?
* `report_type` boş mu?
* `title` boş mu?
* `report_date` geçerli mi?
* `input_data` JSON serialize edilebilir mi?
* `result_data` JSON serialize edilebilir mi?
* `customer_id` geçersiz string mi?
* `manual_customer_name` yoksa müşteri zorunluluğu hata veriyor mu?
* `status` DB constraint ile uyumlu mu?

---

## 5. JSON Serialize Kontrolü

`input_data` ve `result_data` içinde şunlar olmamalı:

* `undefined`
* `NaN`
* `Infinity`
* function
* class instance
* File object
* DOM object

Kaydetmeden önce temizleme helper’ı ekle:

```ts
export function sanitizeJsonForDb<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, val) => {
      if (typeof val === 'number' && !Number.isFinite(val)) return null
      if (typeof val === 'undefined') return null
      return val
    })
  )
}
```

Kullanım:

```ts
const safeInputData = sanitizeJsonForDb(inputData)
const safeResultData = sanitizeJsonForDb(resultData)
```

Payload içinde bunlar kullanılmalı.

---

## 6. Schema Kontrolü

Supabase `technical_reports` tablosunda şu kolonlar var mı kontrol et:

```txt
id
report_no
report_type
title
customer_id
manual_customer_name
sube_id
report_date
status
input_data
result_data
notes
created_by
created_at
updated_at
deleted_at
```

Eksik kolon varsa idempotent migration ekle:

```sql
ALTER TABLE public.technical_reports
ADD COLUMN IF NOT EXISTS report_type text;

ALTER TABLE public.technical_reports
ADD COLUMN IF NOT EXISTS title text;

ALTER TABLE public.technical_reports
ADD COLUMN IF NOT EXISTS customer_id uuid;

ALTER TABLE public.technical_reports
ADD COLUMN IF NOT EXISTS manual_customer_name text;

ALTER TABLE public.technical_reports
ADD COLUMN IF NOT EXISTS sube_id uuid;

ALTER TABLE public.technical_reports
ADD COLUMN IF NOT EXISTS report_date date;

ALTER TABLE public.technical_reports
ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft';

ALTER TABLE public.technical_reports
ADD COLUMN IF NOT EXISTS input_data jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.technical_reports
ADD COLUMN IF NOT EXISTS result_data jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.technical_reports
ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.technical_reports
ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
```

Ancak mevcut kolon adları farklıysa yeni kolon eklemeden önce mevcut mimariye uyum sağla. Örneğin `branch_id` kullanılıyorsa `sube_id` ile çakışma yaratma.

---

## 7. Rapor Tipi Constraint Kontrolü

DB’de `report_type` için check constraint varsa `ventilation_test` kabul edilmiyor olabilir.

Kontrol et:

```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.technical_reports'::regclass;
```

Eğer constraint içinde sadece eski rapor tipleri varsa `ventilation_test` eklenmeli.

Örnek:

```sql
ALTER TABLE public.technical_reports
DROP CONSTRAINT IF EXISTS technical_reports_report_type_check;
```

Sonra mevcut tüm tipleri kapsayacak şekilde yeniden ekle veya constraint kaldırılmışsa uygulama tarafında validate et.

Rapor tipleri şunları içermeli:

```txt
fire_alarm_need
general_need
room_integrity_test
fire_cabinet_pump
water_system
ventilation_test
```

Gerçek projedeki mevcut değerler korunmalı.

---

## 8. Status Constraint Kontrolü

DB’de `status` için constraint varsa `calculated` kabul edilmiyor olabilir.

Mevcut sistemde kullanılan status değerlerini kontrol et:

```sql
SELECT DISTINCT status FROM public.technical_reports;
```

Eğer constraint varsa şu değerler desteklenmeli:

```txt
draft
calculated
approved
cancelled
archived
```

veya mevcut sistemde ne kullanılıyorsa ona uy.

Havalandırma kaydında bilinmeyen status gönderme.

En güvenli varsayılan:

```ts
status: 'calculated'
```

Eğer DB bunu kabul etmiyorsa:

```ts
status: 'draft'
```

veya mevcut teknik raporların kullandığı status kullanılmalı.

---

## 9. Şube Yetkisi / Şube Boşluğu Kontrolü

Kaydetmeden önce şu kontrol yapılmalı:

```ts
if (!values.sube_id && !values.branch_id) {
  throw new Error('Şube seçilmeden teknik rapor kaydedilemez.')
}
```

Tek şubeli kullanıcıda şube otomatik atanmalı.

Admin için şube seçimi zorunlu olmalı.

---

## 10. Müşteri / Manuel Müşteri Kontrolü

Havalandırma testi çoğu zaman sistemde kayıtlı olmayan firmaya yapılabilir.

Bu nedenle kayıtlı müşteri zorunlu olmamalı.

Şu kurallardan biri yeterli olmalı:

* `customer_id` var
* `manual_customer_name` var
* `customer_name` var

Kaydetmeden önce:

```ts
const hasCustomer =
  Boolean(values.customer_id) ||
  Boolean(values.manual_customer_name?.trim()) ||
  Boolean(values.customer_name?.trim())

if (!hasCustomer) {
  throw new Error('Firma / kurum adı girilmeden rapor kaydedilemez.')
}
```

---

## 11. Havalandırma Giriş / Çıkış Kesit Ayrımı Kayda Dahil Edilmeli

Önceki görevde belirtilen yeni yapı kayıt payload’ına dahil edilmeli.

`input_data` içinde şu yapı olmalı:

```ts
input_data: {
  reportType: 'ventilation_test',
  customer: {...},
  technician: {...},
  testInfo: {...},
  inletSection: {
    sectionType,
    unit,
    diameter,
    width,
    height,
    manualArea,
    calculatedArea,
  },
  outletSection: {
    sectionType,
    unit,
    diameter,
    width,
    height,
    manualArea,
    calculatedArea,
  },
  ductInfo: {
    ductLength,
    elbowCount,
  },
  inletMeasurements: {
    top,
    bottom,
    left,
    right,
    center,
  },
  outletMeasurements: {
    top,
    bottom,
    left,
    right,
    center,
  },
  outletMeasurementUnavailable,
  useVirtualOutlet,
  notes,
}
```

`result_data` içinde:

```ts
result_data: {
  inletAverageVelocity,
  outletAverageVelocity,
  inletArea,
  outletArea,
  inletFlowM3s,
  inletFlowM3h,
  outletFlowM3s,
  outletFlowM3h,
  flowComparison,
  suitability,
  warnings,
  recommendations,
  evaluationText,
}
```

---

## 12. Insert Sonrası ID Alınmalı

Kaydetme sonrası yönlendirme için DB’den gerçek ID alınmalı.

Yanlış:

```ts
await supabase.from('technical_reports').insert(payload)
router.push(`/teknik-raporlar/${payload.id}`)
```

Doğru:

```ts
const { data, error } = await supabase
  .from('technical_reports')
  .insert(payload)
  .select('id')
  .single()

if (error) {
  throw new Error(`[technical_reports_insert_failed] ${error.message}`)
}

if (!data?.id) {
  throw new Error('Teknik rapor kaydedildi ancak kayıt ID bilgisi alınamadı.')
}

router.push(
  submitIntent === 'print'
    ? `/teknik-raporlar/${data.id}/yazdir`
    : `/teknik-raporlar/${data.id}`
)
```

---

## 13. Kaydet ve Yazdır Akışı

Ekranda `Kaydet ve Yazdır` butonu var.

Bu buton:

1. Raporu kaydetmeli.
2. ID almalı.
3. Yazdır sayfasına yönlendirmeli.

Route:

```txt
/teknik-raporlar/[id]/yazdir
```

Eğer bu route yoksa oluşturulmalı veya mevcut yazdır route’una yönlendirilmeli.

---

## 14. Kullanıcıya Hata Mesajı Göster

Şu an sadece `Kayıt tamamlanamadı` yazıyor. Daha açıklayıcı olmalı.

Örnek:

```txt
Kayıt tamamlanamadı: Şube seçilmeden teknik rapor kaydedilemez.
```

veya:

```txt
Kayıt tamamlanamadı: technical_reports tablosunda input_data kolonu bulunamadı.
```

Production ortamında teknik mesaj kısaltılabilir ama development ortamında net gösterilmeli.

---

## 15. Kabul Kriterleri

* [ ] Kayıt hatası `{}` olarak görünmüyor.
* [ ] Gerçek Supabase hata mesajı console’da görünüyor.
* [ ] Kullanıcıya anlaşılır hata mesajı veriliyor.
* [ ] Havalandırma Test Raporu kaydedilebiliyor.
* [ ] Kaydet sonrası rapor detayına gidiyor.
* [ ] Kaydet ve Yazdır sonrası yazdır sayfasına gidiyor.
* [ ] `input_data` ve `result_data` JSON olarak kaydediliyor.
* [ ] `ventilation_test` report_type DB tarafından kabul ediliyor.
* [ ] Şube boşsa kullanıcıya net hata veriliyor.
* [ ] Manuel müşteriyle rapor kaydedilebiliyor.
* [ ] Kayıtlı müşteriyle rapor kaydedilebiliyor.
* [ ] TypeScript geçiyor.
* [ ] Build geçiyor.

---

## 16. Test Senaryosu

1. Havalandırma Test Raporu aç.
2. Manuel firma adı gir.
3. Şube seç.
4. Tekniker adı gir.
5. Giriş kesiti ve çıkış kesiti gir.
6. En az 3 giriş ölçümü gir.
7. Hesapla.
8. Kaydet.

Beklenen:

* Kayıt başarılı.
* Rapor arşivinde görünür.
* Detay sayfası açılır.

İkinci test:

1. Aynı formda Kaydet ve Yazdır’a bas.

Beklenen:

* Rapor kaydedilir.
* Yazdır sayfası açılır.

---

## 17. Görev Sonu Raporu

İş bitince şunları yaz:

* Kayıt hatasının gerçek sebebi neydi?
* Hata `{}` olarak neden görünüyordu?
* Hangi dosyada loglama düzeltildi?
* Supabase insert/update nerede düzeltildi?
* Payload hangi yapıya getirildi?
* Migration gerekti mi?
* `ventilation_test` report_type kabul edildi mi?
* Kaydet ve Yazdır çalışıyor mu?
* TypeScript sonucu
* Build sonucu

````

Kısa Claude prompt’u:

```text
GOREV.md dosyasını oku ve sadece bu görevi uygula.

Sorun:
Havalandırma Test Raporu kaydederken Next.js console error oluşuyor:
[teknik-raporlar][save] kayıt başarısız {}

Hata TechnicalReportForm.tsx onSubmit içinde, yaklaşık satır 522.

Öncelik:
1. Catch bloğu gerçek hatayı gösterecek şekilde düzelt. Hata {} görünmesin.
2. Supabase insert/update error objesini message/code/details/hint ile Error olarak throw et.
3. technical_reports payload’ını kontrol et.
4. ventilation_test report_type DB tarafından kabul ediliyor mu kontrol et.
5. input_data/result_data JSON serialize edilebilir mi kontrol et; NaN/undefined temizle.
6. Şube, manuel müşteri, report_date, title gibi zorunlu alanları net validate et.
7. Kaydet ve Kaydet-Yazdır akışında insert sonrası .select('id').single() ile gerçek ID al.
8. Kayıt başarılı olunca detay/yazdır route’una yönlendir.
9. Gerekirse idempotent migration ekle.
10. TypeScript ve build kontrolü yap.

Dokunma:
Fatura parser, cari hesap, operasyon, teslimatlar ve diğer teknik hesap modülleri.
````

Bu görevde Claude’un ilk yapması gereken şey **hata logunu `{}` olmaktan çıkarmak**. Çünkü şu an gerçek sebep görünmüyor; muhtemelen `report_type` constraint, `input_data/result_data` kolon eksikliği, `sube_id` boşluğu veya `NaN` içeren JSON payload yüzünden Supabase insert patlıyor.
