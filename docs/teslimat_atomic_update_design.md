# Teslimat Atomik Güncelleme — Domain Davranış Haritası ve Tasarım

> Tarih: 2026-08-01 · Branch: `fix/aggregate-data-loss-and-invoice-parse`
> Kapsam: `src/lib/teslimatlar.ts`, `src/app/(dashboard)/teslimatlar/**`, `db/teslimatlar_migration.sql`, `db/tenant_migration.sql`, `db/fabrika_migration.sql`
> Bu belge **kod ve şema okunarak** üretilmiştir. Hiçbir uzak veritabanında sorgu çalıştırılmamıştır.
> Staging gate durumu: **NO-GO** (`node scripts/verify-staging-env.mjs` → exit 1, production hint).

---

## 0. Neden bu belge önce yazıldı

`updateTeslimat` yalnızca "üst kayıt + kalem" güncellemesi değildir: aynı fonksiyon
stok bakiyesini, depo hareketlerini, emanet takiplerini, geri teslim takiplerini,
durum geçmişini ve ön kayıtları da değiştirir. Bu yan etkileri **tahmin ederek**
SQL'e taşımak, GOREV.md §3'te açıkça yasaklanmıştır. Aşağıdaki haritanın her satırı
dosya + satır kanıtına dayanır.

---

## 1. Invariant haritası

| Konu | Mevcut kaynak | Beklenen invariant | Kanıt |
|---|---|---|---|
| Teslimat üst kaydı | `teslimatlar` tablosu; `updateTeslimat` tek `update` çağrısı | `id` sabit; `teslimat_no` **asla** değişmez; `updated_at` her yazmada tazelenir | `teslimatlar.ts:724-742`; `db/teslimatlar_migration.sql:6-24` |
| Teslimat kalemleri | `teslimat_kalemleri`; şu an **tamamı silinip yeniden eklenir** | Kalem kimliği (`id`) güncelleme boyunca korunmalı; kalem yalnızca açık niyetle silinmeli | `teslimatlar.ts:721-722, 744-748`; `db/teslimatlar_migration.sql:36-68` |
| Yeni cihaz stok düşümü | `adjustUrunStok` → `urun_stok.stok_adedi -= miktar` + `depo_hareketleri('cikis')` | Yalnızca `urun_id != null && stoktan_duser_mi && miktar > 0` **ve** `durum = 'tamamlandi'` iken uygulanır | `teslimatlar.ts:193-227, 449-457`; `db/fabrika_migration.sql:121` |
| Dolum/bakım kalemi etkisi | `dolumlu_teslim` → `reduceGeriTeslimTakipleri`; `dolum_icin_alindi`/`bakim_icin_alindi`/`yenileme_icin_alindi` → `createGeriTeslimTakipIfNeeded` | Bu tipler stok **düşürmez** (`STOKTAN_DUSEN_TIPLER` içinde değiller), yalnızca takip üretir/kapatır | `teslimatlar.ts:40-45, 68-72, 461-466` |
| Emanet cihaz oluşturma/silme | `createEmanetTakipIfNeeded`; koşul `hareket_tipi = 'emanet_teslim' OR emanet_mi` | Kalem başına **en fazla bir** açık emanet kaydı; doğal anahtar `kalem_id` | `teslimatlar.ts:320-346, 458-460` |
| Geri teslim takibi | `createGeriTeslimTakipIfNeeded`; koşul `GERI_TESLIM_GEREKTIREN_TIPLER` veya (`geri_alinmasi_gerekir_mi` ve tip ≠ `emanet_teslim`) | Kalem başına en fazla bir kayıt; doğal anahtar `kalem_id` | `teslimatlar.ts:348-369, 461-463` |
| Durum değişiklikleri | `teslimat_durum_gecmisi`; yalnızca `mevcut.durum !== input.durum` iken satır yazılır | Durum değişmediyse geçmiş satırı yazılmaz (gürültü önleme) | `teslimatlar.ts:750-758` |
| Şube/firma sahipliği | `teslimatlar.firma_id`, `teslimat_kalemleri.firma_id` (tenant migration ile eklenmiş, **nullable**) | Üst kayıt ve kalem aynı firmaya ait olmalı; `sube_id` opsiyonel | `db/tenant_migration.sql:94-160` (satır 103-104) |
| Stok hareket/audit kaydı | `depo_hareketleri` (`cikis` / `giris`), `referans_no = teslimat_no` | Her stok değişimi bir hareket satırı üretir | `teslimatlar.ts:217-226, 253-261` |
| İptal/tamamlandı geçişi | `durum` CHECK: `taslak, sevkte, tamamlandi, iptal`; yan etkiler yalnızca `tamamlandi` | `taslak`/`sevkte`/`iptal` durumunda **hiçbir** stok/emanet/geri teslim etkisi yok | `db/teslimatlar_migration.sql:14-15`; `teslimatlar.ts:450, 511` |

---

## 2. Sekiz zorunlu sorunun kanıtlı yanıtı

### 1) Eski teslimatın stok etkisi nasıl hesaplanıyor ve tersine çevriliyor?

`reverseExistingStock` (`teslimatlar.ts:633-648`) teslimatın **mevcut** kalemlerini
okur ve `urun_id && stoktan_duser_mi && miktar > 0` olan her kalem için
`reverseUrunStok` çağırır (`stok_adedi += miktar`, `depo_hareketleri('giris')`).

> 🔴 **Kanıtlanmış hata (T1).** `reverseExistingStock`, teslimatın **eski durumuna
> bakmaz**. Stok düşümü ise yalnızca `durum = 'tamamlandi'` iken uygulanmıştı
> (`teslimatlar.ts:450`). Dolayısıyla `taslak → taslak` veya `sevkte → sevkte`
> bir düzenlemede hiç yapılmamış bir düşüm geri alınır ve **stok şişer**.
> Her kaydetme, kalem başına `+miktar` kalıcı hata üretir.
>
> Bu, GOREV.md §3'teki *"Mevcut `reverseExistingStock` davranışını doğrulamadan
> SQL'e bire bir kopyalama"* yasağının tam olarak işaret ettiği durumdur. RPC bu
> davranışı **kopyalamaz**; §4'teki delta modelini uygular.

### 2) Yeni teslimatın stok etkisi nerede uygulanıyor?

`applyKalemSideEffects` (`teslimatlar.ts:449-471`), yalnızca `input.durum === 'tamamlandi'`
iken. Aynı fonksiyon `createTeslimat` (satır 692), `updateTeslimat` (satır 760) ve
`syncTeslimatSideEffects` (satır 503) tarafından çağrılır — yani **aynı yan etki üç
ayrı giriş noktasından** uygulanabilir.

> 🔴 **Kanıtlanmış hata (T2).** `updateTeslimatDurumAction`, durum `tamamlandi`
> olduğunda `syncTeslimatSideEffects` çağırır (`actions.ts:181-183`). Stok düşümünün
> hiçbir idempotency koruması yoktur (emanet/geri teslimde `kalem_id` guard'ı vardır,
> stokta yoktur). `tamamlandi → sevkte → tamamlandi` geçişi stoku **ikinci kez** düşürür.

### 3) Emanet ve geri teslim kayıtlarının doğal/benzersiz anahtarları neler?

Her ikisinde de **`kalem_id`**:
- `emanet_takipleri`: `select id ... eq('kalem_id', kalem.id)` (`teslimatlar.ts:325-331`)
- `geri_teslim_takipleri`: aynı desen (`teslimatlar.ts:353-356`)

> 🔴 **Kanıtlanmış hata (T3).** Bu doğal anahtar **veritabanında zorlanmıyor**.
> `db/teslimatlar_migration.sql:80-108` içinde `kalem_id` üzerinde UNIQUE kısıt yok;
> yalnızca "önce oku, yoksa yaz" (check-then-insert) uygulanıyor. İki eşzamanlı istek
> aynı kalem için iki emanet kaydı üretebilir. RPC migration'ı bu kısıtı ekler.

### 4) Aynı kaydetme iki kez gelirse hangi kayıtlar mükerrer olabilir?

| Kayıt | Mükerrer olur mu? | Neden |
|---|---|---|
| `teslimat_kalemleri` | Hayır ama **kimlik değişir** | Her seferinde silinip yeni UUID ile eklenir (`teslimatlar.ts:721, 744`) |
| `urun_stok` | Hayır (net sıfır) | reverse(+) ve apply(−) çiftlenir — *eski durum `tamamlandi` ise* |
| `depo_hareketleri` | **Evet** | Her çağrıda yeni `giris` + `cikis` satırı; audit kirlenir |
| `emanet_takipleri` | Hayır ama **id değişir** | `teslimat_id` ile silinip yeniden yaratılır (`teslimatlar.ts:717`) |
| `geri_teslim_takipleri` | Hayır ama **id değişir** | Aynı (`teslimatlar.ts:719`) |
| `on_kayitlar` | **Evet (riskli)** | `updateTeslimat` eski ön kayıtları silmez; `on_kayit_olusturuldu = false` yapıp yeniden üretir (`teslimatlar.ts:736, 762`). Dedup yalnızca `notlar` içindeki `Teslimat kalemi: {id}` marker'ına ve tam `aciklama` eşleşmesine dayanır (`teslimatlar.ts:518-533`); kalem id'leri her güncellemede değiştiği için marker eşleşmesi **kaybolur** |
| `teslimat_durum_gecmisi` | Hayır | Yalnızca durum gerçekten değiştiyse yazılır |

### 5) Durum değişiklikleri stok etkisini değiştiriyor mu?

Evet, ve tek belirleyici odur: `applyKalemSideEffects` ilk satırı
`if (input.durum !== 'tamamlandi') return` (`teslimatlar.ts:450`).
`createOnKayitlarForTeslimat` de aynı koşulu taşır (satır 511).
`iptal` durumu form tarafından hiç gönderilemez (`normalizeTeslimatInput:968` yalnızca
`taslak|sevkte|tamamlandi` üretir); `iptal`'e yalnızca `updateTeslimatDurumAction` ve
`softDeleteTeslimat` geçirir.

**Efektif stok etkisi tablosu** (kaynak: satır 450 + 633-648):

| Eski durum | Yeni durum | Doğru net etki | Mevcut kodun ürettiği etki |
|---|---|---|---|
| `taslak` | `taslak` | 0 | **+miktar** 🔴 (T1) |
| `taslak` | `tamamlandi` | −miktar | 0 🔴 (reverse + apply birbirini götürür) |
| `tamamlandi` | `tamamlandi` | −Δ (fark) | −Δ ✅ |
| `tamamlandi` | `taslak` | +miktar | +miktar ✅ |
| `sevkte` | `sevkte` | 0 | **+miktar** 🔴 (T1) |

### 6) `firma_id` ve `sube_id` hangi tablolarda zorunlu?

**Hiçbirinde `NOT NULL` değil.** `db/tenant_migration.sql:1-3` bunu bilinçli olarak
belirtiyor. Kolonun *var olduğu* tablolar (tenant listesi, satır 94-138):
`teslimatlar`, `teslimat_kalemleri`, `depo_hareketleri`, `on_kayitlar`, `customers`,
`urunler`.

> 🔴 **Kanıtlanmış şema drift'i (T4).** `emanet_takipleri`, `geri_teslim_takipleri`,
> `teslimat_durum_gecmisi` ve `urun_stok` tenant listesinde **yok** — yani repodaki
> migration zincirinden kurulan bir veritabanında bu tablolarda `firma_id` kolonu
> **oluşmaz**. Buna rağmen uygulama kodu `firma_id` yazmaya çalışıyor:
> `teslimatlar.ts:343` (emanet) ve `teslimatlar.ts:366` (geri teslim).
> Temiz bir şemada bu iki insert PostgREST `PGRST204` ile başarısız olur.
> ⇒ Bu kolonlar `db/teslimat_atomic_update_rpc.sql` içinde ekleniyor.

> 🟠 **Kanıtlanmış tenant boşluğu (T5).** `depo_hareketleri` tenant listesinde
> **vardır** (satır 125) ama `adjustUrunStok`/`reverseUrunStok` `firma_id` yazmaz
> (`teslimatlar.ts:217-226, 253-261`) ⇒ `firma_id IS NULL` audit satırları birikir.
> RPC bu alanı doğrulanmış firma ile doldurur.

`sube_id` her yerde nullable ve `subeler(id) ON DELETE SET NULL` FK'sine bağlı.

### 7) Kalem kimliği başka teslimata aitse mevcut kod ne yapıyor?

**Soru mevcut kodda anlamsız: kalem kimliği hiç gönderilmiyor.**
`src/app/(dashboard)/teslimatlar/[id]/duzenle/page.tsx:51-66` kalemleri istemciye
taşırken `k.id` alanını **atıyor**; `TeslimatForm`'un `KalemState` tipinde
(`TeslimatForm.tsx:19-36`) `id` alanı yok. Bu, denetim raporundaki teklif/proforma
"kimlik kaybı" kök nedeninin (§2.1 ikincil kök neden) birebir aynısıdır ve
delete-then-insert'i bir **tasarım zorunluluğu** haline getirmiştir.

⇒ Faz C'de `duzenle/page.tsx` `id` değerini `dbId` olarak taşır, `TeslimatForm` bunu
payload'a koyar, RPC yabancı kimliği `TESLIMAT_LINE_NOT_IN_PARENT` ile reddeder.

### 8) Hangi tablolar row lock gerektiriyor?

| Tablo | Kilit | Neden |
|---|---|---|
| `teslimatlar` | `SELECT ... FOR UPDATE` (üst kayıt) | Lost update ve eşzamanlı çift kaydetme |
| `urun_stok` | `SELECT ... FOR UPDATE` (etkilenen `urun_id` başına) | `stok_adedi` read-modify-write; kilitsiz ise klasik kayıp güncelleme |
| `emanet_takipleri` | `FOR UPDATE` (FIFO kapatılan satırlar) | `reduceEmanetTakipleri` aç/kapat yarışı |
| `geri_teslim_takipleri` | `FOR UPDATE` (FIFO kapatılan satırlar) | `reduceGeriTeslimTakipleri` aynı sebep |
| `teslimat_kalemleri` | Ayrı kilit gerekmez | Üst kayıt kilidi altında ve `teslimat_id` ile kapsanmış |
| `depo_hareketleri`, `teslimat_durum_gecmisi` | Gerekmez | Yalnızca append |

---

## 3. Aynı yan etkinin birden fazla uygulandığı yerler

| Yan etki | Uygulandığı yerler | Sonuç |
|---|---|---|
| Stok düşümü | `createTeslimat:692`, `updateTeslimat:760`, `syncTeslimatSideEffects:503` | Üç giriş noktası, tek guard (`durum='tamamlandi'`), idempotency yok ⇒ T2 |
| Stok geri alma | Yalnızca `updateTeslimat:715` | `deleteTeslimat` stok **geri almaz** — fiziksel silme stok etkisini bırakır (`physicallyDeleteTeslimat:853-875`) 🟠 |
| Emanet oluşturma | `applyKalemSideEffects:458` (3 çağıran üzerinden) | `kalem_id` guard'ı var, DB kısıtı yok ⇒ T3 |
| Emanet kapatma | `reduceEmanetTakipleri:410`, `emanetGeriAlAction:221` | İki farklı yol; ikincisi tenant kontrolü yapmıyor 🟠 |
| Geri teslim kapatma | `reduceGeriTeslimTakipleri:371`, `geriTeslimYapAction:192` | Aynı 🟠 |
| Ön kayıt üretimi | `createOnKayitlarForTeslimat:510`, `createOnKayitFromTeslimatKalem:555` | İki farklı dedup stratejisi |

**Bu sprintin kapsamı:** yalnızca `updateTeslimat` yolu atomik hale getirilir.
Yukarıdaki 🟠 işaretli diğer giriş noktaları **bu görevde değiştirilmemiştir** ve
§7'de kalan risk olarak raporlanmıştır — çünkü her biri kendi domain kararını
gerektirir ve GOREV.md §3 tahmin etmeyi yasaklar.

---

## 4. Seçilen stok yaklaşımı: **net delta**

GOREV.md §7 iki güvenli yaklaşım sunuyor. Seçim: **eski/yeni kalemlerden net stok
farkı hesaplayıp delta uygulamak.**

### Neden delta

1. **T1'i yapısal olarak çözer.** "Reverse-then-apply" modeli, eski durumun stok
   etkisini *varsayar*. Delta modeli hem eski hem yeni tarafı `durum='tamamlandi'`
   filtresinden geçirdiği için `taslak → taslak` düzenlemesi otomatik olarak `0`
   delta üretir. Reverse-then-apply'ı kopyalamak T1'i SQL'e taşımak olurdu.
2. **Audit gürültüsünü azaltır.** Reverse+apply her kaydetmede 2N `depo_hareketleri`
   satırı yazar; delta yalnızca gerçekten değişen ürün için 1 satır yazar.
3. **Daha az kilit.** Yalnızca deltası sıfır olmayan `urun_id`'ler kilitlenir.

### Formül

```
etki(kalemler, durum) =
    durum = 'tamamlandi'
      ? Σ { miktar | urun_id IS NOT NULL AND stoktan_duser_mi AND miktar > 0 }  (urun_id başına)
      : {}                                                   -- boş: hiçbir etki yok

delta(urun_id) = etki(yeni_kalemler, yeni_durum) − etki(eski_kalemler, eski_durum)

urun_stok.stok_adedi -= delta(urun_id)      -- delta > 0 ⇒ düşüm, delta < 0 ⇒ iade
```

`Σ` toplaması **aynı ürünün birden çok kalemde bulunması** durumunu doğal olarak
çözer (GOREV.md §7 zorunlu test maddesi): iki satırda 3 + 2 adet aynı ürün varsa tek
delta `5` üretilir ve tek `depo_hareketleri` satırı yazılır.

### Eşdeğerlik kanıtı

Eski durum ve yeni durum **ikisi de** `tamamlandi` iken:

```
delta = Σyeni − Σeski
reverse-then-apply = (+Σeski) sonra (−Σyeni)  ⇒  net −(Σyeni − Σeski) = −delta   ✅ aynı
```

Yani mevcut kodun **doğru çalıştığı tek senaryoda** delta modeli birebir aynı sonucu
verir. Farklı olduğu senaryolar tam olarak §2.5 tablosundaki 🔴 satırlardır — yani
delta modeli yalnızca hataları düzeltir, doğru davranışı değiştirmez.
Bu eşdeğerlik `tests/teslimat-stock-delta.test.ts` içinde tablo halinde test edilir.

### Negatif stok

`urun_stok.stok_adedi` şemada `CHECK (stok_adedi >= 0)` **taşımıyor**
(`db/fabrika_migration.sql:121-127`) ve mevcut kod negatif stoka izin veriyor
(`adjustUrunStok:202` sonucu doğrulamıyor). RPC bu davranışı **korur** — negatif
stok bloklanmaz, çünkü bunu bloklamak mevcut iş akışını (stok kaydı olmayan ürünle
teslimat) kırardı. Bu bilinçli bir karardır ve RPC dönüş özetinde
`negative_stock_products` alanıyla **raporlanır**; kullanıcı kararı §7'ye taşındı.

---

## 5. Emanet / geri teslim yaklaşımı

**Kimlik bazlı upsert — silip yeniden yaratma yok.**

Doğal anahtar `kalem_id` olduğu (§2.3) ve kalem kimlikleri artık korunduğu (Faz C)
için, mevcut `delete by teslimat_id` + yeniden yaratma adımı tamamen kaldırılır:

| Durum | RPC davranışı |
|---|---|
| Kalem korunuyor, koşul hâlâ geçerli | Takip satırına **dokunulmaz** (id, `geri_alinan_miktar`, `durum` korunur) |
| Kalem korunuyor, koşul artık geçerli değil (tip değişti) | Takip satırı **silinir** — ancak yalnızca hiç kapanma ilerlemesi yoksa (`geri_alinan_miktar = 0` / `teslim_edilen_miktar = 0`); ilerleme varsa `TESLIMAT_TRACKING_IN_PROGRESS` ile reddedilir |
| Yeni kalem, koşul geçerli | Takip satırı eklenir |
| Kalem siliniyor | `ON DELETE CASCADE` (`db/teslimatlar_migration.sql:83, 98`) takip satırını otomatik siler |

İlerleme korumasının gerekçesi: mevcut kod `delete by teslimat_id` yaptığı için,
müşteri kısmen geri getirmişse (`geri_alinan_miktar > 0`) bu bilgi **sessizce yok
oluyordu**. Sessiz veri kaybı yerine açık hata döndürmek GOREV.md §1'in gereğidir.

FIFO kapatma (`reduceEmanetTakipleri` / `reduceGeriTeslimTakipleri`) mantığı
**birebir korunur** — sıralama `created_at ASC`, eşleşme `customer_id + sube_id +
urun_id` (NULL'lar `IS NOT DISTINCT FROM` ile), kısmi kapanma durumları aynı.
Tek fark: satırlar `FOR UPDATE` ile kilitlenir (§2.8).

---

## 6. Idempotency ve eşzamanlılık

- **Kalıcı anahtar:** `db/aggregate_atomic_update_rpc.sql:111-119` içindeki
  `public.aggregate_idempotency` tablosu yeniden kullanılır (`module = 'teslimat'`).
  Process içi `IdempotencyStore` yeterli sayılmaz (çok instance).
- **Aynı key + aynı payload** ⇒ saklanan sonuç aynen döner, yan etki tekrarlanmaz.
- **Aynı key + farklı payload** ⇒ `TESLIMAT_IDEMPOTENCY_CONFLICT`.
  Payload parmak izi `md5(payload::text)` ile saklanır (ham payload saklanmaz).
- **Optimistic concurrency:** `teslimatlar.updated_at` mevcut
  (`db/teslimatlar_migration.sql:23`) ⇒ `expected_updated_at` uyuşmazlığında
  `TESLIMAT_STALE_WRITE`. Teklif/servis formundan farklı olarak burada kolon zaten
  var, capability-detect gerekmez.
- **Anahtar kalıcılığı:** idempotency satırı **aynı transaction içinde** yazılır;
  transaction rollback olursa anahtar da geri alınır (yani hata sonrası kullanıcı
  tekrar deneyebilir).

---

## 7. Belirsiz kalan domain kararları (kullanıcı kararı gerekiyor)

Bu maddeler **tahmin edilmedi** ve RPC mevcut davranışı koruyacak şekilde yazıldı:

1. **Negatif stok bloklanmalı mı?** Mevcut davranış: izin veriliyor. RPC korudu ve
   raporluyor. Bloklamak istenirse tek satırlık bir `raise exception` yeterli.
2. **`deleteTeslimat` stoku geri almalı mı?** Bugün almıyor (§3). Bu, `updateTeslimat`
   ile tutarsız. Ayrı görev.
3. **`syncTeslimatSideEffects` idempotent olmalı mı? (T2)** Durum geçişiyle çift
   düşüm gerçek bir hata; ancak düzeltmesi `updateTeslimatDurumAction` akışını
   değiştirmeyi gerektirir — bu sprintin kapsamı dışında, ayrı görev.
4. **`updateTeslimat` eski ön kayıtları temizlemeli mi?** Bugün temizlemiyor, sadece
   `on_kayit_olusturuldu = false` yapıyor (§2.4). Ön kayıt zaten faturalanmış
   olabileceği için otomatik silme **tehlikeli**; RPC ön kayıt üretimini
   **transaction dışında bıraktı** (bkz. §8).
5. **`emanetGeriAlAction` / `geriTeslimYapAction` tenant kontrolü yok.** Ayrı
   güvenlik görevi.

---

## 8. RPC'nin kapsamı — bilinçli sınır

RPC **şunları** tek transaction içinde yapar:
üst kayıt · kalemler · stok (`urun_stok` + `depo_hareketleri`) · emanet takipleri ·
geri teslim takipleri · durum geçmişi · idempotency kaydı.

RPC **şunu yapmaz:** ön kayıt (`on_kayitlar`) üretimi.

Gerekçe: ön kayıt üretimi cari hesap tarafına ait ayrı bir iş akışıdır, kendi dedup
stratejisi vardır (§2.4) ve §7.4'te açık bir kullanıcı kararı beklemektedir. Onu
tahmine dayalı olarak transaction'a almak GOREV.md §3 ihlali olurdu. Ön kayıt
üretimi RPC **başarıyla commit olduktan sonra**, mevcut `createOnKayitlarForTeslimat`
ile ayrı adım olarak çalışır ve hatası teslimat güncellemesini geri almaz — bu sınır
kod içinde ve dönüş değerinde (`onKayitStatus`) açıkça raporlanır.

---

## 10. Durum makinesi — geçiş matrisi ve tek yazma noktası

> Bu bölüm bu sprintte eklendi (GOREV.md Faz C).

### 10.1 Gerçek durum kümesi

Durum adları **tahmin edilmemiştir**; üç bağımsız kaynakta doğrulanmıştır:

| Kaynak | Kanıt |
|---|---|
| `src/app/(dashboard)/teslimatlar/actions.ts` | form doğrulama listesi |
| `db/teslimat_atomic_update_rpc.sql` §6 | `v_new_durum not in ('taslak','sevkte','tamamlandi','iptal')` |
| `src/lib/teslimatlar.ts` | `TeslimatInput['durum']` + iptal yolunun yazdığı `'iptal'` |

Küme: `taslak` · `sevkte` · `tamamlandi` · `iptal`
(kod karşılığı: `TESLIMAT_DURUMLAR`, `src/lib/teslimat/status-transition.ts`).

### 10.2 Geçiş matrisi

Stok etkisi **yalnızca** `durum = 'tamamlandi'` iken vardır (§2.5). Bu yüzden:

```
f(durum) = (durum === 'tamamlandi') ? Σ(stoktan düşen kalem miktarı) : 0
delta    = f(yeni) − f(eski)
```

| Eski | Yeni | İzinli mi? | Stok etkisi | Emanet etkisi | Geri teslim etkisi | Tekrar çağrıda sonuç |
|---|---|---|---|---|---|---|
| `taslak` | `sevkte` | evet | yok | yok | yok | no-op |
| `taslak` | `tamamlandi` | evet | **−Σ** (bir kez) | takip açılır | takip açılır | no-op |
| `taslak` | `iptal` | evet | yok | yok | yok | no-op |
| `sevkte` | `taslak` | evet | yok | yok | yok | no-op |
| `sevkte` | `tamamlandi` | evet | **−Σ** (bir kez) | takip açılır | takip açılır | no-op |
| `sevkte` | `iptal` | evet | yok | yok | yok | no-op |
| `tamamlandi` | `taslak` | evet | **+Σ** (iade) | ilerlemesiz takip silinir | ilerlemesiz takip silinir | no-op |
| `tamamlandi` | `sevkte` | evet | **+Σ** (iade) | ilerlemesiz takip silinir | ilerlemesiz takip silinir | no-op |
| `tamamlandi` | `iptal` | evet | **+Σ** (iade) | ilerlemesiz takip silinir | ilerlemesiz takip silinir | no-op |
| `iptal` | `taslak` / `sevkte` | evet | yok | yok | yok | no-op |
| `iptal` | `tamamlandi` | evet | **−Σ** (bir kez) | takip açılır | takip açılır | no-op |
| *herhangi* | *aynısı* | evet | **yok** | yok | yok | hiçbir yazma yapılmaz |

**Kısmen kapanmış takip istisnası:** `tamamlandi` durumundan çıkışta, ilerlemesi
olan (`geri_alinan_miktar > 0` veya `teslim_edilen_miktar > 0`) bir takip varsa
geçiş `TESLIMAT_TRACKING_IN_PROGRESS` ile **kontrollü olarak reddedilir** ve
hiçbir yazma yapılmaz. Sessizce veri silmek yerine operatör kararı beklenir.

**Neden hiçbir geçiş yasaklanmadı:** mevcut UI
(`src/app/(dashboard)/teslimatlar/[id]/page.tsx:159-169`) dört durum arasında
serbest geçiş ve `iptal`den geri dönüş sunar. Bu sprintte yeni bir business
kuralı uydurulmaz (GOREV.md §3, §8). Güvenlik geçişi yasaklayarak değil, etkiyi
**net delta** olarak tam bir kez uygulayarak sağlanır.

### 10.3 Tek yazma noktası — neden AYRI bir RPC yazılmadı

Durum geçişi için ikinci bir RPC yazmak, aynı stok mantığının iki yerde
yaşaması demekti — düzeltilmeye çalışılan hatanın ta kendisi. Bunun yerine geçiş,
mevcut kanonik yazara devredilir:

```
teslimat_update_atomic(
  p_teslimat_id         = <id>,
  p_parent_patch        = {"durum": "<yeni>"},   -- YALNIZCA durum
  p_lines               = null,                  -- kalemlere DOKUNMA
  p_expected_updated_at = <okunan updated_at>,   -- optimistic concurrency
  p_idempotency_key     = teslimat-durum:<id>:<durum>:<updated_at>
)
```

RPC'nin (9a) bloğu gönderilmeyen alanlar için `coalesce` / `? 'alan'` kullandığı
için müşteri, şube, tarih ve açıklama alanları **olduğu gibi kalır**.

| Yazar | Önce | Sonra |
|---|---|---|
| `updateTeslimat` | `teslimat_update_atomic` | değişmedi |
| `updateTeslimatDurumAction` | 3 bağımsız yazma + `syncTeslimatSideEffects` → `adjustUrunStok` (**mutlak düşüm**) | `applyTeslimatDurumGecisi` → `teslimat_update_atomic` |
| `deleteTeslimat` (soft/iptal) | 4 bağımsız yazma, **stok hiç geri alınmıyordu** | `applyTeslimatDurumGecisi(id, 'iptal')` |
| `emanetGeriAlAction` / `geriTeslimYapAction` | tenant kontrolsüz doğrudan `update` | `teslimat_*_atomic` RPC'leri |
| `reverseUrunStok` | dışa açık, çağıranı yok | **kaldırıldı** |
| `syncTeslimatSideEffects` | çift stok yazarı | **kaldırıldı** |

Kalan tek istisna: `createTeslimat` yeni bir kayıt oluştururken
`applyKalemSideEffects` üzerinden ilk stok etkisini uygular. Bu bir *çoğaltma*
değildir (yeni aggregate'in ilk yazması) ama hâlâ atomik değildir — açık risk
olarak §11.4'te izlenir.

### 10.4 Çift stok düşme regresyonları — durum

GOREV.md §8'deki 10 maddelik liste:

| # | Senaryo | Nerede kanıtlandı | Durum |
|---|---|---|---|
| 1 | Stok etkisiz durumda kaydetme → stok değişmez | `tests/teslimat-status-transition.test.ts` | ✅ geçti (local) |
| 2 | İlk `tamamlandi` geçişi → stok bir kez değişir | aynı | ✅ geçti (local) |
| 3 | Aynı isteğin replay'i → stok yeniden değişmez | aynı + idempotency anahtarı | ✅ sözleşme (local) |
| 4 | Aynı durumun farklı istekle tekrarı → no-op | aynı | ✅ geçti (local) |
| 5 | Kalem miktarı değişir → yalnızca net delta | `tests/teslimat-stock-delta.test.ts` | ✅ geçti (local) |
| 6 | Aynı ürün iki kalemde → toplam delta doğru | `tests/teslimat-status-transition.test.ts` | ✅ geçti (local) |
| 7 | Şube değişimi → atomik ve dengeli | RPC §9a + §10 | ⏳ staging gerekir |
| 8 | Hata enjeksiyonu → tam rollback | `db/teslimat_atomic_update_tests.sql` | ❌ ÇALIŞTIRILMADI — STAGING NO-GO |
| 9 | İki eşzamanlı geçiş → çift hareket yok | `for update` + `expected_updated_at` | ❌ ÇALIŞTIRILMADI — STAGING NO-GO |
| 10 | Tenant A, Tenant B teslimatının durumunu değiştiremez | RPC §3/§5 | ❌ ÇALIŞTIRILMADI — STAGING NO-GO |

---

## 11. `deleteTeslimat` — kapatılan veri kaybı ve seçilen model

> Bu bölüm bu sprintte eklendi (GOREV.md Faz E).

### 11.1 Bulunan hata

`deleteTeslimat` üç mod tanımlıyordu (`auto` | `physical` | `soft`) ama `auto`
dalı `analysis.physicalSafe` sonucuna **hiç bakmadan** doğrudan
`physicallyDeleteTeslimat` çağırıyordu. Altındaki güvenlik kontrolü `auto` için
erişilemez (ölü) koddu. `deleteTeslimatAction` ise yalnızca `auto` kullanıyordu.

Sonuç: `tamamlandi` durumundaki, stoku düşülmüş bir teslimat tek tıkla fiziksel
olarak siliniyor; kalemler, emanet/geri teslim takipleri ve durum geçmişi yok
oluyor, **düşülen stok asla geri verilmiyordu**. Kayıt yok olduğu için hata
sonradan tespit de edilemiyordu.

### 11.2 Seçilen model

| Kaydın durumu | Davranış |
|---|---|
| Stok/takip/ön kayıt etkisi **yok** (`physicalSafe`) | tenant doğrulamasıyla fiziksel silme |
| Etki **var** | **atomik iptal**: `applyTeslimatDurumGecisi(id, 'iptal')` — stok tam bir kez iade edilir, durum geçmişi korunur |
| Zaten `iptal` | idempotent no-op (hiçbir yazma yok) |
| `mode: 'physical'` + güvenli değil | `UNSAFE_PHYSICAL_DELETE` ile reddedilir |
| Yabancı tenant | RPC reddi (`TESLIMAT_TENANT_MISMATCH`) |

Kullanıcıya dönen mesaj artık "Teslimat silindi." yerine, iptale düşüldüğünde
gerekçesini de içerir; sessiz davranış değişikliği bırakılmaz.

### 11.3 Bilinçli davranış farkı

Eski `softDeleteTeslimat` ilerlemesiz takipleri `'iptal'` olarak işaretliyordu;
kanonik RPC ise onları **siler** (takip satırları yalnızca `tamamlandi` iken
var olur — §5 mutabakat kuralı). Kısmen kapanmış bir takip varsa iptal
`TESLIMAT_TRACKING_IN_PROGRESS` ile reddedilir. İki yol arasında seçim yapmak
yerine ikinci yazarı korumak, düzeltilen hatanın aynısını geri getirirdi.

Teslimatın audit izi `teslimat_durum_gecmisi` içinde korunur.

### 11.4 Açık kullanıcı kararları

**Emanet geri alındığında stok artmalı mı?** Mevcut kod artırmıyor
(`applyKalemSideEffects` yalnızca teslimde düşer; kapatma yolunda stok yazması
yok). Bu sprint mevcut davranışı **korudu** ve yeni kural türetmedi.
`db/teslimat_takip_action_atomic.sql` başlığında da aynı sınır yazılıdır.
Karar verilirse tek yazma noktası yine `teslimat_update_atomic` olmalıdır.

**`createTeslimat` atomik değil.** Üst kayıt → kalemler → durum geçmişi → stok
yan etkileri hâlâ ayrı yazmalardır. Çoğaltma değildir (yeni aggregate'in ilk
yazması) ama ortada bir hata oluşursa yarım kayıt bırakır. Ayrı bir görevde
`teslimat_create_atomic` olarak ele alınmalıdır.

---

## 12. Deployment sırası (zorunlu)

```
 1. Gate 0: node scripts/verify-staging-env.mjs → exit 0            [şu an: NO-GO]
 2. Read-only preflight: db/staging_schema_required_objects_check.sql
 3. Read-only tenant denetimi: db/read_only_tenant_ownership_audit.sql
 4. Staging şema snapshot / yedek
 5. db/aggregate_atomic_update_rpc.sql   (aggregate_idempotency tablosunu kurar)
 6. db/teslimat_atomic_update_rpc.sql    (5'e BAĞIMLI — idempotency + payload_fingerprint)
 7. db/invoice_atomic_update_rpc.sql     (bağımsız)
 8. db/teslimat_takip_action_atomic.sql  (6'ya BAĞIMLI — takip firma_id + fingerprint)
 9. db/tenant_ownership_rls_remediation.sql
10. npm run db:types:generate            (kanonik şemadan)
11. Uygulama kodunu deploy et
12. Staging transaction / ownership / concurrency / idempotency testleri
13. Production: ayrı görev + açık kullanıcı onayı
```

**Sıra ihlali riski:** 11. adım 6. adımdan önce yapılırsa `updateTeslimat` ve
durum geçişi `TESLIMAT_RPC_MISSING`, emanet/geri teslim kapatma ise
`TESLIMAT_TAKIP_RPC_MISSING` hatası döndürür ve bu akışlar **çalışmaz**.
Bu bilinçli bir tercihtir: sessizce eski güvensiz akışa düşmek (GOREV.md §8) yerine
açık ve teşhis edilebilir hata verilir. Rollback için önce kod eski sürüme alınır,
sonra RPC düşürülür.
