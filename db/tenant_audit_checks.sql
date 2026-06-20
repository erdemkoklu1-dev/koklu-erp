-- =====================================================================
-- Tenant Güvenlik Denetim Scripti  (Sprint 1.5)
-- =====================================================================
-- Bu dosya YALNIZCA OKUMA / KONTROL sorguları içerir.
-- Hiçbir satır veri silmez, taşımaz veya güncellemez.
-- RLS aktif etmez, NOT NULL zorlamaz.
--
-- Çalıştırma: Supabase SQL editöründe bölüm bölüm çalıştırılabilir.
-- Beklenen güvenli sonuç: tüm bos_kayit sayıları 0 ve uyumsuzluk
-- sorguları 0 satır döndürmeli.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. firma_id KOLON VARLIĞI KONTROLÜ
-- ---------------------------------------------------------------------
-- Tenant kapsamındaki her tablo gerçekten firma_id taşıyor mu?
-- 'firma_id YOK' dönen tablolar RLS/NOT NULL için HAZIR DEĞİLDİR.
-- (Bilinen eksik: proforma_fatura_kalemleri — tenant_migration.sql yanlış
--  tablo adı 'proforma_kalemleri' hedeflediği için atlanmış olabilir.)
WITH beklenen(tablo) AS (
  VALUES
    ('customers'), ('devices'), ('service_forms'), ('service_form_items'),
    ('invoices'), ('invoice_items'), ('payments'),
    ('teslimatlar'), ('teslimat_kalemleri'),
    ('teklifler'), ('teklif_kalemleri'),
    ('proforma_faturalar'), ('proforma_fatura_kalemleri'),
    ('teknik_raporlar'), ('musteri_talepleri'),
    ('is_planlari'), ('planli_isler'),
    ('brokers'), ('araci_cari_hareketleri'),
    ('invoice_brokers'), ('on_kayitlar'), ('on_kayit_kalemler')
)
SELECT
  b.tablo,
  CASE WHEN to_regclass('public.' || b.tablo) IS NULL THEN 'TABLO YOK'
       WHEN c.column_name IS NOT NULL THEN 'firma_id VAR'
       ELSE 'firma_id YOK'
  END AS durum
FROM beklenen b
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public'
 AND c.table_name = b.tablo
 AND c.column_name = 'firma_id'
ORDER BY durum DESC, b.tablo;


-- ---------------------------------------------------------------------
-- 1. firma_id IS NULL KAYIT KONTROLÜ (dinamik, kolon yoksa atlar)
-- ---------------------------------------------------------------------
-- Tablo veya firma_id kolonu yoksa hata vermeden geçer.
DO $$
DECLARE
  t text;
  n bigint;
  tenant_tables text[] := ARRAY[
    'customers','devices','service_forms','service_form_items',
    'invoices','invoice_items','invoice_brokers',
    'payments','teslimatlar','teslimat_kalemleri','teklifler',
    'teklif_kalemleri','proforma_faturalar','proforma_fatura_kalemleri',
    'teknik_raporlar','musteri_talepleri','is_planlari','planli_isler',
    'brokers','araci_cari_hareketleri','on_kayitlar','on_kayit_kalemler'
  ];
BEGIN
  RAISE NOTICE 'tablo | bos_kayit (firma_id IS NULL)';
  RAISE NOTICE '----------------------------------------';
  FOREACH t IN ARRAY tenant_tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE '% | TABLO YOK', t;
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='firma_id'
    ) THEN
      RAISE NOTICE '% | firma_id KOLONU YOK', t;
      CONTINUE;
    END IF;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE firma_id IS NULL', t) INTO n;
    RAISE NOTICE '% | %', t, n;
  END LOOP;
END $$;

-- Aynı kontrolün tablo (sonuç tablosu) olarak çıktısı — GÖREV 8.1 formatı.
-- NOT: Aşağıdaki tablolardan biri firma_id taşımıyorsa o satırı silin/yorumlayın,
--      aksi halde "column does not exist" hatası alırsınız.
-- SELECT 'customers' AS tablo, COUNT(*) AS bos_kayit FROM public.customers WHERE firma_id IS NULL
-- UNION ALL SELECT 'devices',                 COUNT(*) FROM public.devices                 WHERE firma_id IS NULL
-- UNION ALL SELECT 'service_forms',           COUNT(*) FROM public.service_forms           WHERE firma_id IS NULL
-- UNION ALL SELECT 'service_form_items',      COUNT(*) FROM public.service_form_items      WHERE firma_id IS NULL
-- UNION ALL SELECT 'invoices',                COUNT(*) FROM public.invoices                WHERE firma_id IS NULL
-- UNION ALL SELECT 'invoice_items',           COUNT(*) FROM public.invoice_items           WHERE firma_id IS NULL
-- UNION ALL SELECT 'invoice_brokers',         COUNT(*) FROM public.invoice_brokers         WHERE firma_id IS NULL
-- UNION ALL SELECT 'payments',                COUNT(*) FROM public.payments                WHERE firma_id IS NULL
-- UNION ALL SELECT 'teslimatlar',             COUNT(*) FROM public.teslimatlar             WHERE firma_id IS NULL
-- UNION ALL SELECT 'teslimat_kalemleri',      COUNT(*) FROM public.teslimat_kalemleri      WHERE firma_id IS NULL
-- UNION ALL SELECT 'teklifler',               COUNT(*) FROM public.teklifler               WHERE firma_id IS NULL
-- UNION ALL SELECT 'teklif_kalemleri',        COUNT(*) FROM public.teklif_kalemleri        WHERE firma_id IS NULL
-- UNION ALL SELECT 'proforma_faturalar',      COUNT(*) FROM public.proforma_faturalar      WHERE firma_id IS NULL
-- UNION ALL SELECT 'proforma_fatura_kalemleri', COUNT(*) FROM public.proforma_fatura_kalemleri WHERE firma_id IS NULL
-- UNION ALL SELECT 'teknik_raporlar',         COUNT(*) FROM public.teknik_raporlar         WHERE firma_id IS NULL
-- UNION ALL SELECT 'musteri_talepleri',       COUNT(*) FROM public.musteri_talepleri       WHERE firma_id IS NULL
-- UNION ALL SELECT 'is_planlari',             COUNT(*) FROM public.is_planlari             WHERE firma_id IS NULL
-- UNION ALL SELECT 'planli_isler',            COUNT(*) FROM public.planli_isler            WHERE firma_id IS NULL
-- UNION ALL SELECT 'brokers',                 COUNT(*) FROM public.brokers                 WHERE firma_id IS NULL
-- UNION ALL SELECT 'araci_cari_hareketleri',  COUNT(*) FROM public.araci_cari_hareketleri  WHERE firma_id IS NULL;


-- ---------------------------------------------------------------------
-- 2. ŞUBE–FIRMA UYUMSUZLUĞU
-- ---------------------------------------------------------------------
-- Bir kaydın firma_id'si, bağlı olduğu şubenin firma_id'sinden farklı mı?
-- 0 satır beklenir.

SELECT 'customers' AS tablo, c.id, c.firma_id, c.sube_id, s.firma_id AS sube_firma_id
FROM public.customers c
JOIN public.subeler s ON s.id = c.sube_id
WHERE c.sube_id IS NOT NULL AND c.firma_id IS DISTINCT FROM s.firma_id;

SELECT 'invoices' AS tablo, i.id, i.firma_id, i.sube_id, s.firma_id AS sube_firma_id
FROM public.invoices i
JOIN public.subeler s ON s.id = i.sube_id
WHERE i.sube_id IS NOT NULL AND i.firma_id IS DISTINCT FROM s.firma_id;

SELECT 'teslimatlar' AS tablo, t.id, t.firma_id, t.sube_id, s.firma_id AS sube_firma_id
FROM public.teslimatlar t
JOIN public.subeler s ON s.id = t.sube_id
WHERE t.sube_id IS NOT NULL AND t.firma_id IS DISTINCT FROM s.firma_id;

SELECT 'teklifler' AS tablo, q.id, q.firma_id, q.sube_id, s.firma_id AS sube_firma_id
FROM public.teklifler q
JOIN public.subeler s ON s.id = q.sube_id
WHERE q.sube_id IS NOT NULL AND q.firma_id IS DISTINCT FROM s.firma_id;

SELECT 'service_forms' AS tablo, sf.id, sf.firma_id, sf.sube_id, s.firma_id AS sube_firma_id
FROM public.service_forms sf
JOIN public.subeler s ON s.id = sf.sube_id
WHERE sf.sube_id IS NOT NULL AND sf.firma_id IS DISTINCT FROM s.firma_id;

SELECT 'musteri_talepleri' AS tablo, mt.id, mt.firma_id, mt.sube_id, s.firma_id AS sube_firma_id
FROM public.musteri_talepleri mt
JOIN public.subeler s ON s.id = mt.sube_id
WHERE mt.sube_id IS NOT NULL AND mt.firma_id IS DISTINCT FROM s.firma_id;

SELECT 'is_planlari' AS tablo, ip.id, ip.firma_id, ip.sube_id, s.firma_id AS sube_firma_id
FROM public.is_planlari ip
JOIN public.subeler s ON s.id = ip.sube_id
WHERE ip.sube_id IS NOT NULL AND ip.firma_id IS DISTINCT FROM s.firma_id;


-- ---------------------------------------------------------------------
-- 3. MÜŞTERİ–FIRMA UYUMSUZLUĞU
-- ---------------------------------------------------------------------
-- Bağlı müşterinin firma_id'si kaydın firma_id'sinden farklı mı?
-- 0 satır beklenir.

SELECT 'devices' AS tablo, d.id, d.customer_id, d.firma_id, c.firma_id AS customer_firma_id
FROM public.devices d
JOIN public.customers c ON c.id = d.customer_id
WHERE d.customer_id IS NOT NULL AND d.firma_id IS DISTINCT FROM c.firma_id;

SELECT 'service_forms' AS tablo, sf.id, sf.customer_id, sf.firma_id, c.firma_id AS customer_firma_id
FROM public.service_forms sf
JOIN public.customers c ON c.id = sf.customer_id
WHERE sf.customer_id IS NOT NULL AND sf.firma_id IS DISTINCT FROM c.firma_id;

SELECT 'invoices' AS tablo, i.id, i.customer_id, i.firma_id, c.firma_id AS customer_firma_id
FROM public.invoices i
JOIN public.customers c ON c.id = i.customer_id
WHERE i.customer_id IS NOT NULL AND i.firma_id IS DISTINCT FROM c.firma_id;

SELECT 'teslimatlar' AS tablo, t.id, t.customer_id, t.firma_id, c.firma_id AS customer_firma_id
FROM public.teslimatlar t
JOIN public.customers c ON c.id = t.customer_id
WHERE t.customer_id IS NOT NULL AND t.firma_id IS DISTINCT FROM c.firma_id;

-- teklifler müşteri kolonu: musteri_id
SELECT 'teklifler' AS tablo, q.id, q.musteri_id, q.firma_id, c.firma_id AS customer_firma_id
FROM public.teklifler q
JOIN public.customers c ON c.id = q.musteri_id
WHERE q.musteri_id IS NOT NULL AND q.firma_id IS DISTINCT FROM c.firma_id;


-- ---------------------------------------------------------------------
-- 4. ÇOCUK TABLO – ANA TABLO FIRMA UYUMSUZLUĞU
-- ---------------------------------------------------------------------
-- Kalem satırlarının firma_id'si ana kaydın firma_id'siyle aynı mı?
-- 0 satır beklenir.

SELECT 'invoice_items' AS tablo, it.id, it.firma_id, i.firma_id AS parent_firma_id
FROM public.invoice_items it
JOIN public.invoices i ON i.id = it.invoice_id
WHERE it.firma_id IS DISTINCT FROM i.firma_id;

SELECT 'invoice_brokers' AS tablo, ib.id, ib.firma_id, i.firma_id AS parent_firma_id
FROM public.invoice_brokers ib
JOIN public.invoices i ON i.id = ib.invoice_id
WHERE ib.firma_id IS DISTINCT FROM i.firma_id;

SELECT 'service_form_items' AS tablo, it.id, it.firma_id, sf.firma_id AS parent_firma_id
FROM public.service_form_items it
JOIN public.service_forms sf ON sf.id = it.service_form_id
WHERE it.firma_id IS DISTINCT FROM sf.firma_id;

SELECT 'teklif_kalemleri' AS tablo, tk.id, tk.firma_id, q.firma_id AS parent_firma_id
FROM public.teklif_kalemleri tk
JOIN public.teklifler q ON q.id = tk.teklif_id
WHERE tk.firma_id IS DISTINCT FROM q.firma_id;

SELECT 'teslimat_kalemleri' AS tablo, tek.id, tek.firma_id, t.firma_id AS parent_firma_id
FROM public.teslimat_kalemleri tek
JOIN public.teslimatlar t ON t.id = tek.teslimat_id
WHERE tek.firma_id IS DISTINCT FROM t.firma_id;

SELECT 'proforma_fatura_kalemleri' AS tablo, k.id, k.firma_id, p.firma_id AS parent_firma_id
FROM public.proforma_fatura_kalemleri k
JOIN public.proforma_faturalar p ON p.id = k.proforma_id
WHERE k.firma_id IS DISTINCT FROM p.firma_id;


-- ---------------------------------------------------------------------
-- 5. ARACI CARİ – ARACI FIRMA UYUMSUZLUĞU
-- ---------------------------------------------------------------------
SELECT 'araci_cari_hareketleri' AS tablo, h.id, h.araci_id, h.firma_id, b.firma_id AS broker_firma_id
FROM public.araci_cari_hareketleri h
JOIN public.brokers b ON b.id = h.araci_id
WHERE h.araci_id IS NOT NULL AND h.firma_id IS DISTINCT FROM b.firma_id;
