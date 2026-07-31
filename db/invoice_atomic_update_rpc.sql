-- ============================================================================
-- KÖKLÜ ERP — FATURA ATOMİK GÜNCELLEME (tek transaction)
-- ============================================================================
--
-- !!! BU DOSYA OTOMATİK OLARAK ÇALIŞTIRILMAZ !!!
--
--  * Production Supabase üzerinde ÇALIŞTIRILMAZ.
--  * Staging env doğrulaması PASS olmadan staging üzerinde de ÇALIŞTIRILMAZ.
--    Güncel durum: `node scripts/verify-staging-env.mjs` → exit 1 (NO-GO).
--
-- Çözdüğü kök neden (denetim raporu §2.5 / R6):
--   `src/app/(dashboard)/cari-hesap/faturalar/[id]/edit/actions.ts:115-129`
--   `invoice_items` silme/güncellemeyi YALNIZCA `eq('id', ...)` ile yapıyordu.
--   Başka faturaya — hatta başka tenant'a — ait bir kalem kimliği gönderilirse
--   o satır siliniyor/güncelleniyordu. Ayrıca yazmalar transaction dışındaydı ve
--   SİLME İLK adımdaydı (kayıpsız sıra kuralına aykırı).
--
-- Bu RPC her `invoice_items` / `invoice_brokers` mutasyonunu
--   (a) `id`     = gönderilen kimlik
--   (b) `invoice_id` = sahipliği doğrulanmış fatura
-- çiftiyle sınırlandırır ve etkilenen satır sayısını doğrular.
--
-- BAĞIMLILIK: `db/aggregate_atomic_update_rpc.sql` (aggregate_idempotency) ve
--             `db/teslimat_atomic_update_rpc.sql` (payload_fingerprint kolonu).
--
-- Geri alma: dosyanın en altındaki ROLLBACK bloğu.
-- ============================================================================

begin;

do $$
begin
  if to_regclass('public.aggregate_idempotency') is null then
    raise exception
      'BAĞIMLILIK EKSİK: önce db/aggregate_atomic_update_rpc.sql apply edilmelidir.';
  end if;

  alter table public.aggregate_idempotency
    add column if not exists payload_fingerprint text;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Alt tablolarda tenant kolonu (denetim S1 sınıfı drift; invoice_brokers
-- `db/tenant_migration.sql` tenant listesinde yok).
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array['invoice_items', 'invoice_brokers'] loop
    if to_regclass('public.' || t) is null then
      raise notice 'Tablo bulunamadı, atlandı: %', t;
      continue;
    end if;
    execute format(
      'alter table public.%I add column if not exists firma_id uuid references public.firmalar(id) on delete restrict',
      t
    );
    execute format('create index if not exists %I on public.%I(firma_id)', t || '_firma_id_idx', t);
  end loop;
end;
$$;

update public.invoice_items it
   set firma_id = i.firma_id
  from public.invoices i
 where i.id = it.invoice_id and it.firma_id is null and i.firma_id is not null;

update public.invoice_brokers ib
   set firma_id = i.firma_id
  from public.invoices i
 where i.id = ib.invoice_id and ib.firma_id is null and i.firma_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- ATOMİK FATURA GÜNCELLEME RPC
--
-- Tek transaction, GOREV.md §9'daki sıra ile:
--   1. sahiplik ve version kontrolü
--   2. üst fatura doğrulama/güncelleme
--   3. yeni kalem insert
--   4. mevcut kalem update
--   5. açıkça silinen kalemleri delete (EN SON)
--   6. broker ilişkilerinde aynı kontrollü diff
--   7. toplam/KDV tutarlılık kontrolü
--   8. audit/version güncellemesi
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.invoice_update_atomic(
  p_invoice_id          uuid,
  p_invoice_patch       jsonb,
  p_items               jsonb,          -- null ⇒ kalemlere DOKUNMA; [{id?, fields:{}}]
  p_delete_item_ids     uuid[]  default null,
  p_brokers             jsonb   default null,
  p_delete_broker_ids   uuid[]  default null,
  p_confirm_delete_all  boolean default false,
  p_expected_updated_at timestamptz default null,
  p_idempotency_key     text    default null,
  p_user_id             uuid    default null,
  p_firma_id            uuid    default null   -- YETKİ KANITI DEĞİL; çapraz kontrol
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_jwt_role         text;
  v_auth_uid         uuid;
  v_effective_user   uuid;
  v_is_super_admin   boolean := false;
  v_user_firma       uuid;

  v_row_firma        uuid;
  v_actual_updated   timestamptz;

  v_fingerprint      text;
  v_prev_result      jsonb;
  v_prev_fingerprint text;

  v_existing_ids     uuid[];
  v_submitted_ids    uuid[];
  v_delete_ids       uuid[] := coalesce(p_delete_item_ids, array[]::uuid[]);
  v_bad_id           uuid;
  v_result_count     int;

  v_item             jsonb;
  v_fields           jsonb;
  v_line_id          uuid;
  v_affected         int;

  v_inserted         int := 0;
  v_updated          int := 0;
  v_deleted          int := 0;
  v_broker_inserted  int := 0;
  v_broker_updated   int := 0;
  v_broker_deleted   int := 0;

  v_items_subtotal   numeric := 0;
  v_declared_subtotal numeric;
  v_result           jsonb;
begin
  -- ══ 1. Payload ═══════════════════════════════════════════════════════════
  if p_invoice_id is null then
    raise exception 'INVOICE_INVALID_PAYLOAD: fatura kimliği zorunlu.';
  end if;
  if p_items is not null and jsonb_typeof(p_items) <> 'array' then
    raise exception 'INVOICE_INVALID_PAYLOAD: items dizi olmalıdır.';
  end if;
  if p_brokers is not null and jsonb_typeof(p_brokers) <> 'array' then
    raise exception 'INVOICE_INVALID_PAYLOAD: brokers dizi olmalıdır.';
  end if;

  -- ══ 2. Çağıranın kimliği ═════════════════════════════════════════════════
  begin
    v_auth_uid := auth.uid();
  exception when others then
    v_auth_uid := null;
  end;

  begin
    v_jwt_role := coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    );
  exception when others then
    v_jwt_role := null;
  end;

  if v_auth_uid is not null then
    v_effective_user := v_auth_uid;
  elsif v_jwt_role = 'service_role' then
    if p_user_id is null then
      raise exception 'INVOICE_USER_REQUIRED: service-role çağrısında p_user_id zorunludur.';
    end if;
    v_effective_user := p_user_id;
  else
    raise exception 'INVOICE_NOT_AUTHENTICATED';
  end if;

  -- ══ 3. Firma üyeliği — profilden TÜRETİLİR ═══════════════════════════════
  select kp.firma_id, coalesce(r.ad = 'Super Admin', false)
    into v_user_firma, v_is_super_admin
    from public.kullanici_profiller kp
    left join public.roller r on r.id = kp.rol_id
   where kp.id = v_effective_user;

  if not found or v_user_firma is null then
    raise exception 'INVOICE_NO_TENANT: kullanıcıya bağlı firma bulunamadı.';
  end if;
  if p_firma_id is not null and p_firma_id <> v_user_firma and not v_is_super_admin then
    raise exception 'INVOICE_TENANT_MISMATCH';
  end if;

  -- ══ 4. Idempotency ═══════════════════════════════════════════════════════
  v_fingerprint := md5(
    coalesce(p_invoice_patch::text, '') || '|' ||
    coalesce(p_items::text, '') || '|' ||
    coalesce(array_to_string(v_delete_ids, ','), '') || '|' ||
    coalesce(p_brokers::text, '') || '|' ||
    coalesce(array_to_string(coalesce(p_delete_broker_ids, array[]::uuid[]), ','), '')
  );

  if p_idempotency_key is not null then
    select result, payload_fingerprint
      into v_prev_result, v_prev_fingerprint
      from public.aggregate_idempotency
     where key = p_idempotency_key and firma_id = v_user_firma
     for update;

    if found then
      if v_prev_fingerprint is distinct from v_fingerprint then
        raise exception 'INVOICE_IDEMPOTENCY_CONFLICT: aynı anahtar farklı içerikle gönderildi.';
      end if;
      return v_prev_result || jsonb_build_object('replayed', true);
    end if;
  end if;

  -- ══ 5. Üst kayıt kilidi + sahiplik ═══════════════════════════════════════
  select firma_id, updated_at
    into v_row_firma, v_actual_updated
    from public.invoices
   where id = p_invoice_id
   for update;

  if not found then
    raise exception 'INVOICE_NOT_FOUND';
  end if;
  if v_row_firma is distinct from v_user_firma and not v_is_super_admin then
    raise exception 'INVOICE_TENANT_MISMATCH';
  end if;

  if p_expected_updated_at is not null
     and v_actual_updated is not null
     and v_actual_updated <> p_expected_updated_at then
    raise exception 'INVOICE_STALE_WRITE';
  end if;

  -- ══ 6. Kalem diff doğrulaması ════════════════════════════════════════════
  --     GOREV.md §9: gönderilen BÜTÜN mevcut kimlikler bu faturaya ait olmalı.
  select coalesce(array_agg(id), array[]::uuid[])
    into v_existing_ids
    from public.invoice_items
   where invoice_id = p_invoice_id;

  select x into v_bad_id from unnest(v_delete_ids) x
   where not (x = any(v_existing_ids)) limit 1;
  if v_bad_id is not null then
    raise exception 'INVOICE_FOREIGN_LINE_ID: %', v_bad_id;
  end if;

  if p_items is null then
    -- Kalem alanı gönderilmedi ⇒ mevcut kalemler AYNEN korunur.
    v_result_count := coalesce(array_length(v_existing_ids, 1), 0)
                      - coalesce(array_length(v_delete_ids, 1), 0);
  else
    select coalesce(array_agg((e ->> 'id')::uuid), array[]::uuid[])
      into v_submitted_ids
      from jsonb_array_elements(p_items) e
     where e ->> 'id' is not null;

    if (select count(*) from unnest(v_submitted_ids)) <>
       (select count(distinct x) from unnest(v_submitted_ids) x) then
      raise exception 'INVOICE_DUPLICATE_LINE_ID';
    end if;

    select x into v_bad_id from unnest(v_submitted_ids) x
     where not (x = any(v_existing_ids)) limit 1;
    if v_bad_id is not null then
      raise exception 'INVOICE_FOREIGN_LINE_ID: %', v_bad_id;
    end if;

    select x into v_bad_id from unnest(v_submitted_ids) x
     where x = any(v_delete_ids) limit 1;
    if v_bad_id is not null then
      raise exception 'INVOICE_INVALID_PAYLOAD: kalem hem güncellenip hem silinemez.';
    end if;

    v_result_count := (select count(*) from jsonb_array_elements(p_items));
  end if;

  if coalesce(v_result_count, 0) <= 0
     and coalesce(array_length(v_existing_ids, 1), 0) > 0
     and p_confirm_delete_all is not true then
    raise exception 'INVOICE_EMPTY_LINES_NOT_CONFIRMED';
  end if;

  -- ══ 7. Üst fatura güncellemesi ═══════════════════════════════════════════
  --     `id` ve `firma_id` istemciden ASLA değiştirilemez.
  if p_invoice_patch is not null and p_invoice_patch <> '{}'::jsonb then
    update public.invoices i
       set invoice_type      = coalesce((p_invoice_patch ->> 'invoice_type')::public.invoice_type, i.invoice_type),
           customer_id       = case when p_invoice_patch ? 'customer_id'
                                    then (p_invoice_patch ->> 'customer_id')::uuid else i.customer_id end,
           supplier_name     = case when p_invoice_patch ? 'supplier_name'
                                    then p_invoice_patch ->> 'supplier_name' else i.supplier_name end,
           supplier_tax_no   = case when p_invoice_patch ? 'supplier_tax_no'
                                    then p_invoice_patch ->> 'supplier_tax_no' else i.supplier_tax_no end,
           invoice_date      = coalesce((p_invoice_patch ->> 'invoice_date')::date, i.invoice_date),
           due_date          = case when p_invoice_patch ? 'due_date'
                                    then (p_invoice_patch ->> 'due_date')::date else i.due_date end,
           subtotal          = coalesce((p_invoice_patch ->> 'subtotal')::numeric, i.subtotal),
           kdv_amount        = coalesce((p_invoice_patch ->> 'kdv_amount')::numeric, i.kdv_amount),
           stopaj_rate       = coalesce((p_invoice_patch ->> 'stopaj_rate')::numeric, i.stopaj_rate),
           stopaj_amount     = coalesce((p_invoice_patch ->> 'stopaj_amount')::numeric, i.stopaj_amount),
           total_amount      = coalesce((p_invoice_patch ->> 'total_amount')::numeric, i.total_amount),
           description       = case when p_invoice_patch ? 'description'
                                    then p_invoice_patch ->> 'description' else i.description end,
           notes             = case when p_invoice_patch ? 'notes'
                                    then p_invoice_patch ->> 'notes' else i.notes end,
           updated_at        = now()
     where i.id = p_invoice_id;

    -- Şemaya sonradan eklenen opsiyonel kolonlar (adres / şube alanları) ayrı
    -- ve savunmacı biçimde güncellenir; kolon yoksa migration sırası bozulmaz.
    perform public.invoice_apply_optional_patch(p_invoice_id, p_invoice_patch);
  else
    update public.invoices set updated_at = now() where id = p_invoice_id;
  end if;

  -- ══ 8. Yeni kalemler ═════════════════════════════════════════════════════
  if p_items is not null then
    for v_item in select * from jsonb_array_elements(p_items) loop
      if (v_item ->> 'id') is not null then continue; end if;
      v_fields := v_item -> 'fields';

      insert into public.invoice_items (
        invoice_id, line_order, description, quantity, unit, unit_price, kdv_rate, notes, firma_id
      ) values (
        p_invoice_id,
        coalesce((v_fields ->> 'line_order')::smallint, 1),
        v_fields ->> 'description',
        coalesce((v_fields ->> 'quantity')::numeric, 1),
        coalesce(v_fields ->> 'unit', 'adet'),
        coalesce((v_fields ->> 'unit_price')::numeric, 0),
        coalesce((v_fields ->> 'kdv_rate')::numeric, 20),
        v_fields ->> 'notes',
        v_row_firma
      );
      v_inserted := v_inserted + 1;
    end loop;

    -- ══ 9. Mevcut kalemler — id + invoice_id ÇİFTİ ile sınırlı ══════════════
    for v_item in select * from jsonb_array_elements(p_items) loop
      if (v_item ->> 'id') is null then continue; end if;
      v_line_id := (v_item ->> 'id')::uuid;
      v_fields  := v_item -> 'fields';

      update public.invoice_items it
         set description = coalesce(v_fields ->> 'description', it.description),
             quantity    = coalesce((v_fields ->> 'quantity')::numeric, it.quantity),
             unit        = coalesce(v_fields ->> 'unit', it.unit),
             unit_price  = coalesce((v_fields ->> 'unit_price')::numeric, it.unit_price),
             kdv_rate    = coalesce((v_fields ->> 'kdv_rate')::numeric, it.kdv_rate),
             line_order  = coalesce((v_fields ->> 'line_order')::smallint, it.line_order),
             firma_id    = coalesce(it.firma_id, v_row_firma)
       where it.id = v_line_id
         and it.invoice_id = p_invoice_id;      -- ← ASGARİ ZORUNLU GÜVENLİK KISITI

      get diagnostics v_affected = row_count;
      if v_affected <> 1 then
        raise exception 'INVOICE_FOREIGN_LINE_ID: %', v_line_id;
      end if;
      v_updated := v_updated + 1;
    end loop;
  end if;

  -- ══ 10. Silme EN SON — id + invoice_id çifti ═════════════════════════════
  if coalesce(array_length(v_delete_ids, 1), 0) > 0 then
    delete from public.invoice_items
     where id = any(v_delete_ids)
       and invoice_id = p_invoice_id;          -- ← ASGARİ ZORUNLU GÜVENLİK KISITI
    get diagnostics v_deleted = row_count;

    if v_deleted <> array_length(v_delete_ids, 1) then
      raise exception 'INVOICE_FOREIGN_LINE_ID: silinmek istenen kalem bu faturaya ait değil.';
    end if;
  end if;

  -- ══ 11. Broker ilişkileri — aynı sözleşme ════════════════════════════════
  if p_brokers is not null then
    for v_item in select * from jsonb_array_elements(p_brokers) loop
      v_fields := v_item -> 'fields';
      if (v_item ->> 'id') is null then
        insert into public.invoice_brokers (
          invoice_id, broker_id, commission_rate, commission_amount, is_paid, firma_id
        ) values (
          p_invoice_id,
          (v_fields ->> 'broker_id')::uuid,
          coalesce((v_fields ->> 'commission_rate')::numeric, 0),
          coalesce((v_fields ->> 'commission_amount')::numeric, 0),
          false,
          v_row_firma
        );
        v_broker_inserted := v_broker_inserted + 1;
      else
        update public.invoice_brokers ib
           set commission_rate   = coalesce((v_fields ->> 'commission_rate')::numeric, ib.commission_rate),
               commission_amount = coalesce((v_fields ->> 'commission_amount')::numeric, ib.commission_amount),
               firma_id          = coalesce(ib.firma_id, v_row_firma)
         where ib.id = (v_item ->> 'id')::uuid
           and ib.invoice_id = p_invoice_id;   -- ← parent kısıtı
        get diagnostics v_affected = row_count;
        if v_affected <> 1 then
          raise exception 'INVOICE_FOREIGN_BROKER_ID: %', v_item ->> 'id';
        end if;
        v_broker_updated := v_broker_updated + 1;
      end if;
    end loop;
  end if;

  if coalesce(array_length(p_delete_broker_ids, 1), 0) > 0 then
    delete from public.invoice_brokers
     where id = any(p_delete_broker_ids)
       and invoice_id = p_invoice_id;
    get diagnostics v_broker_deleted = row_count;
    if v_broker_deleted <> array_length(p_delete_broker_ids, 1) then
      raise exception 'INVOICE_FOREIGN_BROKER_ID: silinmek istenen aracı bu faturaya ait değil.';
    end if;
  end if;

  -- ══ 12. Toplam tutarlılık kontrolü ═══════════════════════════════════════
  --     Mevcut iş kuralı: `invoices.subtotal` üst kayıtta AYRI tutulur ve
  --     istemci tarafından hesaplanır (actions.ts'de kalemlerden türetilmiyor).
  --     Bu yüzden kural "eşit olmalı" değil, "tolerans dışında sapmamalı"dır;
  --     sapma bir HATA değil, sonuç özetinde raporlanan bir UYARIDIR.
  --     Resmî toplam kaynağı kararı için: docs/erp_data_integrity_...md §7.4.
  select coalesce(sum(quantity * unit_price), 0)
    into v_items_subtotal
    from public.invoice_items
   where invoice_id = p_invoice_id;

  select subtotal, updated_at into v_declared_subtotal, v_actual_updated
    from public.invoices where id = p_invoice_id;

  v_result := jsonb_build_object(
    'invoice_id',       p_invoice_id,
    'inserted',         v_inserted,
    'updated',          v_updated,
    'deleted',          v_deleted,
    'brokers_inserted', v_broker_inserted,
    'brokers_updated',  v_broker_updated,
    'brokers_deleted',  v_broker_deleted,
    'items_subtotal',   v_items_subtotal,
    'declared_subtotal', v_declared_subtotal,
    'totals_match',     abs(round(v_items_subtotal, 2) - round(coalesce(v_declared_subtotal, 0), 2)) <= 0.02,
    'updated_at',       v_actual_updated,
    'atomic',           true,
    'replayed',         false
  );

  if p_idempotency_key is not null then
    insert into public.aggregate_idempotency (key, firma_id, module, parent_id, result, payload_fingerprint)
    values (p_idempotency_key, v_user_firma, 'invoice', p_invoice_id, v_result, v_fingerprint);
  end if;

  return v_result;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Opsiyonel kolon patch'i (adres / şube alanları ayrı migration'larla eklendi;
-- kolon yoksa sessizce atlanır — böylece migration sırası kırılmaz).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.invoice_apply_optional_patch(p_invoice_id uuid, p_patch jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c text;
begin
  foreach c in array array[
    'musteri_unvan', 'musteri_vergi_no', 'musteri_telefon', 'musteri_email',
    'musteri_adres', 'musteri_il', 'musteri_ilce',
    'tedarikci_adres', 'tedarikci_il', 'tedarikci_ilce', 'sube_id'
  ]
  loop
    continue when not (p_patch ? c);
    continue when not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'invoices' and column_name = c
    );

    if c = 'sube_id' then
      execute format('update public.invoices set %I = $1::uuid where id = $2', c)
        using p_patch ->> c, p_invoice_id;
    else
      execute format('update public.invoices set %I = $1 where id = $2', c)
        using p_patch ->> c, p_invoice_id;
    end if;
  end loop;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- YETKİLER
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on function public.invoice_update_atomic(
  uuid, jsonb, jsonb, uuid[], jsonb, uuid[], boolean, timestamptz, text, uuid, uuid
) from public, anon;

grant execute on function public.invoice_update_atomic(
  uuid, jsonb, jsonb, uuid[], jsonb, uuid[], boolean, timestamptz, text, uuid, uuid
) to authenticated, service_role;

revoke all on function public.invoice_apply_optional_patch(uuid, jsonb)
  from public, anon, authenticated;

commit;

-- ============================================================================
-- ROLLBACK PLANI (otomatik ÇALIŞMAZ)
-- ============================================================================
-- SIRA: önce uygulama kodu eski sürüme alınır, sonra RPC düşürülür.
--
-- begin;
--   drop function if exists public.invoice_update_atomic(
--     uuid, jsonb, jsonb, uuid[], jsonb, uuid[], boolean, timestamptz, text, uuid, uuid);
--   drop function if exists public.invoice_apply_optional_patch(uuid, jsonb);
--   -- DİKKAT: invoice_items.firma_id / invoice_brokers.firma_id GERİ ALINMAZ;
--   -- tenant güvenliği için kalması gerekir.
-- commit;
