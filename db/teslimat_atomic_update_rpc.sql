-- ============================================================================
-- KÖKLÜ ERP — TESLİMAT ATOMİK GÜNCELLEME (tek transaction)
-- ============================================================================
--
-- !!! BU DOSYA OTOMATİK OLARAK ÇALIŞTIRILMAZ !!!
--
--  * Production Supabase üzerinde ÇALIŞTIRILMAZ.
--  * Staging env doğrulaması PASS olmadan staging üzerinde de ÇALIŞTIRILMAZ.
--    Güncel durum: `node scripts/verify-staging-env.mjs` → exit 1 (NO-GO).
--
-- BAĞIMLILIK: `db/aggregate_atomic_update_rpc.sql` ÖNCE apply edilmelidir
--             (public.aggregate_idempotency tablosunu kurar).
--
-- Tasarım gerekçesi, domain kanıtları ve stok delta modelinin eşdeğerlik ispatı:
--             `docs/teslimat_atomic_update_design.md`
--
-- Deployment sırası: tasarım belgesi §9. Bu dosya apply EDİLMEDEN uygulama kodu
-- `TESLIMAT_RPC_MISSING` döndürür ve teslimat düzenleme çalışmaz. Bu bilinçlidir:
-- sessizce eski güvensiz akışa düşmek yerine açık hata verilir.
--
-- Geri alma: dosyanın en altındaki ROLLBACK bloğu (otomatik ÇALIŞMAZ).
-- ============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ŞEMA DRIFT DÜZELTMELERİ
--
--    Tasarım belgesi §2.6 (T4): `emanet_takipleri`, `geri_teslim_takipleri` ve
--    `teslimat_durum_gecmisi` `db/tenant_migration.sql` tenant listesinde YOK,
--    fakat `src/lib/teslimatlar.ts:343,366` bu tablolara `firma_id` yazıyor.
--    Repodaki migration zincirinden kurulan temiz bir şemada bu insert'ler
--    PGRST204 ile başarısız olur.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array[
    'emanet_takipleri',
    'geri_teslim_takipleri',
    'teslimat_durum_gecmisi'
  ]
  loop
    if to_regclass('public.' || t) is null then
      raise notice 'Tablo bulunamadı, atlandı: %', t;
      continue;
    end if;

    execute format(
      'alter table public.%I add column if not exists firma_id uuid references public.firmalar(id) on delete restrict',
      t
    );
    execute format(
      'create index if not exists %I on public.%I(firma_id)',
      t || '_firma_id_idx', t
    );
  end loop;
end;
$$;

-- Mevcut satırlar üst teslimatın firmasını devralır (üst kaydı olmayan satır atlanır).
update public.emanet_takipleri e
   set firma_id = t.firma_id
  from public.teslimatlar t
 where t.id = e.teslimat_id and e.firma_id is null and t.firma_id is not null;

update public.geri_teslim_takipleri g
   set firma_id = t.firma_id
  from public.teslimatlar t
 where t.id = g.teslimat_id and g.firma_id is null and t.firma_id is not null;

update public.teslimat_durum_gecmisi d
   set firma_id = t.firma_id
  from public.teslimatlar t
 where t.id = d.teslimat_id and d.firma_id is null and t.firma_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. DOĞAL ANAHTAR KISITLARI
--
--    Tasarım belgesi §2.3 (T3): uygulama `kalem_id`'yi doğal anahtar gibi
--    kullanıyor ("önce oku, yoksa yaz") ama veritabanında kısıt yok — iki
--    eşzamanlı istek aynı kalem için iki takip satırı üretebilir.
--
--    DİKKAT: Mevcut veride mükerrer varsa bu index oluşmaz ve migration hata
--    verir. Bu bilinçlidir — sessizce satır silmek yerine operatör kararı
--    beklenir. Temizlik sorgusu için: db/read_only_possible_orphaned_or_missing_lines_audit.sql
-- ─────────────────────────────────────────────────────────────────────────────

create unique index if not exists emanet_takipleri_kalem_id_key
  on public.emanet_takipleri(kalem_id);

create unique index if not exists geri_teslim_takipleri_kalem_id_key
  on public.geri_teslim_takipleri(kalem_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. FIFO KAPATMA DEFTERİ
--
--    `reduceEmanetTakipleri` / `reduceGeriTeslimTakipleri` (teslimatlar.ts:371-447)
--    BAŞKA teslimatlara ait takip satırlarını FIFO ile kapatır ve bu tüketim
--    hiçbir yerde kaydedilmez ⇒ aynı teslimat iki kez kaydedilirse tüketim iki
--    kez uygulanır ve geri alınamaz.
--
--    Bu defter, tüketimi kapatan kaleme bağlar. Böylece RPC her çalıştığında
--    önce kendi eski tüketimini geri alır, sonra yeniden uygular ⇒ tam idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.teslimat_takip_kapatma (
  id          uuid primary key default gen_random_uuid(),
  kalem_id    uuid not null references public.teslimat_kalemleri(id) on delete cascade,
  takip_tipi  text not null check (takip_tipi in ('emanet', 'geri_teslim')),
  takip_id    uuid not null,
  miktar      numeric(14,3) not null check (miktar > 0),
  firma_id    uuid references public.firmalar(id) on delete restrict,
  created_at  timestamptz not null default now(),
  unique (kalem_id, takip_tipi, takip_id)
);

create index if not exists teslimat_takip_kapatma_takip_idx
  on public.teslimat_takip_kapatma(takip_tipi, takip_id);
create index if not exists teslimat_takip_kapatma_firma_idx
  on public.teslimat_takip_kapatma(firma_id);

alter table public.teslimat_takip_kapatma enable row level security;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. IDEMPOTENCY — payload parmak izi
--    `public.aggregate_idempotency` (aggregate_atomic_update_rpc.sql §3) yeniden
--    kullanılır. Aynı key + FARKLI payload'ı conflict olarak ayırt edebilmek için
--    parmak izi kolonu eklenir. Ham payload SAKLANMAZ (hassas veri sızıntısı).
-- ─────────────────────────────────────────────────────────────────────────────

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
-- 5. ATOMİK TESLİMAT GÜNCELLEME RPC
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Tek transaction içinde sırasıyla:
--   1. payload doğrulama
--   2. çağıran kullanıcının kimliği (auth.uid() veya service-role + p_user_id)
--   3. kullanıcının firma üyeliği — `kullanici_profiller`den TÜRETİLİR,
--      istemciden gelen p_firma_id yetki kanıtı SAYILMAZ (yalnızca çapraz kontrol)
--   4. idempotency kontrolü
--   5. üst kayıt FOR UPDATE kilidi + firma sahipliği
--   6. optimistic concurrency (expected_updated_at)
--   7. kalem diff doğrulaması (yabancı kimlik reddi, boş liste onayı)
--   8. eski stok etkisinin ölçülmesi (yazmadan ÖNCE)
--   9. üst kayıt + kalem yazmaları (silme EN SON)
--  10. yeni stok etkisi ve NET DELTA uygulaması (urun_stok FOR UPDATE)
--  11. emanet / geri teslim mutabakatı (kimlik bazlı, silip-yaratma yok)
--  12. FIFO kapatma: önce eski tüketimin geri alınması, sonra yeniden uygulama
--  13. durum geçmişi + idempotency kaydı
--
-- Herhangi bir adımdaki hata bütün transaction'ı rollback eder.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.teslimat_update_atomic(
  p_teslimat_id         uuid,
  p_parent_patch        jsonb,
  p_lines               jsonb,          -- null ⇒ kalemlere DOKUNMA; [{id?, fields:{}}]
  p_delete_line_ids     uuid[]  default null,
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
  v_jwt_role        text;
  v_auth_uid        uuid;
  v_effective_user  uuid;
  v_is_super_admin  boolean := false;
  v_user_firma      uuid;

  v_row_firma       uuid;
  v_teslimat_no     text;
  v_old_durum       text;
  v_new_durum       text;
  v_actual_updated  timestamptz;

  v_fingerprint     text;
  v_prev_result     jsonb;
  v_prev_fingerprint text;

  v_existing_ids    uuid[];
  v_submitted_ids   uuid[];
  v_delete_ids      uuid[] := coalesce(p_delete_line_ids, array[]::uuid[]);
  v_bad_id          uuid;
  v_result_count    int;

  v_old_effect      jsonb := '{}'::jsonb;
  v_new_effect      jsonb := '{}'::jsonb;
  v_urun_id         uuid;
  v_delta           numeric;
  v_new_stok        numeric;
  v_negative_urunler uuid[] := array[]::uuid[];

  v_item            jsonb;
  v_fields          jsonb;
  v_line_id         uuid;
  v_inserted        int := 0;
  v_updated         int := 0;
  v_deleted         int := 0;
  v_affected        int;

  v_takip           record;
  v_kalan           numeric;
  v_kapanan         numeric;
  v_acik            numeric;
  v_yeni_miktar     numeric;
  v_durum_metni     text;

  v_result          jsonb;
begin
  -- ══ 1. Payload doğrulama ═════════════════════════════════════════════════
  if p_teslimat_id is null then
    raise exception 'TESLIMAT_INVALID_PAYLOAD: teslimat kimliği zorunlu.';
  end if;
  if p_parent_patch is not null and jsonb_typeof(p_parent_patch) <> 'object' then
    raise exception 'TESLIMAT_INVALID_PAYLOAD: parent_patch nesne olmalıdır.';
  end if;
  if p_lines is not null and jsonb_typeof(p_lines) <> 'array' then
    raise exception 'TESLIMAT_INVALID_PAYLOAD: lines dizi olmalıdır.';
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
    -- Tercih edilen yol: gerçek authenticated kullanıcı.
    v_effective_user := v_auth_uid;
  elsif v_jwt_role = 'service_role' then
    -- Sunucu tarafı yol: kullanıcı kimliği AÇIKÇA verilmek zorunda.
    if p_user_id is null then
      raise exception 'TESLIMAT_USER_REQUIRED: service-role çağrısında p_user_id zorunludur.';
    end if;
    v_effective_user := p_user_id;
  else
    raise exception 'TESLIMAT_NOT_AUTHENTICATED';
  end if;

  -- ══ 3. Firma üyeliği — profilden TÜRETİLİR ═══════════════════════════════
  select kp.firma_id,
         coalesce(r.ad = 'Super Admin', false)
    into v_user_firma, v_is_super_admin
    from public.kullanici_profiller kp
    left join public.roller r on r.id = kp.rol_id
   where kp.id = v_effective_user;

  if not found or v_user_firma is null then
    raise exception 'TESLIMAT_NO_TENANT: kullanıcıya bağlı firma bulunamadı.';
  end if;

  -- İstemciden gelen firma_id yalnızca çapraz kontrol amaçlıdır; yetki kanıtı değildir.
  if p_firma_id is not null and p_firma_id <> v_user_firma and not v_is_super_admin then
    raise exception 'TESLIMAT_TENANT_MISMATCH';
  end if;

  -- ══ 4. Idempotency ═══════════════════════════════════════════════════════
  v_fingerprint := md5(
    coalesce(p_parent_patch::text, '') || '|' ||
    coalesce(p_lines::text, '') || '|' ||
    coalesce(array_to_string(v_delete_ids, ','), '') || '|' ||
    coalesce(p_confirm_delete_all::text, 'false')
  );

  if p_idempotency_key is not null then
    select result, payload_fingerprint
      into v_prev_result, v_prev_fingerprint
      from public.aggregate_idempotency
     where key = p_idempotency_key
       and firma_id = v_user_firma
     for update;

    if found then
      if v_prev_fingerprint is distinct from v_fingerprint then
        raise exception 'TESLIMAT_IDEMPOTENCY_CONFLICT: aynı anahtar farklı içerikle gönderildi.';
      end if;
      -- Aynı key + aynı payload ⇒ yan etki TEKRARLANMAZ, önceki sonuç döner.
      return v_prev_result || jsonb_build_object('replayed', true);
    end if;
  end if;

  -- ══ 5. Üst kayıt kilidi + sahiplik ═══════════════════════════════════════
  select firma_id, teslimat_no, durum, updated_at
    into v_row_firma, v_teslimat_no, v_old_durum, v_actual_updated
    from public.teslimatlar
   where id = p_teslimat_id
   for update;

  if not found then
    raise exception 'TESLIMAT_NOT_FOUND';
  end if;
  if v_row_firma is distinct from v_user_firma and not v_is_super_admin then
    raise exception 'TESLIMAT_TENANT_MISMATCH';
  end if;

  -- ══ 6. Optimistic concurrency ════════════════════════════════════════════
  if p_expected_updated_at is not null
     and v_actual_updated is not null
     and v_actual_updated <> p_expected_updated_at then
    raise exception 'TESLIMAT_STALE_WRITE';
  end if;

  v_new_durum := coalesce(p_parent_patch ->> 'durum', v_old_durum);
  if v_new_durum not in ('taslak', 'sevkte', 'tamamlandi', 'iptal') then
    raise exception 'TESLIMAT_INVALID_PAYLOAD: geçersiz durum.';
  end if;

  -- ══ 7. Kalem diff doğrulaması ════════════════════════════════════════════
  select coalesce(array_agg(id), array[]::uuid[])
    into v_existing_ids
    from public.teslimat_kalemleri
   where teslimat_id = p_teslimat_id;

  -- Silinmek istenen her kimlik bu teslimata ait olmalı.
  select x into v_bad_id
    from unnest(v_delete_ids) x
   where not (x = any(v_existing_ids))
   limit 1;
  if v_bad_id is not null then
    raise exception 'TESLIMAT_LINE_NOT_IN_PARENT: %', v_bad_id;
  end if;

  if p_lines is null then
    -- Kalem alanı gönderilmedi ⇒ mevcut kalemler AYNEN korunur.
    v_result_count := array_length(v_existing_ids, 1) - coalesce(array_length(v_delete_ids, 1), 0);
  else
    select coalesce(array_agg((e ->> 'id')::uuid), array[]::uuid[])
      into v_submitted_ids
      from jsonb_array_elements(p_lines) e
     where e ->> 'id' is not null;

    -- Aynı kalem birden fazla kez gönderilemez.
    if (select count(*) from unnest(v_submitted_ids)) <>
       (select count(distinct x) from unnest(v_submitted_ids) x) then
      raise exception 'TESLIMAT_DUPLICATE_LINE_ID';
    end if;

    -- Gönderilen her mevcut kimlik bu teslimata ait olmalı (yabancı kimlik reddi).
    select x into v_bad_id
      from unnest(v_submitted_ids) x
     where not (x = any(v_existing_ids))
     limit 1;
    if v_bad_id is not null then
      raise exception 'TESLIMAT_LINE_NOT_IN_PARENT: %', v_bad_id;
    end if;

    -- Bir kalem hem güncellenip hem silinemez.
    select x into v_bad_id
      from unnest(v_submitted_ids) x
     where x = any(v_delete_ids)
     limit 1;
    if v_bad_id is not null then
      raise exception 'TESLIMAT_INVALID_PAYLOAD: kalem hem güncellenip hem silinemez.';
    end if;

    -- `lines` tam ve nihai listedir: listede olmayan mevcut kalemler silinir.
    v_delete_ids := (
      select coalesce(array_agg(distinct x), array[]::uuid[])
        from (
          select unnest(v_delete_ids) as x
          union
          select unnest(v_existing_ids) as x
           where not (x = any(v_submitted_ids))
        ) s
    );

    v_result_count := (select count(*) from jsonb_array_elements(p_lines));
  end if;

  -- Sonuç boş kalem listesi yalnızca AÇIK onayla kabul edilir.
  if coalesce(v_result_count, 0) <= 0
     and coalesce(array_length(v_existing_ids, 1), 0) > 0
     and p_confirm_delete_all is not true then
    raise exception 'TESLIMAT_EMPTY_LINES_NOT_CONFIRMED';
  end if;

  -- ══ 8. ESKİ stok etkisi (yazmadan ÖNCE ölçülür) ══════════════════════════
  --    Tasarım §4: etki YALNIZCA durum = 'tamamlandi' iken vardır.
  if v_old_durum = 'tamamlandi' then
    select coalesce(jsonb_object_agg(urun_id::text, qty), '{}'::jsonb)
      into v_old_effect
      from (
        select urun_id, sum(miktar) as qty
          from public.teslimat_kalemleri
         where teslimat_id = p_teslimat_id
           and urun_id is not null
           and stoktan_duser_mi
           and miktar > 0
         group by urun_id
      ) s;
  end if;

  -- ══ 9. Yazmalar — silme EN SON ═══════════════════════════════════════════

  -- (9a) Üst kayıt. `id`, `firma_id`, `teslimat_no` istemciden DEĞİŞTİRİLEMEZ.
  if p_parent_patch is not null and p_parent_patch <> '{}'::jsonb then
    update public.teslimatlar t
       set customer_id     = coalesce((p_parent_patch ->> 'customer_id')::uuid, t.customer_id),
           sube_id         = case when p_parent_patch ? 'sube_id'
                                  then (p_parent_patch ->> 'sube_id')::uuid else t.sube_id end,
           personel_id     = case when p_parent_patch ? 'personel_id'
                                  then (p_parent_patch ->> 'personel_id')::uuid else t.personel_id end,
           teslimat_tarihi = coalesce((p_parent_patch ->> 'teslimat_tarihi')::date, t.teslimat_tarihi),
           hedef_tarih     = case when p_parent_patch ? 'hedef_tarih'
                                  then (p_parent_patch ->> 'hedef_tarih')::date else t.hedef_tarih end,
           durum           = v_new_durum,
           on_kayit_secimi = coalesce(p_parent_patch ->> 'on_kayit_secimi', t.on_kayit_secimi),
           aciklama        = case when p_parent_patch ? 'aciklama'
                                  then p_parent_patch ->> 'aciklama' else t.aciklama end,
           notlar          = case when p_parent_patch ? 'notlar'
                                  then p_parent_patch ->> 'notlar' else t.notlar end,
           updated_at      = now()
     where t.id = p_teslimat_id;
  else
    update public.teslimatlar set updated_at = now() where id = p_teslimat_id;
  end if;

  if p_lines is not null then
    -- (9b) Yeni kalemler (id yok) — üst kayıttan sonra, silmeden önce.
    for v_item in select * from jsonb_array_elements(p_lines) loop
      if (v_item ->> 'id') is not null then continue; end if;
      v_fields := v_item -> 'fields';

      insert into public.teslimat_kalemleri (
        teslimat_id, urun_id, aciklama, hareket_yonu, hareket_tipi,
        miktar, birim, birim_fiyat, toplam_tutar,
        stoktan_duser_mi, musteri_envanterine_isler_mi, emanet_mi,
        geri_alinmasi_gerekir_mi, hedef_tarih, faturalanir_mi,
        onceki_kalem_id, notlar, firma_id
      ) values (
        p_teslimat_id,
        (v_fields ->> 'urun_id')::uuid,
        v_fields ->> 'aciklama',
        v_fields ->> 'hareket_yonu',
        v_fields ->> 'hareket_tipi',
        coalesce((v_fields ->> 'miktar')::numeric, 1),
        coalesce(v_fields ->> 'birim', 'adet'),
        coalesce((v_fields ->> 'birim_fiyat')::numeric, 0),
        coalesce((v_fields ->> 'toplam_tutar')::numeric, 0),
        coalesce((v_fields ->> 'stoktan_duser_mi')::boolean, false),
        coalesce((v_fields ->> 'musteri_envanterine_isler_mi')::boolean, false),
        coalesce((v_fields ->> 'emanet_mi')::boolean, false),
        coalesce((v_fields ->> 'geri_alinmasi_gerekir_mi')::boolean, false),
        (v_fields ->> 'hedef_tarih')::date,
        coalesce((v_fields ->> 'faturalanir_mi')::boolean, false),
        (v_fields ->> 'onceki_kalem_id')::uuid,
        v_fields ->> 'notlar',
        v_row_firma
      );
      v_inserted := v_inserted + 1;
    end loop;

    -- (9c) Mevcut kalemler — YALNIZCA bu teslimata ait olanlar güncellenir.
    for v_item in select * from jsonb_array_elements(p_lines) loop
      if (v_item ->> 'id') is null then continue; end if;
      v_line_id := (v_item ->> 'id')::uuid;
      v_fields  := v_item -> 'fields';

      update public.teslimat_kalemleri k
         set urun_id                      = (v_fields ->> 'urun_id')::uuid,
             aciklama                     = coalesce(v_fields ->> 'aciklama', k.aciklama),
             hareket_yonu                 = coalesce(v_fields ->> 'hareket_yonu', k.hareket_yonu),
             hareket_tipi                 = coalesce(v_fields ->> 'hareket_tipi', k.hareket_tipi),
             miktar                       = coalesce((v_fields ->> 'miktar')::numeric, k.miktar),
             birim                        = coalesce(v_fields ->> 'birim', k.birim),
             birim_fiyat                  = coalesce((v_fields ->> 'birim_fiyat')::numeric, k.birim_fiyat),
             toplam_tutar                 = coalesce((v_fields ->> 'toplam_tutar')::numeric, k.toplam_tutar),
             stoktan_duser_mi             = coalesce((v_fields ->> 'stoktan_duser_mi')::boolean, k.stoktan_duser_mi),
             musteri_envanterine_isler_mi = coalesce((v_fields ->> 'musteri_envanterine_isler_mi')::boolean, k.musteri_envanterine_isler_mi),
             emanet_mi                    = coalesce((v_fields ->> 'emanet_mi')::boolean, k.emanet_mi),
             geri_alinmasi_gerekir_mi     = coalesce((v_fields ->> 'geri_alinmasi_gerekir_mi')::boolean, k.geri_alinmasi_gerekir_mi),
             hedef_tarih                  = (v_fields ->> 'hedef_tarih')::date,
             faturalanir_mi               = coalesce((v_fields ->> 'faturalanir_mi')::boolean, k.faturalanir_mi),
             notlar                       = v_fields ->> 'notlar'
       where k.id = v_line_id
         and k.teslimat_id = p_teslimat_id;   -- yabancı kayda sızma koruması

      get diagnostics v_affected = row_count;
      if v_affected = 0 then
        raise exception 'TESLIMAT_LINE_NOT_IN_PARENT: %', v_line_id;
      end if;
      v_updated := v_updated + 1;
    end loop;
  end if;

  -- (9d) Silme EN SON — yalnızca bu teslimata ait kimliklerle.
  --      CASCADE emanet/geri teslim takiplerini ve kapatma defterini de temizler.
  if coalesce(array_length(v_delete_ids, 1), 0) > 0 then
    -- Silinen kalemlerin FIFO tüketimini önce geri al (aşağıdaki §12 ile aynı mantık).
    perform public.teslimat_takip_kapatma_geri_al(v_delete_ids);

    delete from public.teslimat_kalemleri
     where id = any(v_delete_ids)
       and teslimat_id = p_teslimat_id;
    get diagnostics v_deleted = row_count;

    if v_deleted <> array_length(v_delete_ids, 1) then
      raise exception 'TESLIMAT_LINE_NOT_IN_PARENT: silinmek istenen kalem bu kayda ait değil.';
    end if;
  end if;

  -- ══ 10. YENİ stok etkisi ve NET DELTA ════════════════════════════════════
  if v_new_durum = 'tamamlandi' then
    select coalesce(jsonb_object_agg(urun_id::text, qty), '{}'::jsonb)
      into v_new_effect
      from (
        select urun_id, sum(miktar) as qty
          from public.teslimat_kalemleri
         where teslimat_id = p_teslimat_id
           and urun_id is not null
           and stoktan_duser_mi
           and miktar > 0
         group by urun_id
      ) s;
  end if;

  for v_urun_id, v_delta in
    select coalesce(n.key, o.key)::uuid,
           coalesce(n.value::numeric, 0) - coalesce(o.value::numeric, 0)
      from jsonb_each_text(v_new_effect) n
      full join jsonb_each_text(v_old_effect) o on o.key = n.key
  loop
    if v_delta = 0 then continue; end if;

    -- Read-modify-write yarışına karşı satır kilidi (tasarım §2.8).
    select stok_adedi into v_new_stok
      from public.urun_stok
     where urun_id = v_urun_id
     for update;

    if found then
      v_new_stok := v_new_stok - v_delta;
      update public.urun_stok
         set stok_adedi = v_new_stok, updated_at = now()
       where urun_id = v_urun_id;
    else
      v_new_stok := 0 - v_delta;
      insert into public.urun_stok (urun_id, stok_adedi)
      values (v_urun_id, v_new_stok);
    end if;

    if v_new_stok < 0 then
      -- Mevcut davranış korunur: negatif stok BLOKLANMAZ, raporlanır (tasarım §4).
      v_negative_urunler := v_negative_urunler || v_urun_id;
    end if;

    -- Audit izi. `firma_id` doğrulanan firmadan yazılır (tasarım §2.6 / T5).
    insert into public.depo_hareketleri (
      hareket_tipi, kaynak, kaynak_id, miktar, tarih, referans_no, aciklama, firma_id
    ) values (
      case when v_delta > 0 then 'cikis' else 'giris' end,
      'urun', v_urun_id, abs(v_delta), current_date, v_teslimat_no,
      format('%s güncelleme - net stok farkı', v_teslimat_no),
      v_row_firma
    );
  end loop;

  -- ══ 11. Emanet / geri teslim mutabakatı (kimlik bazlı) ═══════════════════
  --    Yan etkiler YALNIZCA durum = 'tamamlandi' iken vardır (tasarım §2.5).

  -- (11a) Artık koşulu sağlamayan takipler — ilerleme yoksa silinir.
  delete from public.emanet_takipleri e
   where e.teslimat_id = p_teslimat_id
     and coalesce(e.geri_alinan_miktar, 0) = 0
     and not exists (
       select 1 from public.teslimat_kalemleri k
        where k.id = e.kalem_id
          and v_new_durum = 'tamamlandi'
          and (k.hareket_tipi = 'emanet_teslim' or k.emanet_mi)
          and coalesce(k.miktar, 0) > 0
     );

  if exists (
    select 1 from public.emanet_takipleri e
     where e.teslimat_id = p_teslimat_id
       and coalesce(e.geri_alinan_miktar, 0) > 0
       and not exists (
         select 1 from public.teslimat_kalemleri k
          where k.id = e.kalem_id
            and v_new_durum = 'tamamlandi'
            and (k.hareket_tipi = 'emanet_teslim' or k.emanet_mi)
       )
  ) then
    raise exception 'TESLIMAT_TRACKING_IN_PROGRESS: kısmen geri alınmış emanet kaydı kaldırılamaz.';
  end if;

  delete from public.geri_teslim_takipleri g
   where g.teslimat_id = p_teslimat_id
     and coalesce(g.teslim_edilen_miktar, 0) = 0
     and not exists (
       select 1 from public.teslimat_kalemleri k
        where k.id = g.kalem_id
          and v_new_durum = 'tamamlandi'
          and (
            k.hareket_tipi in ('dolum_icin_alindi', 'bakim_icin_alindi', 'yenileme_icin_alindi')
            or (k.geri_alinmasi_gerekir_mi and k.hareket_tipi <> 'emanet_teslim')
          )
     );

  if exists (
    select 1 from public.geri_teslim_takipleri g
     where g.teslimat_id = p_teslimat_id
       and coalesce(g.teslim_edilen_miktar, 0) > 0
       and not exists (
         select 1 from public.teslimat_kalemleri k
          where k.id = g.kalem_id
            and v_new_durum = 'tamamlandi'
            and (
              k.hareket_tipi in ('dolum_icin_alindi', 'bakim_icin_alindi', 'yenileme_icin_alindi')
              or (k.geri_alinmasi_gerekir_mi and k.hareket_tipi <> 'emanet_teslim')
            )
       )
  ) then
    raise exception 'TESLIMAT_TRACKING_IN_PROGRESS: kısmen teslim edilmiş geri teslim kaydı kaldırılamaz.';
  end if;

  if v_new_durum = 'tamamlandi' then
    -- (11b) Emanet: kimlik bazlı upsert. `kalem_id` doğal anahtardır (§2.3).
    insert into public.emanet_takipleri (
      teslimat_id, kalem_id, customer_id, sube_id, urun_id,
      miktar, geri_alinan_miktar, hedef_tarih, durum, firma_id
    )
    select p_teslimat_id, k.id, t.customer_id, t.sube_id, k.urun_id,
           k.miktar, 0, coalesce(k.hedef_tarih, t.hedef_tarih), 'acik', v_row_firma
      from public.teslimat_kalemleri k
      join public.teslimatlar t on t.id = k.teslimat_id
     where k.teslimat_id = p_teslimat_id
       and (k.hareket_tipi = 'emanet_teslim' or k.emanet_mi)
       and coalesce(k.miktar, 0) > 0
    on conflict (kalem_id) do update
       set miktar      = excluded.miktar,
           urun_id     = excluded.urun_id,
           customer_id = excluded.customer_id,
           sube_id     = excluded.sube_id,
           hedef_tarih = excluded.hedef_tarih,
           firma_id    = excluded.firma_id;

    if exists (
      select 1 from public.emanet_takipleri
       where teslimat_id = p_teslimat_id
         and coalesce(geri_alinan_miktar, 0) > miktar
    ) then
      raise exception 'TESLIMAT_TRACKING_IN_PROGRESS: yeni miktar geri alınan miktardan küçük olamaz.';
    end if;

    -- (11c) Geri teslim: aynı sözleşme.
    insert into public.geri_teslim_takipleri (
      teslimat_id, kalem_id, customer_id, sube_id, urun_id,
      miktar, teslim_edilen_miktar, hedef_tarih, firma_id
    )
    select p_teslimat_id, k.id, t.customer_id, t.sube_id, k.urun_id,
           k.miktar, 0, coalesce(k.hedef_tarih, t.hedef_tarih), v_row_firma
      from public.teslimat_kalemleri k
      join public.teslimatlar t on t.id = k.teslimat_id
     where k.teslimat_id = p_teslimat_id
       and (
         k.hareket_tipi in ('dolum_icin_alindi', 'bakim_icin_alindi', 'yenileme_icin_alindi')
         or (k.geri_alinmasi_gerekir_mi and k.hareket_tipi <> 'emanet_teslim')
       )
    on conflict (kalem_id) do update
       set miktar      = excluded.miktar,
           urun_id     = excluded.urun_id,
           customer_id = excluded.customer_id,
           sube_id     = excluded.sube_id,
           hedef_tarih = excluded.hedef_tarih,
           firma_id    = excluded.firma_id;

    if exists (
      select 1 from public.geri_teslim_takipleri
       where teslimat_id = p_teslimat_id
         and coalesce(teslim_edilen_miktar, 0) > miktar
    ) then
      raise exception 'TESLIMAT_TRACKING_IN_PROGRESS: yeni miktar teslim edilen miktardan küçük olamaz.';
    end if;
  end if;

  -- ══ 12. FIFO kapatma — önce geri al, sonra yeniden uygula (idempotent) ════
  select coalesce(array_agg(id), array[]::uuid[]) into v_existing_ids
    from public.teslimat_kalemleri where teslimat_id = p_teslimat_id;

  perform public.teslimat_takip_kapatma_geri_al(v_existing_ids);

  if v_new_durum = 'tamamlandi' then
    -- (12a) `dolumlu_teslim` ⇒ açık geri teslim takiplerini FIFO ile kapat.
    for v_item in
      select to_jsonb(k) from public.teslimat_kalemleri k
       where k.teslimat_id = p_teslimat_id and k.hareket_tipi = 'dolumlu_teslim'
    loop
      v_kalan := coalesce((v_item ->> 'miktar')::numeric, 0);

      for v_takip in
        select g.id, g.miktar, g.teslim_edilen_miktar
          from public.geri_teslim_takipleri g
          join public.teslimatlar t on t.id = g.teslimat_id
         where g.customer_id = (select customer_id from public.teslimatlar where id = p_teslimat_id)
           and g.durum in ('bekliyor', 'kismi_teslim')
           and g.sube_id is not distinct from (select sube_id from public.teslimatlar where id = p_teslimat_id)
           and g.urun_id is not distinct from (v_item ->> 'urun_id')::uuid
           and t.firma_id is not distinct from v_row_firma
         order by g.created_at asc
         for update of g
      loop
        exit when v_kalan <= 0;
        v_acik := greatest(coalesce(v_takip.miktar, 0) - coalesce(v_takip.teslim_edilen_miktar, 0), 0);
        continue when v_acik <= 0;

        v_kapanan := least(v_acik, v_kalan);
        v_yeni_miktar := coalesce(v_takip.teslim_edilen_miktar, 0) + v_kapanan;
        v_kalan := v_kalan - v_kapanan;
        v_durum_metni := case when v_yeni_miktar >= v_takip.miktar then 'teslim_edildi' else 'kismi_teslim' end;

        update public.geri_teslim_takipleri
           set teslim_edilen_miktar = v_yeni_miktar,
               durum = v_durum_metni,
               kapandi_at = case when v_durum_metni = 'teslim_edildi' then now() else null end
         where id = v_takip.id;

        insert into public.teslimat_takip_kapatma (kalem_id, takip_tipi, takip_id, miktar, firma_id)
        values ((v_item ->> 'id')::uuid, 'geri_teslim', v_takip.id, v_kapanan, v_row_firma);
      end loop;
    end loop;

    -- (12b) `emanet_geri_alindi` ⇒ açık emanet takiplerini FIFO ile kapat.
    for v_item in
      select to_jsonb(k) from public.teslimat_kalemleri k
       where k.teslimat_id = p_teslimat_id and k.hareket_tipi = 'emanet_geri_alindi'
    loop
      v_kalan := coalesce((v_item ->> 'miktar')::numeric, 0);

      for v_takip in
        select e.id, e.miktar, e.geri_alinan_miktar
          from public.emanet_takipleri e
          join public.teslimatlar t on t.id = e.teslimat_id
         where e.customer_id = (select customer_id from public.teslimatlar where id = p_teslimat_id)
           and e.durum in ('acik', 'kismi_kapandi')
           and e.sube_id is not distinct from (select sube_id from public.teslimatlar where id = p_teslimat_id)
           and e.urun_id is not distinct from (v_item ->> 'urun_id')::uuid
           and t.firma_id is not distinct from v_row_firma
         order by e.created_at asc
         for update of e
      loop
        exit when v_kalan <= 0;
        v_acik := greatest(coalesce(v_takip.miktar, 0) - coalesce(v_takip.geri_alinan_miktar, 0), 0);
        continue when v_acik <= 0;

        v_kapanan := least(v_acik, v_kalan);
        v_yeni_miktar := coalesce(v_takip.geri_alinan_miktar, 0) + v_kapanan;
        v_kalan := v_kalan - v_kapanan;
        v_durum_metni := case when v_yeni_miktar >= v_takip.miktar then 'kapandi' else 'kismi_kapandi' end;

        update public.emanet_takipleri
           set geri_alinan_miktar = v_yeni_miktar,
               durum = v_durum_metni,
               kapandi_at = case when v_durum_metni = 'kapandi' then now() else null end
         where id = v_takip.id;

        insert into public.teslimat_takip_kapatma (kalem_id, takip_tipi, takip_id, miktar, firma_id)
        values ((v_item ->> 'id')::uuid, 'emanet', v_takip.id, v_kapanan, v_row_firma);
      end loop;
    end loop;
  end if;

  -- ══ 13. Durum geçmişi + idempotency ══════════════════════════════════════
  if v_old_durum is distinct from v_new_durum then
    insert into public.teslimat_durum_gecmisi (
      teslimat_id, eski_durum, yeni_durum, aciklama, created_by, firma_id
    ) values (
      p_teslimat_id, v_old_durum, v_new_durum, 'Teslimat düzenlendi', v_effective_user, v_row_firma
    );
  end if;

  select updated_at into v_actual_updated from public.teslimatlar where id = p_teslimat_id;

  v_result := jsonb_build_object(
    'teslimat_id', p_teslimat_id,
    'teslimat_no', v_teslimat_no,
    'inserted',    v_inserted,
    'updated',     v_updated,
    'deleted',     v_deleted,
    'old_durum',   v_old_durum,
    'new_durum',   v_new_durum,
    'updated_at',  v_actual_updated,
    'stock_delta_applied',    v_old_effect <> v_new_effect,
    'negative_stock_products', to_jsonb(v_negative_urunler),
    'atomic',      true,
    'replayed',    false
  );

  if p_idempotency_key is not null then
    -- Anahtar sonucu transaction ile birlikte kalıcılaşır: rollback olursa
    -- anahtar da geri alınır ve kullanıcı tekrar deneyebilir.
    insert into public.aggregate_idempotency (key, firma_id, module, parent_id, result, payload_fingerprint)
    values (p_idempotency_key, v_user_firma, 'teslimat', p_teslimat_id, v_result, v_fingerprint);
  end if;

  return v_result;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5b. FIFO tüketimini geri alan yardımcı (yalnızca RPC içinden çağrılır)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.teslimat_takip_kapatma_geri_al(p_kalem_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
begin
  if p_kalem_ids is null or array_length(p_kalem_ids, 1) is null then
    return;
  end if;

  for r in
    select * from public.teslimat_takip_kapatma
     where kalem_id = any(p_kalem_ids)
     order by created_at
  loop
    if r.takip_tipi = 'geri_teslim' then
      update public.geri_teslim_takipleri g
         set teslim_edilen_miktar = greatest(coalesce(g.teslim_edilen_miktar, 0) - r.miktar, 0),
             durum = case
                       when greatest(coalesce(g.teslim_edilen_miktar, 0) - r.miktar, 0) <= 0 then 'bekliyor'
                       else 'kismi_teslim'
                     end,
             kapandi_at = null
       where g.id = r.takip_id
         and g.durum <> 'iptal';
    else
      update public.emanet_takipleri e
         set geri_alinan_miktar = greatest(coalesce(e.geri_alinan_miktar, 0) - r.miktar, 0),
             durum = case
                       when greatest(coalesce(e.geri_alinan_miktar, 0) - r.miktar, 0) <= 0 then 'acik'
                       else 'kismi_kapandi'
                     end,
             kapandi_at = null
       where e.id = r.takip_id
         and e.durum <> 'iptal';
    end if;
  end loop;

  delete from public.teslimat_takip_kapatma where kalem_id = any(p_kalem_ids);
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. YETKİLER
--    Varsayılan PUBLIC execute geri alınır; yalnızca gerçek uygulama rolleri.
--    `authenticated` desteklenir (auth.uid() yolu); `service_role` p_user_id ile.
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on function public.teslimat_update_atomic(
  uuid, jsonb, jsonb, uuid[], boolean, timestamptz, text, uuid, uuid
) from public, anon;

grant execute on function public.teslimat_update_atomic(
  uuid, jsonb, jsonb, uuid[], boolean, timestamptz, text, uuid, uuid
) to authenticated, service_role;

-- Yardımcı fonksiyon dışarıya AÇILMAZ (yalnızca definer zincirinden çağrılır).
revoke all on function public.teslimat_takip_kapatma_geri_al(uuid[])
  from public, anon, authenticated;

commit;

-- ============================================================================
-- ROLLBACK PLANI  (otomatik ÇALIŞMAZ — bilinçli ve ayrı çalıştırılır)
-- ============================================================================
-- SIRA ÖNEMLİ: önce uygulama kodu eski sürüme alınır, sonra RPC düşürülür.
-- Aksi hâlde kod `TESLIMAT_RPC_MISSING` döndürmeye devam eder.
--
-- Aşağıdaki blok VERİ KAYBI YARATABİLECEK hiçbir DROP'u otomatik çalıştırmaz.
-- `teslimat_takip_kapatma` tablosu FIFO tüketim geçmişini taşır; düşürülürse
-- geçmiş tüketim geri alınamaz hale gelir — bu yüzden yorumda bırakılmıştır.
--
-- begin;
--   drop function if exists public.teslimat_update_atomic(
--     uuid, jsonb, jsonb, uuid[], boolean, timestamptz, text, uuid, uuid);
--   drop function if exists public.teslimat_takip_kapatma_geri_al(uuid[]);
--
--   -- Aşağıdakiler VERİ/KISIT taşır; yalnızca bilinçli kararla:
--   -- drop index if exists public.emanet_takipleri_kalem_id_key;
--   -- drop index if exists public.geri_teslim_takipleri_kalem_id_key;
--   -- drop table if exists public.teslimat_takip_kapatma;   -- ⚠ tüketim geçmişi kaybolur
--   -- alter table public.aggregate_idempotency drop column if exists payload_fingerprint;
--
--   -- DİKKAT: emanet_takipleri.firma_id / geri_teslim_takipleri.firma_id
--   -- GERİ ALINMAZ; tenant güvenliği için kalması gerekir.
-- commit;
