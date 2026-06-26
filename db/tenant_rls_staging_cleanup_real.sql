-- ==========================================================
-- STAGING ONLY
-- Production üzerinde çalıştırılmayacak.
-- Gerçek production policy adlarına göre hazırlanmıştır.
-- ==========================================================

-- Öncelik 1 - tenant kritik tablolar.
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

-- Öncelik 2 - public true / service role isimli ama geniş tenant tabloları.
DROP POLICY IF EXISTS "Service role has full access" ON public.teklifler;
DROP POLICY IF EXISTS "Service role has full access" ON public.teklif_kalemleri;
DROP POLICY IF EXISTS "Service role has full access" ON public.teslimatlar;
DROP POLICY IF EXISTS "Service role has full access" ON public.teslimat_kalemleri;
DROP POLICY IF EXISTS "Service role has full access" ON public.teslimat_durum_gecmisi;
DROP POLICY IF EXISTS "Service role has full access" ON public.on_kayitlar;

-- Kapsam dışı bırakılanlar:
-- urunler, roller, modul_izinleri, device_types, teknik_hesap_ayarlari,
-- mutabakat_formlari, sube_gider_gelir ve personel tabloları ayrı güvenlik
-- modelinde ele alınacaktır.
