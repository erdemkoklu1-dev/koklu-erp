-- ============================================================================
-- KÖKLÜ ERP — EMANET GERİ ALMA / GERİ TESLİM KAPATMA (tek transaction)
-- ============================================================================
--
-- !!! BU DOSYA OTOMATİK OLARAK ÇALIŞTIRILMAZ !!!
--
--  * Production Supabase üzerinde ÇALIŞTIRILMAZ.
--  * Staging env doğrulaması PASS olmadan staging üzerinde de ÇALIŞTIRILMAZ.
--    Güncel durum: `node scripts/verify-staging-env.mjs` → exit 1 (NO-GO).
--
-- BAĞIMLILIKLAR (bu sırayla apply edilmiş olmalıdır):
--   1. db/teslimatlar_migration.sql        → emanet_takipleri, geri_teslim_takipleri
--   2. db/tenant_migration.sql             → firmalar, kullanici_profiller.firma_id
--   3. db/aggregate_atomic_update_rpc.sql  → public.aggregate_idempotency
--   4. db/teslimat_atomic_update_rpc.sql   → takip tablolarına firma_id,
--                                            aggregate_idempotency.payload_fingerprint
--
-- ── ÇÖZÜLEN AÇIK (denetim P0 / GOREV.md §9) ─────────────────────────────────
-- `emanetGeriAlAction` ve `geriTeslimYapAction`
-- (`src/app/(dashboard)/teslimatlar/actions.ts`, eski hâli) takip satırını
-- YALNIZCA `id` ile okuyup güncelliyordu:
--
--     supabase.from('emanet_takipleri').select('id, miktar').eq('id', takipId)
--     supabase.from('emanet_takipleri').update({...}).eq('id', takipId)
--
-- Bu çağrılar service-role istemcisiyle yapıldığı için RLS devre dışıydı ve
-- HİÇBİR tenant kontrolü yoktu: geçerli oturumu olan herhangi bir kullanıcı,
-- başka bir firmanın takip kimliğini göndererek o kaydı kapatabiliyordu.
-- Ayrıca okuma ile yazma arasında kilit yoktu (çift tıklama yarışı).
--
-- ── BU RPC'NİN GARANTİLERİ ──────────────────────────────────────────────────
--   * Kullanıcı kimliği `auth.uid()`'den (veya service-role + p_user_id) alınır.
--   * Firma üyeliği `kullanici_profiller`den TÜRETİLİR; istemciden gelen
--     `p_firma_id` yetki kanıtı SAYILMAZ, yalnızca çapraz kontrol edilir.
--   * Takip satırı VE üst teslimat kaydı ayrı ayrı tenant doğrulamasından geçer.
--   * Satır `for update` ile kilitlenir ⇒ eşzamanlı iki istek serileşir.
--   * Zaten kapalı kayıt idempotent no-op döner (ikinci yan etki yok).
--   * Aynı idempotency anahtarı farklı payload ile gelirse conflict döner.
--   * Hata mesajları müşteri/VKN/ham DB ayrıntısı sızdırmaz; "bulunamadı" ile
--     "başka tenant" bilinçli olarak AYNI mesajı döndürür (varlık sızıntısı yok).
--
-- ── STOK KAPSAM SINIRI (bilinçli, uydurma kural YOK) ────────────────────────
-- Emanetin geri alınması veya geri teslimin tamamlanması MEVCUT kodda stoku
-- ETKİLEMEZ (`src/lib/teslimatlar.ts` → `applyKalemSideEffects` yalnızca
-- `emanet_teslim` kalemini stoktan düşer; kapatma yolunda stok yazması yoktur).
-- Bu sprint mevcut domain davranışını KORUR ve yeni bir stok kuralı türetmez.
-- "Emanet geri gelince stok artmalı mı?" sorusu açık bir ürün kararıdır ve
-- `docs/teslimat_atomic_update_design.md` §11'de açık karar olarak izlenir.
--
-- Geri alma: dosyanın en altındaki ROLLBACK bloğu (otomatik ÇALIŞMAZ).
-- ============================================================================

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. BAĞIMLILIK DOĞRULAMASI — eksikse sessizce devam ETMEZ
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if to_regclass('public.emanet_takipleri') is null
     or to_regclass('public.geri_teslim_takipleri') is null then
    raise exception
      'BAĞIMLILIK EKSİK: önce db/teslimatlar_migration.sql apply edilmelidir.';
  end if;

  if to_regclass('public.kullanici_profiller') is null then
    raise exception
      'BAĞIMLILIK EKSİK: önce db/tenant_migration.sql apply edilmelidir.';
  end if;

  if to_regclass('public.aggregate_idempotency') is null then
    raise exception
      'BAĞIMLILIK EKSİK: önce db/aggregate_atomic_update_rpc.sql apply edilmelidir.';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'emanet_takipleri'
       and column_name  = 'firma_id'
  ) then
    raise exception
      'BAĞIMLILIK EKSİK: önce db/teslimat_atomic_update_rpc.sql apply edilmelidir (takip tablolarına firma_id ekler).';
  end if;

  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'aggregate_idempotency'
       and column_name  = 'payload_fingerprint'
  ) then
    raise exception
      'BAĞIMLILIK EKSİK: önce db/teslimat_atomic_update_rpc.sql apply edilmelidir (payload_fingerprint kolonu).';
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. KAPATMA AUDIT İZİ
--    Kapatmayı KİMİN yaptığı bugüne kadar hiçbir yerde tutulmuyordu.
--    Yeni kolon additive'dir; mevcut satırlar NULL kalır (geçmiş uydurulmaz).
--
--    NOT: kapatma `public.teslimat_takip_kapatma` defterine YAZILMAZ. O defter
--    `teslimat_update_atomic`'in FIFO tüketimini geri alması için kullanılır;
--    manuel kapatmayı oraya yazmak, bir sonraki teslimat güncellemesinde bu
--    kapatmanın sessizce geri alınmasına yol açardı.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.emanet_takipleri
  add column if not exists kapatan_kullanici_id uuid references public.kullanici_profiller(id) on delete set null;

alter table public.geri_teslim_takipleri
  add column if not exists kapatan_kullanici_id uuid references public.kullanici_profiller(id) on delete set null;

create index if not exists emanet_takipleri_firma_idx
  on public.emanet_takipleri(firma_id);
create index if not exists geri_teslim_takipleri_firma_idx
  on public.geri_teslim_takipleri(firma_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ORTAK YETKİ ÇÖZÜCÜ
--    Çağıranın gerçek kimliğini ve firmasını döndürür. İstemciden gelen
--    firma_id burada YETKİ KANITI OLARAK KULLANILMAZ.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.teslimat_takip_resolve_actor(
  p_user_id  uuid default null,
  p_firma_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_auth_uid       uuid;
  v_jwt_role       text;
  v_effective_user uuid;
  v_user_firma     uuid;
  v_is_super_admin boolean := false;
begin
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
      raise exception 'TESLIMAT_NOT_AUTHENTICATED: service-role çağrısında p_user_id zorunludur.';
    end if;
    v_effective_user := p_user_id;
  else
    raise exception 'TESLIMAT_NOT_AUTHENTICATED';
  end if;

  select kp.firma_id, coalesce(r.ad = 'Super Admin', false)
    into v_user_firma, v_is_super_admin
    from public.kullanici_profiller kp
    left join public.roller r on r.id = kp.rol_id
   where kp.id = v_effective_user;

  if not found or v_user_firma is null then
    raise exception 'TESLIMAT_NO_TENANT: kullanıcıya bağlı firma bulunamadı.';
  end if;

  -- Çapraz kontrol: istemci bir firma_id gönderdiyse kendi firmasıyla uyuşmalı.
  if p_firma_id is not null and p_firma_id <> v_user_firma and not v_is_super_admin then
    raise exception 'TESLIMAT_TENANT_MISMATCH';
  end if;

  return jsonb_build_object(
    'user_id',        v_effective_user,
    'firma_id',       v_user_firma,
    'is_super_admin', v_is_super_admin
  );
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. EMANET GERİ ALMA — tek transaction
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.teslimat_emanet_geri_al_atomic(
  p_takip_id        uuid,
  p_idempotency_key text default null,
  p_user_id         uuid default null,
  p_firma_id        uuid default null   -- YETKİ KANITI DEĞİL; çapraz kontrol
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor            jsonb;
  v_effective_user   uuid;
  v_user_firma       uuid;
  v_is_super_admin   boolean;

  v_takip_firma      uuid;
  v_teslimat_id      uuid;
  v_parent_firma     uuid;
  v_miktar           numeric;
  v_geri_alinan      numeric;
  v_durum            text;

  v_fingerprint      text;
  v_prev_result      jsonb;
  v_prev_fingerprint text;
  v_result           jsonb;
begin
  if p_takip_id is null then
    raise exception 'TESLIMAT_INVALID_PAYLOAD: takip kimliği zorunlu.';
  end if;

  v_actor          := public.teslimat_takip_resolve_actor(p_user_id, p_firma_id);
  v_effective_user := (v_actor ->> 'user_id')::uuid;
  v_user_firma     := (v_actor ->> 'firma_id')::uuid;
  v_is_super_admin := (v_actor ->> 'is_super_admin')::boolean;

  -- ══ Idempotency ═══════════════════════════════════════════════════════════
  v_fingerprint := md5('emanet_geri_al|' || p_takip_id::text);

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
      return v_prev_result || jsonb_build_object('replayed', true);
    end if;
  end if;

  -- ══ Satır kilidi + sahiplik ═══════════════════════════════════════════════
  select e.firma_id, e.teslimat_id, e.miktar, coalesce(e.geri_alinan_miktar, 0), e.durum
    into v_takip_firma, v_teslimat_id, v_miktar, v_geri_alinan, v_durum
    from public.emanet_takipleri e
   where e.id = p_takip_id
   for update;

  if not found then
    raise exception 'TESLIMAT_TAKIP_NOT_FOUND';
  end if;

  if v_takip_firma is distinct from v_user_firma and not v_is_super_admin then
    -- Varlık sızdırmamak için "bulunamadı" ile aynı sınıf hata döner.
    raise exception 'TESLIMAT_TAKIP_NOT_FOUND';
  end if;

  -- Üst teslimat da AYRI ayrı doğrulanır: takip satırının firma_id'si bozuk
  -- (NULL/eski backfill) olsa bile yabancı tenant erişimi mümkün olmamalıdır.
  select t.firma_id into v_parent_firma
    from public.teslimatlar t
   where t.id = v_teslimat_id
   for update;

  if not found then
    raise exception 'TESLIMAT_TAKIP_NOT_FOUND';
  end if;
  if v_parent_firma is distinct from v_user_firma and not v_is_super_admin then
    raise exception 'TESLIMAT_TAKIP_NOT_FOUND';
  end if;

  -- ══ İdempotent kapatma ════════════════════════════════════════════════════
  if v_durum in ('kapandi', 'iptal') then
    v_result := jsonb_build_object(
      'takip_id',  p_takip_id,
      'tip',       'emanet',
      'durum',     v_durum,
      'changed',   false,
      'atomic',    true,
      'replayed',  false
    );
  else
    update public.emanet_takipleri
       set geri_alinan_miktar   = v_miktar,
           durum                = 'kapandi',
           kapandi_at           = now(),
           kapatan_kullanici_id = v_effective_user
     where id = p_takip_id;

    v_result := jsonb_build_object(
      'takip_id',  p_takip_id,
      'tip',       'emanet',
      'durum',     'kapandi',
      'changed',   true,
      'atomic',    true,
      'replayed',  false
    );
  end if;

  if p_idempotency_key is not null then
    insert into public.aggregate_idempotency (key, firma_id, module, parent_id, result, payload_fingerprint)
    values (p_idempotency_key, v_user_firma, 'teslimat_emanet', v_teslimat_id, v_result, v_fingerprint);
  end if;

  return v_result;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. GERİ TESLİM KAPATMA — tek transaction (aynı sözleşme)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.teslimat_geri_teslim_yap_atomic(
  p_takip_id        uuid,
  p_idempotency_key text default null,
  p_user_id         uuid default null,
  p_firma_id        uuid default null   -- YETKİ KANITI DEĞİL; çapraz kontrol
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor            jsonb;
  v_effective_user   uuid;
  v_user_firma       uuid;
  v_is_super_admin   boolean;

  v_takip_firma      uuid;
  v_teslimat_id      uuid;
  v_parent_firma     uuid;
  v_miktar           numeric;
  v_durum            text;

  v_fingerprint      text;
  v_prev_result      jsonb;
  v_prev_fingerprint text;
  v_result           jsonb;
begin
  if p_takip_id is null then
    raise exception 'TESLIMAT_INVALID_PAYLOAD: takip kimliği zorunlu.';
  end if;

  v_actor          := public.teslimat_takip_resolve_actor(p_user_id, p_firma_id);
  v_effective_user := (v_actor ->> 'user_id')::uuid;
  v_user_firma     := (v_actor ->> 'firma_id')::uuid;
  v_is_super_admin := (v_actor ->> 'is_super_admin')::boolean;

  v_fingerprint := md5('geri_teslim_yap|' || p_takip_id::text);

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
      return v_prev_result || jsonb_build_object('replayed', true);
    end if;
  end if;

  select g.firma_id, g.teslimat_id, g.miktar, g.durum
    into v_takip_firma, v_teslimat_id, v_miktar, v_durum
    from public.geri_teslim_takipleri g
   where g.id = p_takip_id
   for update;

  if not found then
    raise exception 'TESLIMAT_TAKIP_NOT_FOUND';
  end if;
  if v_takip_firma is distinct from v_user_firma and not v_is_super_admin then
    raise exception 'TESLIMAT_TAKIP_NOT_FOUND';
  end if;

  select t.firma_id into v_parent_firma
    from public.teslimatlar t
   where t.id = v_teslimat_id
   for update;

  if not found then
    raise exception 'TESLIMAT_TAKIP_NOT_FOUND';
  end if;
  if v_parent_firma is distinct from v_user_firma and not v_is_super_admin then
    raise exception 'TESLIMAT_TAKIP_NOT_FOUND';
  end if;

  if v_durum in ('teslim_edildi', 'iptal') then
    v_result := jsonb_build_object(
      'takip_id', p_takip_id,
      'tip',      'geri_teslim',
      'durum',    v_durum,
      'changed',  false,
      'atomic',   true,
      'replayed', false
    );
  else
    update public.geri_teslim_takipleri
       set teslim_edilen_miktar = v_miktar,
           durum                = 'teslim_edildi',
           kapandi_at           = now(),
           kapatan_kullanici_id = v_effective_user
     where id = p_takip_id;

    v_result := jsonb_build_object(
      'takip_id', p_takip_id,
      'tip',      'geri_teslim',
      'durum',    'teslim_edildi',
      'changed',  true,
      'atomic',   true,
      'replayed', false
    );
  end if;

  if p_idempotency_key is not null then
    insert into public.aggregate_idempotency (key, firma_id, module, parent_id, result, payload_fingerprint)
    values (p_idempotency_key, v_user_firma, 'teslimat_geri_teslim', v_teslimat_id, v_result, v_fingerprint);
  end if;

  return v_result;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. YETKİLER — varsayılan PUBLIC execute geri alınır
-- ─────────────────────────────────────────────────────────────────────────────

revoke all on function public.teslimat_emanet_geri_al_atomic(uuid, text, uuid, uuid)
  from public, anon;
grant execute on function public.teslimat_emanet_geri_al_atomic(uuid, text, uuid, uuid)
  to authenticated, service_role;

revoke all on function public.teslimat_geri_teslim_yap_atomic(uuid, text, uuid, uuid)
  from public, anon;
grant execute on function public.teslimat_geri_teslim_yap_atomic(uuid, text, uuid, uuid)
  to authenticated, service_role;

-- Yetki çözücü dışarıya AÇILMAZ; yalnızca definer zincirinden çağrılır.
revoke all on function public.teslimat_takip_resolve_actor(uuid, uuid)
  from public, anon, authenticated;

commit;

-- ============================================================================
-- ROLLBACK PLANI  (otomatik ÇALIŞMAZ — bilinçli ve ayrı çalıştırılır)
-- ============================================================================
-- SIRA ÖNEMLİ: önce uygulama kodu eski sürüme alınır, sonra RPC düşürülür.
-- Aksi hâlde kod `TESLIMAT_TAKIP_RPC_MISSING` döndürmeye devam eder.
--
-- DİKKAT: eski uygulama kodu tenant kontrolü YAPMIYORDU. Bu rollback,
-- kapatılmış olan tenant sızıntısını yeniden AÇAR. Yalnızca acil durumda ve
-- açık kararla uygulanmalıdır.
--
-- begin;
--   drop function if exists public.teslimat_emanet_geri_al_atomic(uuid, text, uuid, uuid);
--   drop function if exists public.teslimat_geri_teslim_yap_atomic(uuid, text, uuid, uuid);
--   drop function if exists public.teslimat_takip_resolve_actor(uuid, uuid);
--
--   -- Audit kolonları VERİ taşır; düşürülürse kapatma geçmişi kaybolur:
--   -- alter table public.emanet_takipleri        drop column if exists kapatan_kullanici_id;
--   -- alter table public.geri_teslim_takipleri   drop column if exists kapatan_kullanici_id;
-- commit;
