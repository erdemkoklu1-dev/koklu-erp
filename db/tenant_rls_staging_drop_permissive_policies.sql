-- =====================================================================
-- SADECE STAGING İÇİNDİR.
-- Production'da çalıştırma.
-- Gerçek policy adları rls_policy_inventory.sql çıktısı ile doğrulanmadan
-- bu dosya kullanılmaz.
-- =====================================================================
--
-- Bu dosya production'da çalıştırılmadı.
-- Buradaki DROP satırları gerçek envanter çıktısı doldurulana kadar
-- placeholder olarak yorumda kalır.

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Fazla izin veren policy drop listesi
-- ---------------------------------------------------------------------
-- Bu liste rls_inventory_analysis.md doldurulduktan sonra kesinleşecek.
-- Gerçek policy adını, tablo adını ve risk gerekçesini aşağıdaki formatla
-- envanter çıktısından birebir taşıyın.

-- Örnek format (placeholder, gerçek ad değildir):
-- DROP POLICY IF EXISTS "<ENVANTERDEN_GELEN_POLICY_ADI>" ON public.<TABLO_ADI>;

-- customers:
-- DROP POLICY IF EXISTS "<ENVANTERDEN_GELEN_POLICY_ADI>" ON public.customers;

-- devices:
-- DROP POLICY IF EXISTS "<ENVANTERDEN_GELEN_POLICY_ADI>" ON public.devices;

-- service_forms:
-- DROP POLICY IF EXISTS "<ENVANTERDEN_GELEN_POLICY_ADI>" ON public.service_forms;

-- service_form_items:
-- DROP POLICY IF EXISTS "<ENVANTERDEN_GELEN_POLICY_ADI>" ON public.service_form_items;

-- invoices:
-- DROP POLICY IF EXISTS "<ENVANTERDEN_GELEN_POLICY_ADI>" ON public.invoices;

-- invoice_items:
-- DROP POLICY IF EXISTS "<ENVANTERDEN_GELEN_POLICY_ADI>" ON public.invoice_items;

-- invoice_brokers:
-- DROP POLICY IF EXISTS "<ENVANTERDEN_GELEN_POLICY_ADI>" ON public.invoice_brokers;

-- payments:
-- DROP POLICY IF EXISTS "<ENVANTERDEN_GELEN_POLICY_ADI>" ON public.payments;

-- teslimatlar:
-- DROP POLICY IF EXISTS "<ENVANTERDEN_GELEN_POLICY_ADI>" ON public.teslimatlar;

-- teslimat_kalemleri:
-- DROP POLICY IF EXISTS "<ENVANTERDEN_GELEN_POLICY_ADI>" ON public.teslimat_kalemleri;

-- teklifler:
-- DROP POLICY IF EXISTS "<ENVANTERDEN_GELEN_POLICY_ADI>" ON public.teklifler;

-- teklif_kalemleri:
-- DROP POLICY IF EXISTS "<ENVANTERDEN_GELEN_POLICY_ADI>" ON public.teklif_kalemleri;

-- proforma_faturalar:
-- DROP POLICY IF EXISTS "<ENVANTERDEN_GELEN_POLICY_ADI>" ON public.proforma_faturalar;

-- proforma_fatura_kalemleri:
-- DROP POLICY IF EXISTS "<ENVANTERDEN_GELEN_POLICY_ADI>" ON public.proforma_fatura_kalemleri;

-- teknik_raporlar:
-- DROP POLICY IF EXISTS "<ENVANTERDEN_GELEN_POLICY_ADI>" ON public.teknik_raporlar;

-- musteri_talepleri:
-- DROP POLICY IF EXISTS "<ENVANTERDEN_GELEN_POLICY_ADI>" ON public.musteri_talepleri;

-- is_planlari:
-- DROP POLICY IF EXISTS "<ENVANTERDEN_GELEN_POLICY_ADI>" ON public.is_planlari;

-- planli_isler:
-- DROP POLICY IF EXISTS "<ENVANTERDEN_GELEN_POLICY_ADI>" ON public.planli_isler;

-- brokers:
-- DROP POLICY IF EXISTS "<ENVANTERDEN_GELEN_POLICY_ADI>" ON public.brokers;

-- araci_cari_hareketleri:
-- DROP POLICY IF EXISTS "<ENVANTERDEN_GELEN_POLICY_ADI>" ON public.araci_cari_hareketleri;

-- ---------------------------------------------------------------------
-- 2. Yerine uygulanacak tenant policy
-- ---------------------------------------------------------------------
-- Yerine uygulanacak tenant policy seti:
-- db/tenant_rls_staging_dry_run_final.sql
--
-- Sıra:
-- 1. Staging envanter çıktısını al.
-- 2. Fazla izin veren gerçek policy adlarını rls_inventory_analysis.md içine işle.
-- 3. Bu dosyadaki placeholder DROP satırlarını gerçek adlarla doldur.
-- 4. tenant_rls_staging_dry_run_final.sql ile tenant policy'leri uygula.
-- 5. Bu dosyayı staging'de uygula.
-- 6. Negatif testleri çalıştır.

COMMIT;
