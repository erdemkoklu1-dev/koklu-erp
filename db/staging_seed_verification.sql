-- ==========================================================
-- STAGING ONLY — SEED VERIFICATION
-- Sadece SELECT sorguları içerir.
-- Veri değiştirmez.
-- ==========================================================

SELECT 'firmalar' AS kontrol, COUNT(*)::text AS sonuc FROM public.firmalar
UNION ALL SELECT 'subeler', COUNT(*)::text FROM public.subeler
UNION ALL SELECT 'roller', COUNT(*)::text FROM public.roller
UNION ALL SELECT 'kullanici_profiller', COUNT(*)::text FROM public.kullanici_profiller
UNION ALL SELECT 'customers', COUNT(*)::text FROM public.customers
UNION ALL SELECT 'devices', COUNT(*)::text FROM public.devices
UNION ALL SELECT 'service_forms', COUNT(*)::text FROM public.service_forms
UNION ALL SELECT 'invoices', COUNT(*)::text FROM public.invoices
UNION ALL SELECT 'teklifler', COUNT(*)::text FROM public.teklifler
UNION ALL SELECT 'proforma_faturalar', COUNT(*)::text FROM public.proforma_faturalar
UNION ALL SELECT 'teslimatlar', COUNT(*)::text FROM public.teslimatlar
UNION ALL SELECT 'teknik_raporlar', COUNT(*)::text FROM public.teknik_raporlar
UNION ALL SELECT 'musteri_talepleri', COUNT(*)::text FROM public.musteri_talepleri
UNION ALL SELECT 'is_planlari', COUNT(*)::text FROM public.is_planlari
UNION ALL SELECT 'planli_isler', COUNT(*)::text FROM public.planli_isler
UNION ALL SELECT 'brokers', COUNT(*)::text FROM public.brokers
UNION ALL SELECT 'araci_cari_hareketleri', COUNT(*)::text FROM public.araci_cari_hareketleri;

-- firma_id null kontrolü
SELECT 'customers_firma_id_null' AS kontrol, COUNT(*)::text AS sonuc FROM public.customers WHERE firma_id IS NULL
UNION ALL SELECT 'devices_firma_id_null', COUNT(*)::text FROM public.devices WHERE firma_id IS NULL
UNION ALL SELECT 'service_forms_firma_id_null', COUNT(*)::text FROM public.service_forms WHERE firma_id IS NULL
UNION ALL SELECT 'invoices_firma_id_null', COUNT(*)::text FROM public.invoices WHERE firma_id IS NULL
UNION ALL SELECT 'teklifler_firma_id_null', COUNT(*)::text FROM public.teklifler WHERE firma_id IS NULL
UNION ALL SELECT 'teslimatlar_firma_id_null', COUNT(*)::text FROM public.teslimatlar WHERE firma_id IS NULL
UNION ALL SELECT 'teknik_raporlar_firma_id_null', COUNT(*)::text FROM public.teknik_raporlar WHERE firma_id IS NULL;
