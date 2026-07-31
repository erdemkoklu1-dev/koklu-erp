-- ============================================================================
-- KÖKLÜ ERP — OLASI KALEM KAYBI TESPİT SORGULARI (SALT OKUNUR)
-- ============================================================================
--
-- !!! BU DOSYA PRODUCTION'DA OTOMATİK ÇALIŞTIRILMAZ !!!
--
--  * Dosya YALNIZCA `SELECT` içerir. INSERT/UPDATE/DELETE/ALTER/DROP yoktur.
--  * Yine de production'da elle ve bilinçli olarak, tercihen okuma replikasında
--    çalıştırılmalıdır.
--  * Bu sorgular TESPİT içindir. Veri KURTARMA ayrı bir görevdir ve
--    kullanıcı onayı + doğrulanmış backup gerektirir.
--  * Kaybolan veri TAHMİN EDİLEREK yeniden oluşturulmaz.
--
-- Arka plan: aşağıdaki akışlar kalemleri "önce sil, sonra yeniden ekle"
-- biçiminde güncelliyordu. Silme başarılı olup ekleme başarısız olduğunda
-- (ağ kesintisi, RLS reddi, sekme kapatma, validation hatası) üst kayıt
-- kalemsiz kalıyordu:
--   - src/app/(dashboard)/fiyat-teklifleri/[id]/duzenle/DuzenleTeklifClient.tsx
--   - src/app/(dashboard)/service-forms/[id]/edit/EditServiceFormClient.tsx
--   - src/app/(dashboard)/fiyat-teklifleri/proforma/ProformaFormClient.tsx
--   - src/lib/teslimatlar.ts (updateTeslimat)
--
-- Beklenen kanıt deseni: üst kayıtta tutar > 0 olmasına rağmen hiç kalem yok.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. FİYAT TEKLİFLERİ — tutarı olan ama kalemi olmayan teklifler
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
    'teklifler'                       AS modul,
    t.id,
    t.teklif_no,
    t.tarih,
    t.durum,
    t.ara_toplam,
    t.genel_toplam,
    t.created_at
FROM public.teklifler t
LEFT JOIN public.teklif_kalemleri k ON k.teklif_id = t.id
WHERE k.id IS NULL
  AND COALESCE(t.genel_toplam, 0) > 0
ORDER BY t.created_at DESC;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. SERVİS FORMLARI — cihaz satırı hiç olmayan formlar
--    (Yeni açılmış boş form da bu listeye düşebilir; `created_at` ile ayırın.)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
    'service_forms'                   AS modul,
    sf.id,
    sf.service_date,
    sf.technician_name,
    sf.created_at
FROM public.service_forms sf
LEFT JOIN public.service_form_items i ON i.service_form_id = sf.id
WHERE i.id IS NULL
ORDER BY sf.created_at DESC;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. PROFORMA FATURALAR — tutarı olan ama kalemi olmayan proformalar
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
    'proforma_faturalar'              AS modul,
    p.id,
    p.proforma_no,
    p.tarih,
    p.durum,
    p.ara_toplam,
    p.toplam_tutar,
    p.created_at,
    p.updated_at
FROM public.proforma_faturalar p
LEFT JOIN public.proforma_fatura_kalemleri k ON k.proforma_id = p.id
WHERE k.id IS NULL
  AND COALESCE(p.toplam_tutar, 0) > 0
ORDER BY p.created_at DESC;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. FATURALAR — tutarı olan ama kalemi olmayan faturalar
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
    'invoices'                        AS modul,
    inv.id,
    inv.invoice_number,
    inv.invoice_date,
    inv.invoice_type,
    inv.subtotal,
    inv.total_amount,
    inv.created_at
FROM public.invoices inv
LEFT JOIN public.invoice_items it ON it.invoice_id = inv.id
WHERE it.id IS NULL
  AND COALESCE(inv.total_amount, 0) > 0
ORDER BY inv.created_at DESC;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. TESLİMATLAR — kalemi olmayan teslimatlar
--    `updateTeslimat` stok hareketlerini de geri alıp kalemleri siliyordu;
--    bu listedeki kayıtlar için stok etkisi de ayrıca incelenmelidir.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
    'teslimatlar'                     AS modul,
    d.id,
    d.teslimat_no,
    d.teslimat_tarihi,
    d.durum,
    d.created_at,
    d.updated_at
FROM public.teslimatlar d
LEFT JOIN public.teslimat_kalemleri dk ON dk.teslimat_id = d.id
WHERE dk.id IS NULL
ORDER BY d.created_at DESC;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ÖZET SAYIM — hangi modülde kaç şüpheli kayıt var
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'teklifler_kalemsiz' AS kontrol, COUNT(*)::text AS adet
FROM public.teklifler t
LEFT JOIN public.teklif_kalemleri k ON k.teklif_id = t.id
WHERE k.id IS NULL AND COALESCE(t.genel_toplam, 0) > 0

UNION ALL SELECT 'service_forms_satirsiz', COUNT(*)::text
FROM public.service_forms sf
LEFT JOIN public.service_form_items i ON i.service_form_id = sf.id
WHERE i.id IS NULL

UNION ALL SELECT 'proforma_kalemsiz', COUNT(*)::text
FROM public.proforma_faturalar p
LEFT JOIN public.proforma_fatura_kalemleri k ON k.proforma_id = p.id
WHERE k.id IS NULL AND COALESCE(p.toplam_tutar, 0) > 0

UNION ALL SELECT 'invoices_kalemsiz', COUNT(*)::text
FROM public.invoices inv
LEFT JOIN public.invoice_items it ON it.invoice_id = inv.id
WHERE it.id IS NULL AND COALESCE(inv.total_amount, 0) > 0

UNION ALL SELECT 'teslimatlar_kalemsiz', COUNT(*)::text
FROM public.teslimatlar d
LEFT JOIN public.teslimat_kalemleri dk ON dk.teslimat_id = d.id
WHERE dk.id IS NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. TOPLAM TUTARSIZLIĞI — üst kayıt toplamı ile kalem toplamı uyuşmuyor
--    Kısmi kalem kaybının izi olabilir (bazı kalemler silinmiş, üst toplam eski).
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
    'teklifler_toplam_uyusmazligi'    AS kontrol,
    t.id,
    t.teklif_no,
    t.ara_toplam                      AS ust_kayit_ara_toplam,
    COALESCE(SUM(k.toplam), 0)        AS kalem_toplami,
    t.ara_toplam - COALESCE(SUM(k.toplam), 0) AS fark
FROM public.teklifler t
LEFT JOIN public.teklif_kalemleri k ON k.teklif_id = t.id
GROUP BY t.id, t.teklif_no, t.ara_toplam
HAVING ABS(t.ara_toplam - COALESCE(SUM(k.toplam), 0)) > 0.02
ORDER BY ABS(t.ara_toplam - COALESCE(SUM(k.toplam), 0)) DESC;


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. TENANT DRIFT — kalem firma_id'si üst kayıtla uyuşmuyor / boş
--    `proforma_fatura_kalemleri` bu sorguda hata verirse kolon henüz yoktur:
--    bkz. db/aggregate_atomic_update_rpc.sql bölüm 2.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'teklif_kalemleri_firma_drift' AS kontrol, COUNT(*)::text AS adet
FROM public.teklif_kalemleri k
JOIN public.teklifler t ON t.id = k.teklif_id
WHERE k.firma_id IS DISTINCT FROM t.firma_id

UNION ALL SELECT 'service_form_items_firma_drift', COUNT(*)::text
FROM public.service_form_items i
JOIN public.service_forms sf ON sf.id = i.service_form_id
WHERE i.firma_id IS DISTINCT FROM sf.firma_id

UNION ALL SELECT 'invoice_items_firma_drift', COUNT(*)::text
FROM public.invoice_items it
JOIN public.invoices inv ON inv.id = it.invoice_id
WHERE it.firma_id IS DISTINCT FROM inv.firma_id;
