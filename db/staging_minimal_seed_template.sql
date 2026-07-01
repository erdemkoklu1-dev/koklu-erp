-- ==========================================================
-- STAGING ONLY — MINIMAL ANONYMIZED SEED TEMPLATE
-- Production üzerinde çalıştırılmayacak.
-- Gerçek müşteri/vergi/telefon/e-posta verisi içermez.
-- Çalıştırmadan önce Auth kullanıcıları manuel oluşturulmalıdır.
-- ==========================================================

-- Kullanım sırası:
-- 1. `node scripts/verify-staging-env.mjs` exit 0 dönmeli.
-- 2. Supabase Dashboard'da staging project açık olmalı.
-- 3. Migration'lar staging'e uygulanmış olmalı.
-- 4. `db/staging_schema_required_objects_check.sql` temiz olmalı.
-- 5. Bu dosyadaki kolon yapısı notları staging schema ile doğrulanmalı.
-- 6. Gerçek müşteri/personel/telefon/e-posta/vergi/adres verisi yazılmamalı.

BEGIN;

-- ----------------------------------------------------------
-- 1. Firmalar
-- ----------------------------------------------------------
INSERT INTO public.firmalar (ad, slug, telefon, email, adres, aktif)
VALUES
  ('Köklü Yangın Staging', 'koklu-yangin-staging', '0000000000', 'koklu.test@example.com', 'STAGING TEST anonim adres', true),
  ('Test Yangın Firması Staging', 'test-yangin-firmasi-staging', '0000000000', 'testfirma.user@example.com', 'STAGING TEST anonim adres', true)
ON CONFLICT (slug) DO UPDATE SET
  ad = EXCLUDED.ad,
  telefon = EXCLUDED.telefon,
  email = EXCLUDED.email,
  adres = EXCLUDED.adres,
  aktif = EXCLUDED.aktif;

-- ----------------------------------------------------------
-- 2. Şubeler
-- ----------------------------------------------------------
INSERT INTO public.subeler (ad, tip, sehir, adres, aktif, firma_id, notlar)
SELECT 'Erzincan Merkez', 'merkez', 'Erzincan', 'STAGING TEST anonim adres', true, f.id, 'STAGING TEST'
FROM public.firmalar f
WHERE f.slug = 'koklu-yangin-staging'
ON CONFLICT DO NOTHING;

INSERT INTO public.subeler (ad, tip, sehir, adres, aktif, firma_id, notlar)
SELECT 'İstanbul Şube', 'sube', 'İstanbul', 'STAGING TEST anonim adres', true, f.id, 'STAGING TEST'
FROM public.firmalar f
WHERE f.slug = 'koklu-yangin-staging'
ON CONFLICT DO NOTHING;

INSERT INTO public.subeler (ad, tip, sehir, adres, aktif, firma_id, notlar)
SELECT 'Merkez', 'merkez', 'Ankara', 'STAGING TEST anonim adres', true, f.id, 'STAGING TEST'
FROM public.firmalar f
WHERE f.slug = 'test-yangin-firmasi-staging'
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------
-- 3. Roller
-- ----------------------------------------------------------
INSERT INTO public.roller (ad, aciklama, renk)
VALUES
  ('Admin', 'STAGING TEST admin rolü', '#C8102E'),
  ('İdari Çalışan', 'STAGING TEST idari rol', '#4CAF50'),
  ('Saha Tekniker', 'STAGING TEST saha rolü', '#2196F3')
ON CONFLICT (ad) DO NOTHING;

-- ----------------------------------------------------------
-- 4. Müşteri ve cihaz kayıtları
-- ----------------------------------------------------------
-- Kolon yapısı doğrulanmalı.
-- `customers` ve `devices` tablo tanımları bu sprintte kesin varsayılmadı.
-- Aşağıdaki örnekleri staging schema kolonlarına göre netleştirmeden çalıştırma.

-- Örnek müşteri hedefleri:
-- - STAGING Köklü Test Müşteri
-- - STAGING Test Firma Müşteri
--
-- Örnek cihaz hedefleri:
-- - Her müşteriye en az 1 anonim cihaz
-- - Açıklama/not alanlarında `STAGING TEST` ibaresi
-- - `firma_id` ve varsa `sube_id` parent kayıtla aynı olmalı
--
-- INSERT INTO public.customers (..., firma_id, sube_id, ...)
-- VALUES (...);
--
-- INSERT INTO public.devices (..., customer_id, firma_id, ...)
-- VALUES (...);

-- ----------------------------------------------------------
-- 5. Servis formu ve servis kalemi
-- ----------------------------------------------------------
-- Kolon yapısı doğrulanmalı.
-- `service_forms` ve `service_form_items` zorunlu kolonları staging schema üzerinde kontrol edilmeden INSERT yazma.
-- Her firmaya en az bir servis formu ve mümkünse bir servis kalemi ekle.

-- ----------------------------------------------------------
-- 6. Fatura, kalem, ödeme, broker ve aracı cari örnekleri
-- ----------------------------------------------------------
-- Aşağıdaki blok müşteri kayıtları oluşturulduktan sonra uyarlanmalıdır.
-- `customer_id`, `firma_id`, `sube_id` ve varsa broker id değerleri staging kayıtlarından seçilmelidir.
-- Tutarlar küçük test tutarlarıdır; açıklamalarda `STAGING TEST` yer alır.

-- INSERT INTO public.invoices (
--   invoice_number, invoice_type, customer_id, invoice_date, due_date,
--   subtotal, kdv_rate, kdv_amount, total_amount, status, description,
--   firma_id, sube_id
-- )
-- SELECT
--   'STG-INV-0001', 'satis', c.id, current_date, current_date + 7,
--   100.00, 20.00, 20.00, 120.00, 'kesildi', 'STAGING TEST fatura',
--   c.firma_id, c.sube_id
-- FROM public.customers c
-- WHERE c.full_name = 'STAGING Köklü Test Müşteri'
-- LIMIT 1
-- ON CONFLICT (invoice_number) DO NOTHING;
--
-- INSERT INTO public.invoice_items (invoice_id, line_order, description, quantity, unit, unit_price, kdv_rate, firma_id)
-- SELECT i.id, 1, 'STAGING TEST fatura kalemi', 1, 'adet', 100.00, 20.00, i.firma_id
-- FROM public.invoices i
-- WHERE i.invoice_number = 'STG-INV-0001'
-- ON CONFLICT DO NOTHING;
--
-- INSERT INTO public.payments (invoice_id, direction, method, amount, payment_date, notes, firma_id)
-- SELECT i.id, 'tahsilat', 'nakit', 20.00, current_date, 'STAGING TEST kısmi tahsilat', i.firma_id
-- FROM public.invoices i
-- WHERE i.invoice_number = 'STG-INV-0001'
-- ON CONFLICT DO NOTHING;
--
-- INSERT INTO public.brokers (full_name, company_name, phone, email, notes, is_active, firma_id)
-- SELECT 'STAGING Test Aracı', 'STAGING TEST Aracı Firma', '0000000000', 'broker.test@example.com', 'STAGING TEST', true, f.id
-- FROM public.firmalar f
-- WHERE f.slug = 'koklu-yangin-staging'
-- ON CONFLICT DO NOTHING;
--
-- INSERT INTO public.invoice_brokers (invoice_id, broker_id, commission_rate, commission_amount, notes, firma_id)
-- SELECT i.id, b.id, 5.00, 6.00, 'STAGING TEST komisyon', i.firma_id
-- FROM public.invoices i
-- JOIN public.brokers b ON b.firma_id = i.firma_id
-- WHERE i.invoice_number = 'STG-INV-0001'
-- LIMIT 1
-- ON CONFLICT (invoice_id, broker_id) DO NOTHING;
--
-- INSERT INTO public.araci_cari_hareketleri (
--   araci_id, hareket_tipi, islem_yonu, tutar, para_birimi, aciklama,
--   kategori, durum, kaynak, firma_id, sube_id
-- )
-- SELECT b.id, 'Komisyon Hakedişi', 'alacak', 6.00, 'TRY', 'STAGING TEST aracı cari hareketi',
--        'Komisyon', 'Bekliyor', 'Manuel Giriş', b.firma_id, s.id
-- FROM public.brokers b
-- LEFT JOIN public.subeler s ON s.firma_id = b.firma_id
-- WHERE b.full_name = 'STAGING Test Aracı'
-- LIMIT 1;

-- ----------------------------------------------------------
-- 7. Teklif ve teklif kalemi
-- ----------------------------------------------------------
-- Müşteri kaydı oluşturulduktan sonra uyarlanmalıdır.

-- INSERT INTO public.teklifler (
--   teklif_no, tarih, gecerlilik_suresi, gecerlilik_bitis,
--   musteri_id, musteri_adi, kdv_durumu, kdv_orani,
--   ara_toplam, kdv_tutari, genel_toplam, notlar, firma_id, sube_id
-- )
-- SELECT
--   'STG-TEK-0001', current_date, 7, current_date + 7,
--   c.id, c.full_name, 'haric', 20.00,
--   100.00, 20.00, 120.00, 'STAGING TEST teklif', c.firma_id, c.sube_id
-- FROM public.customers c
-- WHERE c.full_name = 'STAGING Köklü Test Müşteri'
-- LIMIT 1
-- ON CONFLICT (teklif_no) DO NOTHING;
--
-- INSERT INTO public.teklif_kalemleri (teklif_id, sira_no, aciklama, miktar, birim_fiyat, toplam, firma_id)
-- SELECT t.id, 1, 'STAGING TEST teklif kalemi', 1, 100.00, 100.00, t.firma_id
-- FROM public.teklifler t
-- WHERE t.teklif_no = 'STG-TEK-0001'
-- ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------
-- 8. Proforma ve proforma kalemi
-- ----------------------------------------------------------
-- Müşteri kaydı oluşturulduktan sonra uyarlanmalıdır.

-- INSERT INTO public.proforma_faturalar (
--   proforma_no, tarih, vade_tarihi, customer_id, musteri_unvan,
--   musteri_adres, musteri_vkn, ara_toplam, kdv_matrahi,
--   kdv_tutari, toplam_tutar, para_birimi, durum, notlar, sube_id, firma_id
-- )
-- SELECT
--   'STG-PF-0001', current_date, current_date + 7, c.id, c.full_name,
--   'STAGING TEST anonim adres', '0000000000', 100.00, 100.00,
--   20.00, 120.00, 'TRY', 'taslak', 'STAGING TEST proforma', c.sube_id, c.firma_id
-- FROM public.customers c
-- WHERE c.full_name = 'STAGING Köklü Test Müşteri'
-- LIMIT 1
-- ON CONFLICT (proforma_no) DO NOTHING;
--
-- INSERT INTO public.proforma_fatura_kalemleri (
--   proforma_id, sira_no, mal_hizmet, aciklama, miktar, birim,
--   birim_fiyat, kdv_orani, kdv_tutari, toplam_tutar, firma_id
-- )
-- SELECT p.id, 1, 'STAGING TEST hizmet', 'STAGING TEST proforma kalemi', 1, 'Adet',
--        100.00, 20.00, 20.00, 120.00, p.firma_id
-- FROM public.proforma_faturalar p
-- WHERE p.proforma_no = 'STG-PF-0001'
-- ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------
-- 9. Teslimat, teknik rapor, müşteri talebi, iş planı, planlı iş
-- ----------------------------------------------------------
-- Bu tablolar için parent müşteri/cihaz kayıtları ve zorunlu kolonlar staging schema üzerinde doğrulanmalı.
-- Her iki firma için en az birer kayıt oluşturulması hedeflenir.
-- Tüm açıklama/not alanlarında `STAGING TEST` ibaresi kullanılmalı.
-- Gerçek personel veya müşteri bilgisi kullanılmamalı.

-- COMMIT'i yalnızca tüm kolon kontrolleri yapıldıktan sonra açık bırak.
-- ROLLBACK varsayılan güvenli kapanıştır; staging'e uygularken bilinçli olarak COMMIT'e çevir.
ROLLBACK;
