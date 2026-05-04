create table if not exists public.backup_jobs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references public.kullanici_profiller(id) on delete set null,
  backup_type varchar(30) not null check (backup_type in ('full', 'selected', 'automatic')),
  included_tables text[] not null default '{}',
  row_counts jsonb not null default '{}'::jsonb,
  total_rows integer not null default 0,
  file_size bigint,
  storage_saved boolean not null default false,
  storage_bucket text,
  storage_path text,
  status varchar(40) not null default 'completed',
  error_message text
);

create table if not exists public.backup_restores (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  requested_by uuid references public.kullanici_profiller(id) on delete set null,
  file_name text not null,
  file_size bigint,
  table_count integer not null default 0,
  total_rows integer not null default 0,
  dry_run_result jsonb not null default '{}'::jsonb,
  status varchar(40) not null default 'previewed'
);

create table if not exists public.backup_settings (
  id uuid primary key default '00000000-0000-0000-0000-000000000001',
  enabled boolean not null default false,
  weekday smallint not null default 1 check (weekday between 0 and 6),
  run_at time not null default '03:00',
  storage_enabled boolean not null default true,
  updated_by uuid references public.kullanici_profiller(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.backup_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  job_id uuid references public.backup_jobs(id) on delete set null,
  level varchar(20) not null default 'info',
  message text not null,
  details jsonb not null default '{}'::jsonb
);

alter table public.backup_jobs enable row level security;
alter table public.backup_restores enable row level security;
alter table public.backup_settings enable row level security;
alter table public.backup_logs enable row level security;

insert into public.backup_settings (id)
values ('00000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('backups', 'backups', false)
on conflict (id) do nothing;

create index if not exists backup_jobs_created_at_idx on public.backup_jobs (created_at desc);
create index if not exists backup_restores_created_at_idx on public.backup_restores (created_at desc);
create index if not exists backup_logs_job_id_idx on public.backup_logs (job_id);
