-- ============================================================================
-- KÖKLÜ ERP — Üst kayıt–kalem güncellemelerinde ATOMİKLİK
-- ============================================================================
--
-- !!! BU DOSYA OTOMATİK OLARAK ÇALIŞTIRILMAZ !!!
--
--  * Production Supabase üzerinde ÇALIŞTIRILMAZ.
--  * Staging env doğrulaması PASS olmadan staging üzerinde de ÇALIŞTIRILMAZ.
--    Güncel durum: `db/staging_env_pass_report.md` → NO-GO (.env.local production).
--  * Apply öncesi `node scripts/verify-staging-env.mjs` exit 0 dönmelidir.
--
-- Uygulama kodu bu dosya apply EDİLMEDEN de güvenle çalışır:
--   - kalem güncellemesi kimlik bazlı diff ile yapılır (önce-sil-sonra-ekle yok)
--   - silme her zaman en son adımdır
--   - `updated_at` yoksa optimistic concurrency "skipped_column_missing" raporlanır
-- Bu dosya apply edildikten sonra kazanılan ek garantiler:
--   - tek transaction içinde tam atomiklik (kısmi yazma imkânsız)
--   - kalıcı (instance'lar arası) idempotency
--
-- Migration sırası (Faz E gate):
--   1. Önce bu dosya staging'e apply edilir ve doğrulanır.
--   2. Sonra `atomic` yolu uygulama kodunda açılır.
--   Kolon/RPC apply edilmeden uygulama kodu ona bağımlı hale GETİRİLMEZ.
--
-- Geri alma (rollback): dosyanın en altındaki DROP bloğuna bakınız.
-- ============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Optimistic concurrency için `updated_at`
--    `teklifler`, `teklif_kalemleri` ve servis formu tablolarında bu kolon yok.
--    (`proforma_faturalar` zaten `updated_at` + trigger taşıyor.)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'teklifler',
    'teklif_kalemleri',
    'service_forms',
    'service_form_items',
    'proforma_fatura_kalemleri'
  ]
  loop
    if to_regclass('public.' || t) is null then
      raise notice 'Tablo bulunamadı, atlandı: %', t;
      continue;
    end if;

    execute format(
      'alter table public.%I add column if not exists updated_at timestamptz not null default now()',
      t
    );
    execute format('drop trigger if exists %I on public.%I', t || '_set_updated_at', t);
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ŞEMA DRIFT DÜZELTMESİ — proforma_fatura_kalemleri.firma_id
--    `db/tenant_migration.sql` içindeki tablo listesi yanlışlıkla
--    `proforma_kalemleri` yazıyor; gerçek tablo `proforma_fatura_kalemleri`.
--    Bu yüzden bu tabloda `firma_id` hiç oluşmadı.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if to_regclass('public.proforma_fatura_kalemleri') is null then
    raise notice 'proforma_fatura_kalemleri yok, atlandı.';
    return;
  end if;

  alter table public.proforma_fatura_kalemleri
    add column if not exists firma_id uuid references public.firmalar(id) on delete restrict;

  -- Kalemler üst kaydın firmasını devralır. Üst kaydı olmayan satır güncellenmez.
  update public.proforma_fatura_kalemleri k
     set firma_id = p.firma_id
    from public.proforma_faturalar p
   where p.id = k.proforma_id
     and k.firma_id is null
     and p.firma_id is not null;

  create index if not exists proforma_fatura_kalemleri_firma_id_idx
    on public.proforma_fatura_kalemleri(firma_id);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Kalıcı idempotency (çok instance'lı dağıtım için)
--    Uygulamadaki process içi store yalnızca tek instance'ta koruma sağlar.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.aggregate_idempotency (
  key          text primary key,
  firma_id     uuid not null,
  module       text not null,
  parent_id    uuid not null,
  result       jsonb,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '24 hours'
);

create index if not exists aggregate_idempotency_expires_at_idx
  on public.aggregate_idempotency(expires_at);

alter table public.aggregate_idempotency enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ATOMİK AGGREGATE UPDATE RPC
--
--    Tek transaction içinde:
--      a) firma sahipliği doğrulanır
--      b) optimistic concurrency kontrol edilir
--      c) üst kayıt güncellenir
--      d) kalemler eklenir / güncellenir
--      e) silme EN SON, yalnızca açık kimlik listesiyle yapılır
--    Herhangi bir adım hata verirse tüm işlem rollback olur.
--
--    Not: fonksiyon `security definer` DEĞİLDİR bilinçli olarak — yetki kontrolü
--    parametre olarak gelen firma_id ile açıkça yapılır ve çağıran servis rolüdür.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.aggregate_update_lines(
  p_parent_table       text,
  p_line_table         text,
  p_line_parent_column text,
  p_parent_id          uuid,
  p_firma_id           uuid,
  p_parent_patch       jsonb,
  p_lines_to_insert    jsonb,   -- [{ "sira_no": 1, "fields": {...} }, ...]
  p_lines_to_update    jsonb,   -- [{ "id": "...", "sira_no": 1, "fields": {...} }, ...]
  p_line_ids_to_delete uuid[],
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
as $$
declare
  v_allowed_parent constant text[] := array['teklifler', 'service_forms', 'proforma_faturalar'];
  v_allowed_line   constant text[] := array['teklif_kalemleri', 'service_form_items', 'proforma_fatura_kalemleri'];
  v_actual_updated timestamptz;
  v_row_firma      uuid;
  v_inserted       int := 0;
  v_updated        int := 0;
  v_deleted        int := 0;
  v_item           jsonb;
  v_affected       int;
begin
  -- Tablo adları allowlist dışında olamaz (SQL injection ve yanlış hedef koruması).
  if not (p_parent_table = any(v_allowed_parent)) then
    raise exception 'AGG_INVALID_PARENT_TABLE: %', p_parent_table;
  end if;
  if not (p_line_table = any(v_allowed_line)) then
    raise exception 'AGG_INVALID_LINE_TABLE: %', p_line_table;
  end if;
  if p_line_parent_column !~ '^[a-z_]+$' then
    raise exception 'AGG_INVALID_PARENT_COLUMN';
  end if;

  -- (a) Firma sahipliği — kayıt kilitlenerek okunur.
  execute format('select firma_id, updated_at from public.%I where id = $1 for update', p_parent_table)
    into v_row_firma, v_actual_updated
    using p_parent_id;

  if not found then
    raise exception 'AGG_PARENT_NOT_FOUND';
  end if;
  if v_row_firma is distinct from p_firma_id then
    raise exception 'AGG_TENANT_MISMATCH';
  end if;

  -- (b) Optimistic concurrency
  if p_expected_updated_at is not null
     and v_actual_updated is not null
     and v_actual_updated <> p_expected_updated_at then
    raise exception 'AGG_STALE_WRITE';
  end if;

  -- (c) Üst kayıt
  if p_parent_patch is not null and p_parent_patch <> '{}'::jsonb then
    execute format(
      'update public.%I set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1)) where id = $2',
      p_parent_table,
      (select string_agg(quote_ident(k), ', ') from jsonb_object_keys(p_parent_patch) k),
      (select string_agg(quote_ident(k), ', ') from jsonb_object_keys(p_parent_patch) k),
      p_parent_table
    ) using p_parent_patch, p_parent_id;
  end if;

  -- (d1) Yeni kalemler
  for v_item in select * from jsonb_array_elements(coalesce(p_lines_to_insert, '[]'::jsonb))
  loop
    execute format(
      'insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)',
      p_line_table, p_line_table
    ) using (
      v_item -> 'fields'
      || jsonb_build_object(p_line_parent_column, p_parent_id)
      || jsonb_build_object('sira_no', v_item -> 'sira_no')
      || jsonb_build_object('firma_id', p_firma_id)
    );
    v_inserted := v_inserted + 1;
  end loop;

  -- (d2) Mevcut kalemler — yalnızca bu üst kayda ait olanlar
  for v_item in select * from jsonb_array_elements(coalesce(p_lines_to_update, '[]'::jsonb))
  loop
    execute format(
      'update public.%I t set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1))
         where t.id = $2 and t.%I = $3',
      p_line_table,
      (select string_agg(quote_ident(k), ', ') from jsonb_object_keys(v_item -> 'fields') k),
      (select string_agg(quote_ident(k), ', ') from jsonb_object_keys(v_item -> 'fields') k),
      p_line_table,
      p_line_parent_column
    ) using (v_item -> 'fields'), (v_item ->> 'id')::uuid, p_parent_id;

    get diagnostics v_affected = row_count;
    if v_affected = 0 then
      -- Başka üst kayda ait kimlik gönderilmiş olabilir; sessizce geçilmez.
      raise exception 'AGG_LINE_NOT_IN_PARENT: %', v_item ->> 'id';
    end if;
    v_updated := v_updated + 1;
  end loop;

  -- (e) Silme EN SON ve yalnızca açık kimlik listesiyle
  if p_line_ids_to_delete is not null and array_length(p_line_ids_to_delete, 1) > 0 then
    execute format('delete from public.%I where id = any($1) and %I = $2', p_line_table, p_line_parent_column)
      using p_line_ids_to_delete, p_parent_id;
    get diagnostics v_deleted = row_count;

    if v_deleted <> array_length(p_line_ids_to_delete, 1) then
      raise exception 'AGG_LINE_NOT_IN_PARENT: silinmek istenen kalem bu kayda ait değil';
    end if;
  end if;

  return jsonb_build_object(
    'inserted', v_inserted,
    'updated',  v_updated,
    'deleted',  v_deleted,
    'atomic',   true
  );
end;
$$;

revoke all on function public.aggregate_update_lines(
  text, text, text, uuid, uuid, jsonb, jsonb, jsonb, uuid[], timestamptz
) from public, anon, authenticated;

commit;

-- ============================================================================
-- ROLLBACK PLANI
-- ============================================================================
-- Aşağıdaki blok yalnızca geri alma gerektiğinde, ayrı ve bilinçli olarak
-- çalıştırılır. `updated_at` kolonları veri taşımaz; düşürülmesi güvenlidir
-- fakat uygulama kodu bunlara bağımlıysa önce kod geri alınmalıdır.
--
-- begin;
--   drop function if exists public.aggregate_update_lines(
--     text, text, text, uuid, uuid, jsonb, jsonb, jsonb, uuid[], timestamptz);
--   drop table if exists public.aggregate_idempotency;
--   -- updated_at kolonları ve trigger'ları:
--   -- drop trigger if exists teklifler_set_updated_at on public.teklifler;
--   -- alter table public.teklifler drop column if exists updated_at;
--   -- (diğer tablolar için aynı şekilde)
--   -- DİKKAT: proforma_fatura_kalemleri.firma_id GERİ ALINMAZ; tenant güvenliği için
--   -- kalması gerekir.
-- commit;
