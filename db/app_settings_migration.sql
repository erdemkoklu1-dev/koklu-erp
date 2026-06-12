-- ============================================================
-- APP SETTINGS MIGRATION (idempotent)
-- Uygulama geneli anahtar-değer ayarları
-- ============================================================

create table if not exists public.app_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists "Service role has full access" on public.app_settings;
create policy "Service role has full access" on public.app_settings using (true) with check (true);

-- Varsayılan satırları oluştur (değer boş)
insert into public.app_settings (key, value) values
  ('resend_api_key',     null),
  ('netgsm_usercode',    null),
  ('netgsm_password',    null),
  ('netgsm_msgheader',   'KOKLU'),
  ('whatsapp_phone',     null),
  ('company_stamp_settings', '{"stampDataUrl":null,"stampFileName":null,"defaultStamped":false,"updatedAt":null}')
on conflict (key) do nothing;
