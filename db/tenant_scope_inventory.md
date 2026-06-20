# Firma / Tenant Kapsam Envanteri

Bu envanter `tenant_migration.sql` ile başlayan Sprint 1.1 kapsamını takip eder. Amaç mevcut tek firma kullanımını bozmadan her kritik kaydı `firma_id` ile işaretlemek, sonraki fazda RLS politikalarını kademeli olarak sertleştirmektir.

## Migration ile kapsama alınan temel tablolar

`firmalar`, `subeler`, `kullanici_profiller`, `customers`, `devices`, `service_forms`, `invoices`, `invoice_items`, `payments`, `tedarikciler`, `teslimatlar`, `teslimat_kalemleri`, `teklifler`, `teklif_kalemleri`, `proforma_faturalar`, `proforma_kalemleri`, `hatirlatmalar`, `hatirlatma_sablonlari`, `hatirlatma_susturmalar`, `teknik_raporlar`, `teknik_hesap_ayarlari`, `musteri_talepleri`, `is_planlari`, `planli_isler`, `brokers`, `araci_cari_hareketleri`, `urunler`, `hammaddeler`, `urun_receteler`, `uretim_emirleri`, `urun_stok_hareketleri`, `hammadde_stok_girisler`, `depo_hareketleri`, `on_kayitlar`, `on_kayit_kalemler`, `musteri_cari_belgeler`, `mutabakat_formlari`, `gelir_gider_hareketleri`, `sabit_giderler`, `calisanlar`, `maas_hareketleri`, `vergi_takvimleri`, `personeller`.

Migration tablo yoksa hata vermeden geçer; ilgili modül migration'ı daha sonra çalıştırıldığında `tenant_migration.sql` tekrar çalıştırılabilir.

## Uygulama helper'ı

`src/lib/auth/tenant-scope.ts` tenant kapsamı için opt-in helper sağlar:

- `getCurrentTenantAccess(userId)`: kullanıcının `firma_id` ve `Super Admin` durumunu döndürür.
- `applyTenantScope(query, access)`: sorguya `firma_id` filtresi ekler.
- `resolveTenantFilter(access, requested)`: Super Admin için istenen firmayı, diğer roller için kendi firmasını seçer.
- `filterVisibleTenantRows(rows, access)`: istemciye giden satırları tenant'a göre süzer.

## Branch scope kontrol listesi

Aşağıdaki modüllerde tenant filtresi eklendikten sonra mevcut şube filtresi de merkezi helper üzerinden doğrulanmalı:

- Anasayfa dashboard: sayaçlar, son hareketler, finans kartları.
- Müşteriler ve cihazlar: liste, detay, dosyadan import, servis formu ilişkileri.
- Cari / faturalar: giden fatura, gelen fatura, tedarikçi cari, mali durum, gecikmiş ödemeler.
- Hatırlatmalar: özet, geçmiş, kural ve şablon listeleri.
- Teklif / proforma: liste, detay, PDF, teklife aktarma.
- Teslimatlar: ana liste, operasyon teslimat listesi, bekleyenler, emanetler, hareket geçmişi.
- Operasyon: talepler, iş planları, planlı işler ve soft delete sayaçları.
- Teknik raporlar: liste, detay, yazdırma, kopyalama, teklife aktarma.
- Aracılar: komisyonlar, manuel cari hareketler, liste özetleri.
- Fabrika: stok, üretim emirleri, reçete, depo hareketleri.
- Yönetim: kullanıcı, rol, şube, firma ayarları, yedekleme.

## Sonraki güvenli adımlar

1. Canlı ve yerel veritabanında `firma_id is null` kalan satırları raporlayan schema kontrol scripti ekle.
2. Tenant filtresini önce okuma sorgularında `applyTenantScope` ile devreye al.
3. Yeni kayıt oluşturma akışlarında `firma_id` değerini kullanıcının firmasından otomatik yaz.
4. Her modül doğrulandıktan sonra tablo bazlı RLS politikalarını `public.current_firma_id()` üzerinden sertleştir.
5. Çok firmalı satışa çıkmadan önce `firma_id` kolonlarını kritik tablolarda `not null` yap.

