-- RBAC ve şube bazlı yetki genişletmesi

create table if not exists public.kullanici_rolleri (
  id uuid primary key default gen_random_uuid(),
  kullanici_id uuid not null references auth.users(id) on delete cascade,
  rol_id uuid not null references public.roller(id) on delete cascade,
  created_at timestamptz default now(),
  unique (kullanici_id, rol_id)
);

create table if not exists public.rol_yetkileri (
  id uuid primary key default gen_random_uuid(),
  rol_id uuid not null references public.roller(id) on delete cascade,
  modul_adi varchar(100) not null,
  okuma boolean default false,
  yazma boolean default false,
  silme boolean default false,
  created_at timestamptz default now(),
  unique (rol_id, modul_adi)
);

create table if not exists public.kullanici_sube_yetkileri (
  id uuid primary key default gen_random_uuid(),
  kullanici_id uuid not null references auth.users(id) on delete cascade,
  sube_id uuid not null references public.subeler(id) on delete cascade,
  created_at timestamptz default now(),
  unique (kullanici_id, sube_id)
);

alter table public.roller add column if not exists sistem_rolu boolean not null default false;
alter table public.kullanici_profiller add column if not exists sube_id uuid references public.subeler(id) on delete set null;

alter table public.kullanici_rolleri enable row level security;
alter table public.rol_yetkileri enable row level security;
alter table public.kullanici_sube_yetkileri enable row level security;

drop policy if exists "kullanici_rolleri_okuma" on public.kullanici_rolleri;
create policy "kullanici_rolleri_okuma" on public.kullanici_rolleri
  for select to authenticated using (true);

drop policy if exists "rol_yetkileri_okuma" on public.rol_yetkileri;
create policy "rol_yetkileri_okuma" on public.rol_yetkileri
  for select to authenticated using (true);

drop policy if exists "kullanici_sube_yetkileri_okuma" on public.kullanici_sube_yetkileri;
create policy "kullanici_sube_yetkileri_okuma" on public.kullanici_sube_yetkileri
  for select to authenticated using (auth.uid() = kullanici_id);

insert into public.roller (id, ad, aciklama, renk, sistem_rolu) values
  ('00000000-0000-0000-0000-000000000001', 'Admin', 'Tüm modüllere ve şubelere tam yetki', '#C8102E', true),
  ('00000000-0000-0000-0000-000000000006', 'Super Admin', 'Tüm modüllere ve şubelere tam yetki', '#111827', true),
  ('00000000-0000-0000-0000-000000000007', 'İstanbul Şube Yöneticisi', 'Sadece İstanbul şube kayıtlarını yönetir', '#2563EB', false),
  ('00000000-0000-0000-0000-000000000008', 'Erzincan Şube Yöneticisi', 'Sadece Erzincan şube kayıtlarını yönetir', '#16A34A', false)
on conflict (ad) do update set
  aciklama = excluded.aciklama,
  renk = excluded.renk,
  sistem_rolu = excluded.sistem_rolu;

with modules(modul_adi) as (
  values
    ('dashboard'), ('customers'), ('devices'), ('service_forms'), ('factory'),
    ('deliveries'), ('operations'), ('operation_requests'), ('operation_work_plans'),
    ('reminders'), ('price_offers'), ('proforma_invoices'), ('current_account'),
    ('invoices'), ('outgoing_invoices'), ('incoming_invoices'), ('customer_current'),
    ('supplier_current'), ('suppliers'), ('agents'), ('branches'), ('personnel'),
    ('customer_import'), ('invoice_import'), ('technical_reports'),
    ('technical_calculations'), ('water_system_reports'), ('room_integrity_test'),
    ('fire_alarm_calculation'), ('general_need_report'), ('management'), ('users'),
    ('roles'), ('settings'), ('logs'),
    ('musteriler'), ('cihazlar'), ('servis_formlari'), ('cari_hesap'), ('faturalar'),
    ('fiyat_teklifleri'), ('hatirlatmalar'), ('aracilar'), ('fabrika'), ('yonetim'),
    ('subeler'), ('personel')
)
insert into public.modul_izinleri (rol_id, modul_adi, okuma, yazma, silme)
select r.id, m.modul_adi, true, true, true
from public.roller r
cross join modules m
where r.ad in ('Admin', 'Super Admin')
on conflict (rol_id, modul_adi) do update set okuma = true, yazma = true, silme = true;

with branch_manager_modules(modul_adi) as (
  values
    ('dashboard'), ('customers'), ('musteriler'), ('devices'), ('cihazlar'),
    ('service_forms'), ('servis_formlari'), ('deliveries'), ('operations'),
    ('operation_requests'), ('operation_work_plans'), ('reminders'), ('hatirlatmalar'),
    ('technical_reports'), ('technical_calculations'), ('water_system_reports'),
    ('room_integrity_test'), ('fire_alarm_calculation'), ('general_need_report'),
    ('current_account'), ('invoices'), ('outgoing_invoices'), ('incoming_invoices'),
    ('customer_current'), ('supplier_current'), ('suppliers'), ('agents'),
    ('cari_hesap'), ('faturalar'), ('aracilar')
)
insert into public.modul_izinleri (rol_id, modul_adi, okuma, yazma, silme)
select r.id, m.modul_adi, true, true, false
from public.roller r
cross join branch_manager_modules m
where r.ad in ('İstanbul Şube Yöneticisi', 'Erzincan Şube Yöneticisi')
on conflict (rol_id, modul_adi) do update set okuma = true, yazma = true;

insert into public.kullanici_rolleri (kullanici_id, rol_id)
select id, rol_id from public.kullanici_profiller
where rol_id is not null
on conflict (kullanici_id, rol_id) do nothing;

insert into public.kullanici_sube_yetkileri (kullanici_id, sube_id)
select id, sube_id from public.kullanici_profiller
where sube_id is not null
on conflict (kullanici_id, sube_id) do nothing;

insert into public.rol_yetkileri (rol_id, modul_adi, okuma, yazma, silme)
select rol_id, modul_adi, okuma, yazma, silme
from public.modul_izinleri
on conflict (rol_id, modul_adi) do update set
  okuma = excluded.okuma,
  yazma = excluded.yazma,
  silme = excluded.silme;

create index if not exists kullanici_sube_yetkileri_kullanici_idx on public.kullanici_sube_yetkileri(kullanici_id);
create index if not exists kullanici_sube_yetkileri_sube_idx on public.kullanici_sube_yetkileri(sube_id);
create index if not exists modul_izinleri_rol_modul_idx on public.modul_izinleri(rol_id, modul_adi);
