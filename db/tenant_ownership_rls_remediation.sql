-- ============================================================================
-- KÖKLÜ ERP — TENANT SAHİPLİK / RLS REMEDIATION (forward-only)
-- ============================================================================
--
-- !!! BU DOSYA OTOMATİK OLARAK ÇALIŞTIRILMAZ !!!
--
--  * Production Supabase üzerinde ÇALIŞTIRILMAZ.
--  * Staging env doğrulaması PASS olmadan staging üzerinde de ÇALIŞTIRILMAZ.
--    Güncel durum: `node scripts/verify-staging-env.mjs` → exit 1 (NO-GO)
--    ⇒ BU MIGRATION HENÜZ HİÇBİR ORTAMDA APPLY EDİLMEMİŞTİR.
--
--  * ÖNCE `db/read_only_tenant_ownership_audit.sql` çalıştırılmalı ve sonuçları
--    `docs/tenant_ownership_and_rls_remediation.md` içindeki "migration öncesi"
--    tablosuna yazılmalıdır. Denetim çıktısı olmadan bu migration APPLY EDİLMEZ.
--
-- FORWARD-ONLY: `db/tenant_migration.sql` dâhil hiçbir tarihî migration dosyası
-- DEĞİŞTİRİLMEZ. Oradaki hatalı tablo listesi geçmişte uygulanmış olabilir;
-- düzeltme yalnızca ileri yönlü olarak burada yapılır.
--
-- ── ÇÖZÜLEN AÇIK ────────────────────────────────────────────────────────────
-- `db/tenant_migration.sql` içindeki `tenant_tables` dizisi 12 tane var olmayan
-- tablo adı içeriyordu. O döngü `if to_regclass(...) is not null` ile korunduğu
-- için bu adlar SESSİZCE atlandı: hedeflenen `firma_id` kolonu hiç eklenmedi.
-- Asıl risk hayalet adların kendisi değil, o adların temsil ettiği alanlardaki
-- GERÇEK tabloların listede hiç bulunmamasıdır (finans, İK, hatırlatma, belge,
-- yedekleme modülleri). Kanıt ve tam eşleme tablosu:
--     docs/tenant_ownership_and_rls_remediation.md
--
-- ── SINIFLANDIRMA (uydurma YOK, FK kanıtına dayanır) ────────────────────────
--   §3  Parent-owned child : tenant güvenilir parent FK'sinden TÜRETİLİR.
--                            Yinelenen `firma_id` kolonu EKLENMEZ; RLS `EXISTS`
--                            ile parent üzerinden kurulur.
--   §4  Doğrudan tenant-owned : güvenilir parent yoktur; `firma_id` eklenir.
--                            Backfill YALNIZCA tek firma varsa yapılır; aksi
--                            hâlde satırlar NULL bırakılır ve §5'teki
--                            remediation raporuna yazılır. Rastgele/isim
--                            benzerliğine dayalı atama HİÇBİR KOŞULDA yapılmaz.
--   §6  Global/reference   : `roller`, `rol_yetkileri`, `modul_izinleri`,
--                            `kullanici_rolleri` tenant'a ait DEĞİLDİR ve bu
--                            migration kapsamı DIŞINDADIR (bkz. karar belgesi).
--
-- Geri alma: dosyanın en altındaki ROLLBACK bloğu (otomatik ÇALIŞMAZ).
-- ============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ÖN KOŞULLAR — eksikse sessizce devam ETMEZ
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if to_regclass('public.firmalar') is null
     or to_regclass('public.kullanici_profiller') is null then
    raise exception
      'BAĞIMLILIK EKSİK: önce db/tenant_migration.sql apply edilmelidir.';
  end if;

  if to_regproc('public.current_firma_id') is null
     or to_regproc('public.is_super_admin') is null then
    raise exception
      'BAĞIMLILIK EKSİK: public.current_firma_id() / public.is_super_admin() bulunamadı.';
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. REMEDIATION BULGU DEFTERİ
--    Tenant'ı güvenle belirlenemeyen satırlar SESSİZCE atanmaz; buraya yazılır
--    ve operatör kararına bırakılır (GOREV.md §7 "kontrollü hata veya açık
--    remediation raporu").
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.tenant_remediation_findings (
  id           uuid primary key default gen_random_uuid(),
  tablo_adi    text not null,
  bulgu_tipi   text not null,
  satir_sayisi bigint not null default 0,
  aciklama     text,
  created_at   timestamptz not null default now()
);

alter table public.tenant_remediation_findings enable row level security;

comment on table public.tenant_remediation_findings is
  'Tenant remediation sırasında sahibi güvenle belirlenemeyen satırların sayımı. Hassas içerik TUTULMAZ.';

-- Aynı migration tekrar çalıştırılırsa eski bulgular birikmez.
delete from public.tenant_remediation_findings;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. PARENT-OWNED CHILD TABLOLARI
--
--    Bu tablolara `firma_id` EKLENMEZ. Tenant, NOT NULL bir FK üzerinden
--    parent'tan türetilir; yinelenen kolon iki kaynak arasında tutarsızlık
--    (drift) riski yaratırdı.
--
--    Politika kalıbı — her komut için AYRI policy (SELECT/INSERT/UPDATE/DELETE):
--      public.is_super_admin() OR EXISTS (parent WHERE parent.id = child.fk
--                                          AND parent.firma_id = current_firma_id())
--
--    `current_firma_id()` oturum kullanıcısının profilinden türetilir; istemci
--    tarafından gönderilen hiçbir değer yetki kanıtı DEĞİLDİR.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  r         record;
  v_pred    text;
  -- child tablo | fk kolonu | parent tablo
  v_children text[][] := array[
    array['urun_stok',                    'urun_id',         'urunler'],
    array['customer_accounts',            'customer_id',     'customers'],
    array['hatirlatma_kayitlari',         'musteri_id',      'customers'],
    array['sube_gider_gelir',             'sube_id',         'subeler'],
    array['kullanici_sube_yetkileri',     'sube_id',         'subeler'],
    array['uretim_hareketleri',           'uretim_emri_id',  'uretim_emirleri'],
    array['maas_odemeleri',               'personel_id',     'personeller'],
    array['mesai_kayitlari',              'personel_id',     'personeller'],
    array['personel_belgeler',            'personel_id',     'personeller'],
    array['personel_izinler',             'personel_id',     'personeller'],
    array['performans_degerlendirmeleri', 'personel_id',     'personeller'],
    array['yillik_izin_hakki',            'personel_id',     'personeller']
  ];
  i int;
begin
  for i in 1 .. array_length(v_children, 1) loop
    if to_regclass(format('public.%I', v_children[i][1])) is null then
      insert into public.tenant_remediation_findings (tablo_adi, bulgu_tipi, aciklama)
      values (v_children[i][1], 'tablo_yok',
              'Karar belgesinde beklenen child tablo bu şemada bulunamadı; policy kurulmadı.');
      continue;
    end if;
    if to_regclass(format('public.%I', v_children[i][3])) is null then
      insert into public.tenant_remediation_findings (tablo_adi, bulgu_tipi, aciklama)
      values (v_children[i][1], 'parent_yok',
              format('Parent tablo %s bulunamadı; tenant türetilemez.', v_children[i][3]));
      continue;
    end if;

    v_pred := format(
      'public.is_super_admin() or exists (select 1 from public.%I p where p.id = %I.%I and p.firma_id = public.current_firma_id())',
      v_children[i][3], v_children[i][1], v_children[i][2]
    );

    execute format('alter table public.%I enable row level security', v_children[i][1]);

    -- Eski, izin veren (permissive/tenant'sız) policy'ler bırakılmaz.
    for r in
      select policyname from pg_policies
       where schemaname = 'public' and tablename = v_children[i][1]
         and policyname like '%\_tenant\_%'
    loop
      execute format('drop policy if exists %I on public.%I', r.policyname, v_children[i][1]);
    end loop;

    execute format(
      'create policy %I on public.%I for select to authenticated using (%s)',
      v_children[i][1] || '_tenant_select', v_children[i][1], v_pred);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (%s)',
      v_children[i][1] || '_tenant_insert', v_children[i][1], v_pred);
    execute format(
      'create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
      v_children[i][1] || '_tenant_update', v_children[i][1], v_pred, v_pred);
    -- DELETE ayrı düşünülür: child silme de aynı sahiplik kanıtını gerektirir.
    execute format(
      'create policy %I on public.%I for delete to authenticated using (%s)',
      v_children[i][1] || '_tenant_delete', v_children[i][1], v_pred);
  end loop;
end;
$$;

-- ── 3b. `documents`: tenant üç FARKLI nullable parent'tan gelebilir ──────────
--    (customer_id | invoice_id | payment_id). Hiçbiri dolu değilse satırın
--    tenant'ı YOKTUR; bu satırlar hiçbir authenticated kullanıcıya görünmez
--    (yalnızca service-role bakım yolundan erişilebilir) ve §5'te sayılır.

do $$
declare
  v_pred text;
begin
  if to_regclass('public.documents') is null then
    return;
  end if;

  v_pred := $pred$
    public.is_super_admin()
    or exists (select 1 from public.customers c where c.id = documents.customer_id and c.firma_id = public.current_firma_id())
    or exists (select 1 from public.invoices  i where i.id = documents.invoice_id  and i.firma_id = public.current_firma_id())
    or exists (select 1 from public.payments  p where p.id = documents.payment_id  and p.firma_id = public.current_firma_id())
  $pred$;

  alter table public.documents enable row level security;

  drop policy if exists documents_tenant_select on public.documents;
  drop policy if exists documents_tenant_insert on public.documents;
  drop policy if exists documents_tenant_update on public.documents;
  drop policy if exists documents_tenant_delete on public.documents;

  execute format('create policy documents_tenant_select on public.documents for select to authenticated using (%s)', v_pred);
  execute format('create policy documents_tenant_insert on public.documents for insert to authenticated with check (%s)', v_pred);
  execute format('create policy documents_tenant_update on public.documents for update to authenticated using (%s) with check (%s)', v_pred, v_pred);
  execute format('create policy documents_tenant_delete on public.documents for delete to authenticated using (%s)', v_pred);
end;
$$;

-- ── 3c. `backup_logs`: parent `backup_jobs` üzerinden ────────────────────────
--    `backup_jobs` §4'te doğrudan tenant-owned hâline gelir; log satırı da onu
--    izler. Zincir bu sırayla kurulmalıdır.

do $$
declare
  v_pred text;
begin
  if to_regclass('public.backup_logs') is null or to_regclass('public.backup_jobs') is null then
    return;
  end if;

  v_pred := 'public.is_super_admin() or exists (select 1 from public.backup_jobs j where j.id = backup_logs.job_id and j.firma_id = public.current_firma_id())';

  alter table public.backup_logs enable row level security;
  drop policy if exists backup_logs_tenant_select on public.backup_logs;
  drop policy if exists backup_logs_tenant_insert on public.backup_logs;
  execute format('create policy backup_logs_tenant_select on public.backup_logs for select to authenticated using (%s)', v_pred);
  execute format('create policy backup_logs_tenant_insert on public.backup_logs for insert to authenticated with check (%s)', v_pred);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. DOĞRUDAN TENANT-OWNED TABLOLAR
--
--    Bu tabloların hiçbir güvenilir tenant parent'ı yoktur (FK denetimi:
--    `db/read_only_tenant_ownership_audit.sql` §A2/§F2). `firma_id` kolonu
--    eklenir; index kurulur; FK `firmalar(id)`ye bağlanır.
--
--    NOT NULL BU MIGRATION'DA ZORLANMAZ: backfill güvence altına alınmadan
--    NOT NULL koymak, mevcut satırları olan bir veritabanında migration'ı
--    kırar. Sıkılaştırma, staging doğrulaması sonrası AYRI bir forward
--    migration'ın işidir (karar belgesi §7).
--
--    Kolonlar bilinçli olarak DİNAMİK DEĞİL, açık `alter table` ifadeleriyle
--    eklenir: hem okunabilir hem de `scripts/db-schema-source.mjs` tarafından
--    doğru ayrıştırılır (dinamik `array[...]` döngüsü yanlış tabloya kolon
--    atfedilmesine yol açabiliyordu — bu drift'in ta kendisiydi).
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.employees
  add column if not exists firma_id uuid references public.firmalar(id) on delete restrict;
alter table public.salary_payments
  add column if not exists firma_id uuid references public.firmalar(id) on delete restrict;
alter table public.transactions
  add column if not exists firma_id uuid references public.firmalar(id) on delete restrict;
alter table public.fixed_expenses
  add column if not exists firma_id uuid references public.firmalar(id) on delete restrict;
alter table public.expense_categories
  add column if not exists firma_id uuid references public.firmalar(id) on delete restrict;
alter table public.tax_declarations
  add column if not exists firma_id uuid references public.firmalar(id) on delete restrict;
alter table public.giris_kayitlari
  add column if not exists firma_id uuid references public.firmalar(id) on delete restrict;
alter table public.backup_jobs
  add column if not exists firma_id uuid references public.firmalar(id) on delete restrict;
alter table public.backup_restores
  add column if not exists firma_id uuid references public.firmalar(id) on delete restrict;
alter table public.backup_settings
  add column if not exists firma_id uuid references public.firmalar(id) on delete restrict;
alter table public.hatirlatma_kurallari
  add column if not exists firma_id uuid references public.firmalar(id) on delete restrict;

create index if not exists employees_firma_id_idx            on public.employees(firma_id);
create index if not exists salary_payments_firma_id_idx      on public.salary_payments(firma_id);
create index if not exists transactions_firma_id_idx         on public.transactions(firma_id);
create index if not exists fixed_expenses_firma_id_idx       on public.fixed_expenses(firma_id);
create index if not exists expense_categories_firma_id_idx   on public.expense_categories(firma_id);
create index if not exists tax_declarations_firma_id_idx     on public.tax_declarations(firma_id);
create index if not exists giris_kayitlari_firma_id_idx      on public.giris_kayitlari(firma_id);
create index if not exists backup_jobs_firma_id_idx          on public.backup_jobs(firma_id);
create index if not exists backup_restores_firma_id_idx      on public.backup_restores(firma_id);
create index if not exists backup_settings_firma_id_idx      on public.backup_settings(firma_id);
create index if not exists hatirlatma_kurallari_firma_id_idx on public.hatirlatma_kurallari(firma_id);

-- ── 4b. KANITLI BACKFILL ────────────────────────────────────────────────────
--    Önce güvenilir FK zincirinden türetilebilenler doldurulur.
--    `salary_payments` → `employees` bağı vardır ama `employees`in kendisinin
--    tenant'ı da bilinmez; bu yüzden zincir ancak §4c'den sonra anlam kazanır.
--    Sıralama bu yüzden önemlidir ve aşağıda korunmuştur.

-- `backup_jobs` / `backup_restores`: kaydı oluşturan kullanıcının profili
-- güvenilir bir tenant kaynağıdır (auth.users → kullanici_profiller.firma_id).
update public.backup_jobs j
   set firma_id = kp.firma_id
  from public.kullanici_profiller kp
 where kp.id = j.created_by
   and j.firma_id is null
   and kp.firma_id is not null;

update public.backup_restores r
   set firma_id = kp.firma_id
  from public.kullanici_profiller kp
 where kp.id = r.requested_by
   and r.firma_id is null
   and kp.firma_id is not null;

update public.backup_settings s
   set firma_id = kp.firma_id
  from public.kullanici_profiller kp
 where kp.id = s.updated_by
   and s.firma_id is null
   and kp.firma_id is not null;

-- `transactions`: faturaya bağlıysa faturanın firmasını devralır.
update public.transactions t
   set firma_id = i.firma_id
  from public.invoices i
 where i.id = t.invoice_id
   and t.firma_id is null
   and i.firma_id is not null;

-- `hatirlatma_kurallari`: şablona bağlıysa şablonun firmasını devralır.
update public.hatirlatma_kurallari k
   set firma_id = s.firma_id
  from public.hatirlatma_sablonlari s
 where s.id = k.sablon_id
   and k.firma_id is null
   and s.firma_id is not null;

-- ── 4c. TEK-FİRMA GUARD BACKFILL ────────────────────────────────────────────
--    Kalan satırların tenant'ı hiçbir FK'den türetilemez. Bunları rastgele
--    atamak YASAKTIR. Tek istisna KANITLANABİLİR durumdur: veritabanında
--    yalnızca BİR firma varsa, her satırın o firmaya ait olduğu bir tahmin
--    değil, mantıksal zorunluluktur.
--
--    Birden fazla firma varsa: HİÇBİR ATAMA YAPILMAZ, satırlar NULL kalır ve
--    bulgu defterine sayımıyla yazılır. RLS bu satırları hiçbir tenant'a
--    göstermez (fail-closed).

do $$
declare
  v_firma_sayisi int;
  v_tek_firma    uuid;
  v_tablo        text;
  v_kalan        bigint;
  v_tablolar     text[] := array[
    'employees', 'salary_payments', 'transactions', 'fixed_expenses',
    'expense_categories', 'tax_declarations', 'giris_kayitlari',
    'backup_jobs', 'backup_restores', 'backup_settings', 'hatirlatma_kurallari'
  ];
begin
  select count(*) into v_firma_sayisi from public.firmalar;

  if v_firma_sayisi = 1 then
    select id into v_tek_firma from public.firmalar;
  end if;

  foreach v_tablo in array v_tablolar loop
    if v_firma_sayisi = 1 then
      execute format('update public.%I set firma_id = %L where firma_id is null', v_tablo, v_tek_firma);
    end if;

    execute format('select count(*) from public.%I where firma_id is null', v_tablo) into v_kalan;

    if v_kalan > 0 then
      insert into public.tenant_remediation_findings (tablo_adi, bulgu_tipi, satir_sayisi, aciklama)
      values (
        v_tablo,
        'tenant_belirlenemedi',
        v_kalan,
        format(
          'Satırların tenant’ı güvenilir bir FK zincirinden türetilemedi ve veritabanında %s firma var (tek-firma guard uygulanamadı). Satırlar NULL bırakıldı; RLS bunları hiçbir tenant’a göstermez. Operatör kararı gerekir.',
          v_firma_sayisi
        )
      );
    end if;
  end loop;
end;
$$;

-- ── 4d. §4 TABLOLARI İÇİN RLS ───────────────────────────────────────────────
--    `firma_id is null` satırlar bilinçli olarak HİÇBİR tenant'a görünmez
--    (fail-closed): `null = current_firma_id()` daima NULL ⇒ policy geçmez.

do $$
declare
  r      record;
  v_tablo text;
  v_pred text := 'public.is_super_admin() or firma_id = public.current_firma_id()';
  v_tablolar text[] := array[
    'employees', 'salary_payments', 'transactions', 'fixed_expenses',
    'expense_categories', 'tax_declarations', 'giris_kayitlari',
    'backup_jobs', 'backup_restores', 'backup_settings', 'hatirlatma_kurallari',
    'proforma_fatura_kalemleri'
  ];
begin
  foreach v_tablo in array v_tablolar loop
    if to_regclass(format('public.%I', v_tablo)) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', v_tablo);

    for r in
      select policyname from pg_policies
       where schemaname = 'public' and tablename = v_tablo
         and policyname like '%\_tenant\_%'
    loop
      execute format('drop policy if exists %I on public.%I', r.policyname, v_tablo);
    end loop;

    execute format('create policy %I on public.%I for select to authenticated using (%s)',
                   v_tablo || '_tenant_select', v_tablo, v_pred);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)',
                   v_tablo || '_tenant_insert', v_tablo, v_pred);
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
                   v_tablo || '_tenant_update', v_tablo, v_pred, v_pred);
    execute format('create policy %I on public.%I for delete to authenticated using (%s)',
                   v_tablo || '_tenant_delete', v_tablo, v_pred);
  end loop;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. PARENT ↔ CHILD TENANT ÇELİŞKİSİ RAPORU
--    Doğrudan `firma_id` taşıyan child'lar için parent ile uyuşmazlık sessizce
--    DÜZELTİLMEZ; yalnızca sayılır. Otomatik düzeltme yanlış tarafı ezebilir.
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.tenant_remediation_findings (tablo_adi, bulgu_tipi, satir_sayisi, aciklama)
select 'teslimat_kalemleri', 'parent_child_celiskisi', count(*),
       'child.firma_id ile parent teslimatın firma_id değeri farklı. Otomatik düzeltilmedi.'
  from public.teslimat_kalemleri k
  join public.teslimatlar t on t.id = k.teslimat_id
 where k.firma_id is distinct from t.firma_id
having count(*) > 0;

insert into public.tenant_remediation_findings (tablo_adi, bulgu_tipi, satir_sayisi, aciklama)
select 'invoice_items', 'parent_child_celiskisi', count(*),
       'child.firma_id ile parent faturanın firma_id değeri farklı. Otomatik düzeltilmedi.'
  from public.invoice_items i
  join public.invoices v on v.id = i.invoice_id
 where i.firma_id is distinct from v.firma_id
having count(*) > 0;

insert into public.tenant_remediation_findings (tablo_adi, bulgu_tipi, satir_sayisi, aciklama)
select 'proforma_fatura_kalemleri', 'parent_child_celiskisi', count(*),
       'child.firma_id ile parent proformanın firma_id değeri farklı. Otomatik düzeltilmedi.'
  from public.proforma_fatura_kalemleri k
  join public.proforma_faturalar p on p.id = k.proforma_id
 where k.firma_id is distinct from p.firma_id
having count(*) > 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. KAPSAM DIŞI BIRAKILANLAR — bilinçli ve belgeli
--
--   * `roller`, `rol_yetkileri`, `modul_izinleri`, `kullanici_rolleri`:
--     global/reference. Tenant'a ait değildir; RBAC modeli ayrı bir karardır.
--   * `firmalar`: tenant kökü.
--   * `customers`, `devices`, `service_forms`, `service_form_items`:
--     CREATE TABLE kaynağı repoda YOK. Kolon/kısıt varsayımı yapılmadan
--     bu tablolara dokunulmaz (GOREV.md §11). `npm run db:types:check` bu
--     boşluğu açık blokaj olarak raporlar.
--   * NOT NULL sıkılaştırması: ancak backfill staging'de doğrulandıktan sonra,
--     ayrı bir forward migration ile.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. UYGULAMA SONRASI DOĞRULAMA (operatör bu çıktıyı rapora yazar)
-- ─────────────────────────────────────────────────────────────────────────────

\echo '=== Remediation bulguları (0 satır beklenir) ==='
select tablo_adi, bulgu_tipi, satir_sayisi, aciklama
  from public.tenant_remediation_findings
 order by bulgu_tipi, tablo_adi;

commit;

-- ============================================================================
-- ROLLBACK PLANI  (otomatik ÇALIŞMAZ — bilinçli ve ayrı çalıştırılır)
-- ============================================================================
-- DİKKAT: Bu rollback tenant izolasyonunu GERİ AÇAR. Yalnızca migration
-- uygulamanın çalışmasını bozduysa ve acil geri dönüş gerekiyorsa kullanılır.
--
-- Policy'ler düşürülebilir; `firma_id` KOLONLARI VERİ TAŞIR ve düşürülürse
-- backfill edilmiş sahiplik bilgisi KAYBOLUR — bu yüzden yorumda bırakılmıştır.
--
-- begin;
--   -- §3 / §4 policy'leri:
--   -- do $$
--   -- declare r record;
--   -- begin
--   --   for r in select schemaname, tablename, policyname from pg_policies
--   --             where schemaname = 'public' and policyname like '%\_tenant\_%'
--   --   loop
--   --     execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
--   --   end loop;
--   -- end; $$;
--
--   -- ⚠ VERİ KAYBI — yalnızca bilinçli kararla:
--   -- alter table public.employees          drop column if exists firma_id;
--   -- alter table public.salary_payments    drop column if exists firma_id;
--   -- alter table public.transactions       drop column if exists firma_id;
--   -- alter table public.fixed_expenses     drop column if exists firma_id;
--   -- alter table public.expense_categories drop column if exists firma_id;
--   -- alter table public.tax_declarations   drop column if exists firma_id;
--   -- alter table public.giris_kayitlari    drop column if exists firma_id;
--   -- alter table public.backup_jobs        drop column if exists firma_id;
--   -- alter table public.backup_restores    drop column if exists firma_id;
--   -- alter table public.backup_settings    drop column if exists firma_id;
--   -- alter table public.hatirlatma_kurallari drop column if exists firma_id;
--   -- drop table if exists public.tenant_remediation_findings;
-- commit;
