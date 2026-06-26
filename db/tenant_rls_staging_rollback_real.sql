-- ==========================================================
-- STAGING ONLY
-- Production üzerinde çalıştırılmayacak.
-- Gerçek policy cleanup/apply dry-run geri dönüş taslağıdır.
-- ==========================================================

-- Yeni tenant policy'leri kaldır.
DROP POLICY IF EXISTS customers_tenant_select ON public.customers;
DROP POLICY IF EXISTS customers_tenant_insert ON public.customers;
DROP POLICY IF EXISTS customers_tenant_update ON public.customers;
DROP POLICY IF EXISTS devices_tenant_select ON public.devices;
DROP POLICY IF EXISTS devices_tenant_insert ON public.devices;
DROP POLICY IF EXISTS devices_tenant_update ON public.devices;
DROP POLICY IF EXISTS service_forms_tenant_select ON public.service_forms;
DROP POLICY IF EXISTS service_forms_tenant_insert ON public.service_forms;
DROP POLICY IF EXISTS service_forms_tenant_update ON public.service_forms;
DROP POLICY IF EXISTS service_form_items_tenant_select ON public.service_form_items;
DROP POLICY IF EXISTS service_form_items_tenant_insert ON public.service_form_items;
DROP POLICY IF EXISTS service_form_items_tenant_update ON public.service_form_items;
DROP POLICY IF EXISTS invoices_tenant_select ON public.invoices;
DROP POLICY IF EXISTS invoices_tenant_insert ON public.invoices;
DROP POLICY IF EXISTS invoices_tenant_update ON public.invoices;
DROP POLICY IF EXISTS invoice_items_tenant_select ON public.invoice_items;
DROP POLICY IF EXISTS invoice_items_tenant_insert ON public.invoice_items;
DROP POLICY IF EXISTS invoice_items_tenant_update ON public.invoice_items;
DROP POLICY IF EXISTS invoice_brokers_tenant_select ON public.invoice_brokers;
DROP POLICY IF EXISTS invoice_brokers_tenant_insert ON public.invoice_brokers;
DROP POLICY IF EXISTS invoice_brokers_tenant_update ON public.invoice_brokers;
DROP POLICY IF EXISTS payments_tenant_select ON public.payments;
DROP POLICY IF EXISTS payments_tenant_insert ON public.payments;
DROP POLICY IF EXISTS payments_tenant_update ON public.payments;
DROP POLICY IF EXISTS teslimatlar_tenant_select ON public.teslimatlar;
DROP POLICY IF EXISTS teslimatlar_tenant_insert ON public.teslimatlar;
DROP POLICY IF EXISTS teslimatlar_tenant_update ON public.teslimatlar;
DROP POLICY IF EXISTS teslimat_kalemleri_tenant_select ON public.teslimat_kalemleri;
DROP POLICY IF EXISTS teslimat_kalemleri_tenant_insert ON public.teslimat_kalemleri;
DROP POLICY IF EXISTS teslimat_kalemleri_tenant_update ON public.teslimat_kalemleri;
DROP POLICY IF EXISTS teklifler_tenant_select ON public.teklifler;
DROP POLICY IF EXISTS teklifler_tenant_insert ON public.teklifler;
DROP POLICY IF EXISTS teklifler_tenant_update ON public.teklifler;
DROP POLICY IF EXISTS teklif_kalemleri_tenant_select ON public.teklif_kalemleri;
DROP POLICY IF EXISTS teklif_kalemleri_tenant_insert ON public.teklif_kalemleri;
DROP POLICY IF EXISTS teklif_kalemleri_tenant_update ON public.teklif_kalemleri;
DROP POLICY IF EXISTS proforma_faturalar_tenant_select ON public.proforma_faturalar;
DROP POLICY IF EXISTS proforma_faturalar_tenant_insert ON public.proforma_faturalar;
DROP POLICY IF EXISTS proforma_faturalar_tenant_update ON public.proforma_faturalar;
DROP POLICY IF EXISTS proforma_fatura_kalemleri_tenant_select ON public.proforma_fatura_kalemleri;
DROP POLICY IF EXISTS proforma_fatura_kalemleri_tenant_insert ON public.proforma_fatura_kalemleri;
DROP POLICY IF EXISTS proforma_fatura_kalemleri_tenant_update ON public.proforma_fatura_kalemleri;
DROP POLICY IF EXISTS teknik_raporlar_tenant_select ON public.teknik_raporlar;
DROP POLICY IF EXISTS teknik_raporlar_tenant_insert ON public.teknik_raporlar;
DROP POLICY IF EXISTS teknik_raporlar_tenant_update ON public.teknik_raporlar;
DROP POLICY IF EXISTS musteri_talepleri_tenant_select ON public.musteri_talepleri;
DROP POLICY IF EXISTS musteri_talepleri_tenant_insert ON public.musteri_talepleri;
DROP POLICY IF EXISTS musteri_talepleri_tenant_update ON public.musteri_talepleri;
DROP POLICY IF EXISTS is_planlari_tenant_select ON public.is_planlari;
DROP POLICY IF EXISTS is_planlari_tenant_insert ON public.is_planlari;
DROP POLICY IF EXISTS is_planlari_tenant_update ON public.is_planlari;
DROP POLICY IF EXISTS planli_isler_tenant_select ON public.planli_isler;
DROP POLICY IF EXISTS planli_isler_tenant_insert ON public.planli_isler;
DROP POLICY IF EXISTS planli_isler_tenant_update ON public.planli_isler;
DROP POLICY IF EXISTS brokers_tenant_select ON public.brokers;
DROP POLICY IF EXISTS brokers_tenant_insert ON public.brokers;
DROP POLICY IF EXISTS brokers_tenant_update ON public.brokers;
DROP POLICY IF EXISTS araci_cari_hareketleri_tenant_select ON public.araci_cari_hareketleri;
DROP POLICY IF EXISTS araci_cari_hareketleri_tenant_insert ON public.araci_cari_hareketleri;
DROP POLICY IF EXISTS araci_cari_hareketleri_tenant_update ON public.araci_cari_hareketleri;
DROP POLICY IF EXISTS firmalar_tenant_select ON public.firmalar;
DROP POLICY IF EXISTS kullanici_profiller_self_select ON public.kullanici_profiller;
DROP POLICY IF EXISTS kullanici_profiller_self_update ON public.kullanici_profiller;
DROP POLICY IF EXISTS subeler_tenant_select ON public.subeler;

-- Helper fonksiyonları eski hale döndürmek için production read-only
-- envanterde alınan pg_get_functiondef çıktısı kullanılmalıdır.
-- Eski fazla izin veren policy'leri geri oluşturmak güvenlik riskidir.
-- Zorunlu rollback durumunda staging snapshot restore tercih edilmelidir.
--
-- Örnek eski policy recreate taslakları bilinçli olarak yorumda bırakıldı:
-- CREATE POLICY customers_select ON public.customers FOR SELECT USING (true);
-- CREATE POLICY proforma_auth_all ON public.proforma_faturalar FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
-- CREATE POLICY anon_all ON public.araci_cari_hareketleri FOR ALL TO anon USING (true) WITH CHECK (true);
