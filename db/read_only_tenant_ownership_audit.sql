-- ============================================================================
-- KÖKLÜ ERP — TENANT SAHİPLİK / RLS SALT-OKUNUR DENETİMİ
-- ============================================================================
--
-- !!! SALT OKUNUR !!!  Bu dosya hiçbir satır YAZMAZ, DEĞİŞTİRMEZ, SİLMEZ.
--     Tamamı SELECT ve katalog (information_schema / pg_catalog) sorgusudur.
--
-- NEREDE ÇALIŞTIRILIR:
--   * Production Supabase üzerinde ÇALIŞTIRILMAZ (GOREV.md §3).
--   * Yalnızca `node scripts/verify-staging-env.mjs` → exit 0 (Gate 0 GO) ise
--     staging üzerinde çalıştırılır.
--   * Güncel durum: Gate 0 NO-GO ⇒ BU DOSYA HENÜZ ÇALIŞTIRILMAMIŞTIR.
--
-- ÇIKTI DİSİPLİNİ:
--   Hiçbir sorgu hassas satır içeriği (müşteri adı, VKN, tutar, telefon)
--   döndürmez. Yalnızca yapı bilgisi ve SAYIM döner. Sonuçları rapora yazarken
--   de yalnızca sayımlar aktarılır.
--
-- İlgili karar belgesi: docs/tenant_ownership_and_rls_remediation.md
-- ============================================================================

\echo '=== A1. 12 hayalet ad gerçekten var mı? (beklenen: hepsi YOK) ==='
select
  t.beklenen_ad,
  (to_regclass('public.' || quote_ident(t.beklenen_ad)) is not null) as staging_de_var_mi
from (values
  ('backup_history'),
  ('calisanlar'),
  ('gelir_gider_hareketleri'),
  ('hammadde_stok_girisler'),
  ('hatirlatmalar'),
  ('maas_hareketleri'),
  ('musteri_cari_belgeler'),
  ('on_kayit_kalemler'),
  ('proforma_kalemleri'),
  ('sabit_giderler'),
  ('urun_stok_hareketleri'),
  ('vergi_takvimleri')
) as t(beklenen_ad)
order by 1;

\echo '=== A2. Karar belgesinde gerçek karşılık olarak işaretlenen tablolar var mı? ==='
select
  t.gercek_ad,
  (to_regclass('public.' || quote_ident(t.gercek_ad)) is not null) as staging_de_var_mi
from (values
  ('backup_jobs'), ('backup_logs'), ('backup_restores'), ('backup_settings'),
  ('customer_accounts'), ('documents'),
  ('employees'), ('expense_categories'), ('fixed_expenses'),
  ('hatirlatma_kayitlari'), ('hatirlatma_kurallari'),
  ('kullanici_sube_yetkileri'),
  ('maas_odemeleri'), ('mesai_kayitlari'),
  ('performans_degerlendirmeleri'), ('personel_belgeler'), ('personel_izinler'),
  ('proforma_fatura_kalemleri'),
  ('salary_payments'), ('sube_gider_gelir'),
  ('tax_declarations'), ('transactions'),
  ('uretim_hareketleri'), ('urun_stok'), ('yillik_izin_hakki'),
  ('depo_hareketleri'), ('on_kayitlar'), ('personeller')
) as t(gercek_ad)
order by 1;

\echo '=== B1. public şemasındaki her tablo: firma_id kolonu ve NOT NULL durumu ==='
select
  c.relname                                as tablo,
  (a.attname is not null)                  as firma_id_var_mi,
  coalesce(a.attnotnull, false)            as not_null_mu,
  c.relrowsecurity                         as rls_acik_mi,
  c.relforcerowsecurity                    as rls_owner_a_da_zorunlu_mu
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_attribute a
       on a.attrelid = c.oid
      and a.attname  = 'firma_id'
      and a.attnum   > 0
      and not a.attisdropped
where n.nspname = 'public'
  and c.relkind = 'r'
order by (a.attname is null) desc, c.relname;

\echo '=== B2. firma_id foreign key’leri gerçekten firmalar(id) hedefliyor mu? ==='
select
  src.relname       as tablo,
  con.conname       as fk_adi,
  tgt.relname       as hedef_tablo,
  con.confdeltype   as on_delete_kodu   -- r=restrict, a=no action, c=cascade, n=set null
from pg_constraint con
join pg_class src on src.oid = con.conrelid
join pg_class tgt on tgt.oid = con.confrelid
join pg_namespace n on n.oid = src.relnamespace
where n.nspname = 'public'
  and con.contype = 'f'
  and exists (
    select 1
      from unnest(con.conkey) k
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k
     where a.attname = 'firma_id'
  )
order by 1;

\echo '=== B3. firma_id üzerinde index var mı? (RLS filtresi index’siz maliyetlidir) ==='
select
  c.relname as tablo,
  i.relname as index_adi
from pg_index x
join pg_class c on c.oid = x.indrelid
join pg_class i on i.oid = x.indexrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and exists (
    select 1
      from unnest(x.indkey) k
      join pg_attribute a on a.attrelid = c.oid and a.attnum = k
     where a.attname = 'firma_id'
  )
order by 1, 2;

\echo '=== C1. RLS policy envanteri: hangi tabloda hangi komut için policy var? ==='
select
  schemaname,
  tablename,
  policyname,
  cmd            as komut,      -- SELECT / INSERT / UPDATE / DELETE / ALL
  roles          as roller,
  permissive
from pg_policies
where schemaname = 'public'
order by tablename, cmd, policyname;

\echo '=== C2. RLS AÇIK ama HİÇ policy’si olmayan tablolar (erişim tamamen kapalı) ==='
select c.relname as tablo
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity
  and not exists (
    select 1 from pg_policies p
     where p.schemaname = 'public' and p.tablename = c.relname
  )
order by 1;

\echo '=== C3. RLS KAPALI ama firma_id taşıyan tablolar (SIZINTI RİSKİ) ==='
select c.relname as tablo
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid and a.attname = 'firma_id' and not a.attisdropped
where n.nspname = 'public'
  and c.relkind = 'r'
  and not c.relrowsecurity
order by 1;

\echo '=== C4. Hangi komutlar için policy EKSİK? (SELECT/INSERT/UPDATE/DELETE) ==='
select
  c.relname as tablo,
  k.cmd     as eksik_komut
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as k(cmd)
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity
  and not exists (
    select 1 from pg_policies p
     where p.schemaname = 'public'
       and p.tablename = c.relname
       and (p.cmd = k.cmd or p.cmd = 'ALL')
  )
order by 1, 2;

\echo '=== D1. firma_id IS NULL satır SAYILARI (yalnızca sayım, içerik yok) ==='
do $$
declare
  r        record;
  v_count  bigint;
begin
  raise notice 'tablo | firma_id_null_satir_sayisi | toplam_satir';
  for r in
    select c.relname as tablo
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'firma_id' and not a.attisdropped
     where n.nspname = 'public' and c.relkind = 'r'
     order by c.relname
  loop
    execute format(
      'select count(*) filter (where firma_id is null) || '' | '' || count(*) from public.%I',
      r.tablo
    ) into v_count;
    raise notice '% | %', r.tablo, v_count;
  end loop;
end;
$$;

\echo '=== E1. Parent ile child tenant ÇELİŞKİSİ — sayım (0 beklenir) ==='
-- Doğrudan firma_id taşıyan child tablolar için: child.firma_id parent.firma_id
-- ile aynı mı? Aykırı satır varsa migration ÖNCESİ temizlik gerekir.
select 'teslimat_kalemleri' as child, count(*) as celisen_satir
  from public.teslimat_kalemleri k
  join public.teslimatlar t on t.id = k.teslimat_id
 where k.firma_id is distinct from t.firma_id
union all
select 'invoice_items', count(*)
  from public.invoice_items i
  join public.invoices v on v.id = i.invoice_id
 where i.firma_id is distinct from v.firma_id
union all
select 'emanet_takipleri', count(*)
  from public.emanet_takipleri e
  join public.teslimatlar t on t.id = e.teslimat_id
 where e.firma_id is distinct from t.firma_id
union all
select 'geri_teslim_takipleri', count(*)
  from public.geri_teslim_takipleri g
  join public.teslimatlar t on t.id = g.teslimat_id
 where g.firma_id is distinct from t.firma_id
union all
select 'teklif_kalemleri', count(*)
  from public.teklif_kalemleri k
  join public.teklifler t on t.id = k.teklif_id
 where k.firma_id is distinct from t.firma_id
union all
select 'proforma_fatura_kalemleri', count(*)
  from public.proforma_fatura_kalemleri k
  join public.proforma_faturalar p on p.id = k.proforma_id
 where k.firma_id is distinct from p.firma_id;

\echo '=== E2. Parent ZİNCİRİ üzerinden tenant’ı BULUNAMAYAN child satırlar (sayım) ==='
-- Bu satırlar için migration backfill YAPAMAZ; kontrollü blokaj raporlanır.
select 'urun_stok (urunler)' as child, count(*) as tenanti_belirsiz
  from public.urun_stok s
  left join public.urunler u on u.id = s.urun_id
 where u.id is null or u.firma_id is null
union all
select 'customer_accounts (customers)', count(*)
  from public.customer_accounts a
  left join public.customers c on c.id = a.customer_id
 where c.id is null or c.firma_id is null
union all
select 'documents (customers|invoices|payments)', count(*)
  from public.documents d
 where not exists (select 1 from public.customers c where c.id = d.customer_id and c.firma_id is not null)
   and not exists (select 1 from public.invoices  i where i.id = d.invoice_id  and i.firma_id is not null)
   and not exists (select 1 from public.payments  p where p.id = d.payment_id  and p.firma_id is not null)
union all
select 'hatirlatma_kayitlari (customers)', count(*)
  from public.hatirlatma_kayitlari h
 where not exists (select 1 from public.customers c where c.id = h.musteri_id and c.firma_id is not null)
union all
select 'sube_gider_gelir (subeler)', count(*)
  from public.sube_gider_gelir g
  left join public.subeler s on s.id = g.sube_id
 where s.id is null or s.firma_id is null
union all
select 'uretim_hareketleri (uretim_emirleri)', count(*)
  from public.uretim_hareketleri h
  left join public.uretim_emirleri e on e.id = h.uretim_emri_id
 where e.id is null or e.firma_id is null
union all
select 'maas_odemeleri (personeller)', count(*)
  from public.maas_odemeleri m
  left join public.personeller p on p.id = m.personel_id
 where p.id is null or p.firma_id is null
union all
select 'kullanici_sube_yetkileri (subeler)', count(*)
  from public.kullanici_sube_yetkileri y
  left join public.subeler s on s.id = y.sube_id
 where s.id is null or s.firma_id is null;

\echo '=== F1. Kaç firma var? (tek-firma guard backfill’i için belirleyici) ==='
select count(*) as firma_sayisi from public.firmalar;

\echo '=== F2. Tenant’ı hiçbir güvenilir parent’tan türetilemeyen tablolar — satır sayımı ==='
-- Bu tablolar karar belgesinde "Belirsiz" sınıfındadır. Sayım, tek-firma guard
-- backfill’inin kaç satırı etkileyeceğini gösterir.
select 'employees'          as tablo, count(*) as satir from public.employees
union all select 'salary_payments',   count(*) from public.salary_payments
union all select 'transactions',      count(*) from public.transactions
union all select 'fixed_expenses',    count(*) from public.fixed_expenses
union all select 'expense_categories',count(*) from public.expense_categories
union all select 'tax_declarations',  count(*) from public.tax_declarations
union all select 'giris_kayitlari',   count(*) from public.giris_kayitlari
union all select 'backup_jobs',       count(*) from public.backup_jobs
union all select 'backup_logs',       count(*) from public.backup_logs
union all select 'backup_restores',   count(*) from public.backup_restores
union all select 'backup_settings',   count(*) from public.backup_settings
union all select 'hatirlatma_kurallari', count(*) from public.hatirlatma_kurallari;

\echo '=== G1. SECURITY DEFINER fonksiyonlarının search_path sabitlemesi var mı? ==='
select
  p.proname                                            as fonksiyon,
  p.prosecdef                                          as security_definer_mi,
  coalesce(array_to_string(p.proconfig, ', '), '(yok)') as ayarlar
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
order by 1;

\echo '=== G2. PUBLIC’e açık kalmış fonksiyon execute yetkileri ==='
select
  p.proname as fonksiyon,
  'PUBLIC'  as rol
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and has_function_privilege('public', p.oid, 'execute')
order by 1;

\echo '=== DENETİM SONU — hiçbir satır yazılmadı ==='
