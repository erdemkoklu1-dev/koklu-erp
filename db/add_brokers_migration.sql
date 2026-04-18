-- ============================================================
-- ARACI/PAZARLAMACı MODÜLü MİGRATION
-- Köklü ERP — Aracı Komisyon Yönetimi
-- ============================================================

-- ---- BROKERS (Aracılar) ----

create table public.brokers (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null,
  company_name text,
  phone        text,
  email        text,
  notes        text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_brokers_is_active on public.brokers(is_active);

create trigger trg_brokers_updated_at
  before update on public.brokers
  for each row execute function public.set_updated_at();

-- ---- INVOICE_BROKERS (Fatura-Aracı İlişkisi) ----

create table public.invoice_brokers (
  id                uuid primary key default gen_random_uuid(),
  invoice_id        uuid not null references public.invoices(id) on delete cascade,
  broker_id         uuid not null references public.brokers(id) on delete cascade,
  commission_rate   numeric(5,2) not null default 0,
  commission_amount numeric(14,2) not null default 0,
  is_paid           boolean not null default false,
  paid_date         date,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique(invoice_id, broker_id)
);

create index idx_invoice_brokers_invoice_id on public.invoice_brokers(invoice_id);
create index idx_invoice_brokers_broker_id  on public.invoice_brokers(broker_id);

create trigger trg_invoice_brokers_updated_at
  before update on public.invoice_brokers
  for each row execute function public.set_updated_at();
