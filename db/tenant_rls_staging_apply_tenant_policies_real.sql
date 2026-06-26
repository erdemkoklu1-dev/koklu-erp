-- ==========================================================
-- STAGING ONLY
-- Production üzerinde çalıştırılmayacak.
-- Gerçek envantere göre tenant policy dry-run dosyasıdır.
-- ==========================================================
-- DELETE policy varsayılan olarak eklenmez.

DROP POLICY IF EXISTS customers_tenant_select ON public.customers;
CREATE POLICY customers_tenant_select ON public.customers FOR SELECT TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS customers_tenant_insert ON public.customers;
CREATE POLICY customers_tenant_insert ON public.customers FOR INSERT TO authenticated WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS customers_tenant_update ON public.customers;
CREATE POLICY customers_tenant_update ON public.customers FOR UPDATE TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id()) WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());

DROP POLICY IF EXISTS devices_tenant_select ON public.devices;
CREATE POLICY devices_tenant_select ON public.devices FOR SELECT TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS devices_tenant_insert ON public.devices;
CREATE POLICY devices_tenant_insert ON public.devices FOR INSERT TO authenticated WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS devices_tenant_update ON public.devices;
CREATE POLICY devices_tenant_update ON public.devices FOR UPDATE TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id()) WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());

DROP POLICY IF EXISTS service_forms_tenant_select ON public.service_forms;
CREATE POLICY service_forms_tenant_select ON public.service_forms FOR SELECT TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS service_forms_tenant_insert ON public.service_forms;
CREATE POLICY service_forms_tenant_insert ON public.service_forms FOR INSERT TO authenticated WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS service_forms_tenant_update ON public.service_forms;
CREATE POLICY service_forms_tenant_update ON public.service_forms FOR UPDATE TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id()) WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());

DROP POLICY IF EXISTS service_form_items_tenant_select ON public.service_form_items;
CREATE POLICY service_form_items_tenant_select ON public.service_form_items FOR SELECT TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS service_form_items_tenant_insert ON public.service_form_items;
CREATE POLICY service_form_items_tenant_insert ON public.service_form_items FOR INSERT TO authenticated WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS service_form_items_tenant_update ON public.service_form_items;
CREATE POLICY service_form_items_tenant_update ON public.service_form_items FOR UPDATE TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id()) WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());

DROP POLICY IF EXISTS invoices_tenant_select ON public.invoices;
CREATE POLICY invoices_tenant_select ON public.invoices FOR SELECT TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS invoices_tenant_insert ON public.invoices;
CREATE POLICY invoices_tenant_insert ON public.invoices FOR INSERT TO authenticated WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS invoices_tenant_update ON public.invoices;
CREATE POLICY invoices_tenant_update ON public.invoices FOR UPDATE TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id()) WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());

DROP POLICY IF EXISTS invoice_items_tenant_select ON public.invoice_items;
CREATE POLICY invoice_items_tenant_select ON public.invoice_items FOR SELECT TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS invoice_items_tenant_insert ON public.invoice_items;
CREATE POLICY invoice_items_tenant_insert ON public.invoice_items FOR INSERT TO authenticated WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS invoice_items_tenant_update ON public.invoice_items;
CREATE POLICY invoice_items_tenant_update ON public.invoice_items FOR UPDATE TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id()) WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());

DROP POLICY IF EXISTS invoice_brokers_tenant_select ON public.invoice_brokers;
CREATE POLICY invoice_brokers_tenant_select ON public.invoice_brokers FOR SELECT TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS invoice_brokers_tenant_insert ON public.invoice_brokers;
CREATE POLICY invoice_brokers_tenant_insert ON public.invoice_brokers FOR INSERT TO authenticated WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS invoice_brokers_tenant_update ON public.invoice_brokers;
CREATE POLICY invoice_brokers_tenant_update ON public.invoice_brokers FOR UPDATE TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id()) WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());

DROP POLICY IF EXISTS payments_tenant_select ON public.payments;
CREATE POLICY payments_tenant_select ON public.payments FOR SELECT TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS payments_tenant_insert ON public.payments;
CREATE POLICY payments_tenant_insert ON public.payments FOR INSERT TO authenticated WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS payments_tenant_update ON public.payments;
CREATE POLICY payments_tenant_update ON public.payments FOR UPDATE TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id()) WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());

DROP POLICY IF EXISTS teslimatlar_tenant_select ON public.teslimatlar;
CREATE POLICY teslimatlar_tenant_select ON public.teslimatlar FOR SELECT TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS teslimatlar_tenant_insert ON public.teslimatlar;
CREATE POLICY teslimatlar_tenant_insert ON public.teslimatlar FOR INSERT TO authenticated WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS teslimatlar_tenant_update ON public.teslimatlar;
CREATE POLICY teslimatlar_tenant_update ON public.teslimatlar FOR UPDATE TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id()) WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());

DROP POLICY IF EXISTS teslimat_kalemleri_tenant_select ON public.teslimat_kalemleri;
CREATE POLICY teslimat_kalemleri_tenant_select ON public.teslimat_kalemleri FOR SELECT TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS teslimat_kalemleri_tenant_insert ON public.teslimat_kalemleri;
CREATE POLICY teslimat_kalemleri_tenant_insert ON public.teslimat_kalemleri FOR INSERT TO authenticated WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS teslimat_kalemleri_tenant_update ON public.teslimat_kalemleri;
CREATE POLICY teslimat_kalemleri_tenant_update ON public.teslimat_kalemleri FOR UPDATE TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id()) WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());

DROP POLICY IF EXISTS teklifler_tenant_select ON public.teklifler;
CREATE POLICY teklifler_tenant_select ON public.teklifler FOR SELECT TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS teklifler_tenant_insert ON public.teklifler;
CREATE POLICY teklifler_tenant_insert ON public.teklifler FOR INSERT TO authenticated WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS teklifler_tenant_update ON public.teklifler;
CREATE POLICY teklifler_tenant_update ON public.teklifler FOR UPDATE TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id()) WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());

DROP POLICY IF EXISTS teklif_kalemleri_tenant_select ON public.teklif_kalemleri;
CREATE POLICY teklif_kalemleri_tenant_select ON public.teklif_kalemleri FOR SELECT TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS teklif_kalemleri_tenant_insert ON public.teklif_kalemleri;
CREATE POLICY teklif_kalemleri_tenant_insert ON public.teklif_kalemleri FOR INSERT TO authenticated WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS teklif_kalemleri_tenant_update ON public.teklif_kalemleri;
CREATE POLICY teklif_kalemleri_tenant_update ON public.teklif_kalemleri FOR UPDATE TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id()) WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());

DROP POLICY IF EXISTS proforma_faturalar_tenant_select ON public.proforma_faturalar;
CREATE POLICY proforma_faturalar_tenant_select ON public.proforma_faturalar FOR SELECT TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS proforma_faturalar_tenant_insert ON public.proforma_faturalar;
CREATE POLICY proforma_faturalar_tenant_insert ON public.proforma_faturalar FOR INSERT TO authenticated WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS proforma_faturalar_tenant_update ON public.proforma_faturalar;
CREATE POLICY proforma_faturalar_tenant_update ON public.proforma_faturalar FOR UPDATE TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id()) WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());

DROP POLICY IF EXISTS proforma_fatura_kalemleri_tenant_select ON public.proforma_fatura_kalemleri;
CREATE POLICY proforma_fatura_kalemleri_tenant_select ON public.proforma_fatura_kalemleri FOR SELECT TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS proforma_fatura_kalemleri_tenant_insert ON public.proforma_fatura_kalemleri;
CREATE POLICY proforma_fatura_kalemleri_tenant_insert ON public.proforma_fatura_kalemleri FOR INSERT TO authenticated WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS proforma_fatura_kalemleri_tenant_update ON public.proforma_fatura_kalemleri;
CREATE POLICY proforma_fatura_kalemleri_tenant_update ON public.proforma_fatura_kalemleri FOR UPDATE TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id()) WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());

DROP POLICY IF EXISTS teknik_raporlar_tenant_select ON public.teknik_raporlar;
CREATE POLICY teknik_raporlar_tenant_select ON public.teknik_raporlar FOR SELECT TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS teknik_raporlar_tenant_insert ON public.teknik_raporlar;
CREATE POLICY teknik_raporlar_tenant_insert ON public.teknik_raporlar FOR INSERT TO authenticated WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS teknik_raporlar_tenant_update ON public.teknik_raporlar;
CREATE POLICY teknik_raporlar_tenant_update ON public.teknik_raporlar FOR UPDATE TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id()) WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());

DROP POLICY IF EXISTS musteri_talepleri_tenant_select ON public.musteri_talepleri;
CREATE POLICY musteri_talepleri_tenant_select ON public.musteri_talepleri FOR SELECT TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS musteri_talepleri_tenant_insert ON public.musteri_talepleri;
CREATE POLICY musteri_talepleri_tenant_insert ON public.musteri_talepleri FOR INSERT TO authenticated WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS musteri_talepleri_tenant_update ON public.musteri_talepleri;
CREATE POLICY musteri_talepleri_tenant_update ON public.musteri_talepleri FOR UPDATE TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id()) WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());

DROP POLICY IF EXISTS is_planlari_tenant_select ON public.is_planlari;
CREATE POLICY is_planlari_tenant_select ON public.is_planlari FOR SELECT TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS is_planlari_tenant_insert ON public.is_planlari;
CREATE POLICY is_planlari_tenant_insert ON public.is_planlari FOR INSERT TO authenticated WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS is_planlari_tenant_update ON public.is_planlari;
CREATE POLICY is_planlari_tenant_update ON public.is_planlari FOR UPDATE TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id()) WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());

DROP POLICY IF EXISTS planli_isler_tenant_select ON public.planli_isler;
CREATE POLICY planli_isler_tenant_select ON public.planli_isler FOR SELECT TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS planli_isler_tenant_insert ON public.planli_isler;
CREATE POLICY planli_isler_tenant_insert ON public.planli_isler FOR INSERT TO authenticated WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS planli_isler_tenant_update ON public.planli_isler;
CREATE POLICY planli_isler_tenant_update ON public.planli_isler FOR UPDATE TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id()) WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());

DROP POLICY IF EXISTS brokers_tenant_select ON public.brokers;
CREATE POLICY brokers_tenant_select ON public.brokers FOR SELECT TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS brokers_tenant_insert ON public.brokers;
CREATE POLICY brokers_tenant_insert ON public.brokers FOR INSERT TO authenticated WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS brokers_tenant_update ON public.brokers;
CREATE POLICY brokers_tenant_update ON public.brokers FOR UPDATE TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id()) WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());

DROP POLICY IF EXISTS araci_cari_hareketleri_tenant_select ON public.araci_cari_hareketleri;
CREATE POLICY araci_cari_hareketleri_tenant_select ON public.araci_cari_hareketleri FOR SELECT TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS araci_cari_hareketleri_tenant_insert ON public.araci_cari_hareketleri;
CREATE POLICY araci_cari_hareketleri_tenant_insert ON public.araci_cari_hareketleri FOR INSERT TO authenticated WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS araci_cari_hareketleri_tenant_update ON public.araci_cari_hareketleri;
CREATE POLICY araci_cari_hareketleri_tenant_update ON public.araci_cari_hareketleri FOR UPDATE TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id()) WITH CHECK (public.is_super_admin() OR firma_id = public.current_firma_id());

-- Özel policy'ler.
DROP POLICY IF EXISTS firmalar_tenant_select ON public.firmalar;
CREATE POLICY firmalar_tenant_select ON public.firmalar FOR SELECT TO authenticated USING (public.is_super_admin() OR id = public.current_firma_id());

DROP POLICY IF EXISTS kullanici_profiller_self_select ON public.kullanici_profiller;
CREATE POLICY kullanici_profiller_self_select ON public.kullanici_profiller FOR SELECT TO authenticated USING (public.is_super_admin() OR id = auth.uid() OR firma_id = public.current_firma_id());
DROP POLICY IF EXISTS kullanici_profiller_self_update ON public.kullanici_profiller;
CREATE POLICY kullanici_profiller_self_update ON public.kullanici_profiller FOR UPDATE TO authenticated USING (public.is_super_admin() OR id = auth.uid()) WITH CHECK (public.is_super_admin() OR id = auth.uid());

DROP POLICY IF EXISTS subeler_tenant_select ON public.subeler;
CREATE POLICY subeler_tenant_select ON public.subeler FOR SELECT TO authenticated USING (public.is_super_admin() OR firma_id = public.current_firma_id());
