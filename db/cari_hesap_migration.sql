-- ============================================================
-- CARI HESAP MIGRATION
-- Köklü ERP — Finansal Yönetim Modülü
-- ============================================================

-- ---- ENUMS ----

create type public.invoice_type as enum ('satis', 'alis', 'iade_satis', 'iade_alis');
create type public.invoice_status as enum ('taslak', 'kesildi', 'gonderildi', 'odendi', 'kismi_odendi', 'iptal');
create type public.payment_direction as enum ('tahsilat', 'odeme');
create type public.payment_method as enum ('nakit', 'havale_eft', 'kredi_karti', 'cek', 'senet', 'diger');
create type public.transaction_direction as enum ('gelir', 'gider');
create type public.recurrence_period as enum ('aylik', 'ucaylik', 'altiaylik', 'yillik');
create type public.employee_status as enum ('aktif', 'izinli', 'ayrildi');
create type public.tax_type as enum ('kdv', 'muhtasar', 'gelir_vergisi', 'kurumlar_vergisi', 'sgk_bildirimi', 'damga_vergisi');
create type public.declaration_status as enum ('hazirlanacak', 'hazirlandi', 'verildi', 'odendi');

-- ---- INVOICE SERIES ----

create table public.invoice_series (
  id          uuid primary key default gen_random_uuid(),
  prefix      text not null,
  year        smallint not null,
  last_number integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (prefix, year)
);

-- ---- INVOICES ----

create table public.invoices (
  id                  uuid primary key default gen_random_uuid(),
  invoice_number      text not null unique,
  series_id           uuid references public.invoice_series(id),
  invoice_type        public.invoice_type not null default 'satis',
  customer_id         uuid references public.customers(id),
  supplier_name       text,
  supplier_tax_no     text,
  invoice_date        date not null,
  due_date            date,
  subtotal            numeric(14,2) not null default 0,
  kdv_rate            numeric(5,2) not null default 20,
  kdv_amount          numeric(14,2) not null default 0,
  stopaj_rate         numeric(5,2) not null default 0,
  stopaj_amount       numeric(14,2) not null default 0,
  total_amount        numeric(14,2) not null default 0,
  paid_amount         numeric(14,2) not null default 0,
  status              public.invoice_status not null default 'kesildi',
  description         text,
  notes               text,
  service_form_id     uuid references public.service_forms(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index idx_invoices_customer_id  on public.invoices(customer_id);
create index idx_invoices_invoice_date on public.invoices(invoice_date desc);
create index idx_invoices_due_date     on public.invoices(due_date) where due_date is not null;
create index idx_invoices_status       on public.invoices(status);
create index idx_invoices_type         on public.invoices(invoice_type);

-- ---- INVOICE ITEMS ----

create table public.invoice_items (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  line_order  smallint not null default 1,
  description text not null,
  quantity    numeric(10,3) not null default 1,
  unit        text not null default 'adet',
  unit_price  numeric(14,2) not null,
  kdv_rate    numeric(5,2) not null default 20,
  notes       text,
  created_at  timestamptz not null default now()
);

create index idx_invoice_items_invoice_id on public.invoice_items(invoice_id);

-- ---- PAYMENTS ----

create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid references public.invoices(id) on delete set null,
  direction    public.payment_direction not null,
  method       public.payment_method not null default 'nakit',
  amount       numeric(14,2) not null check (amount > 0),
  payment_date date not null,
  reference_no text,
  notes        text,
  created_at   timestamptz not null default now()
);

create index idx_payments_invoice_id   on public.payments(invoice_id);
create index idx_payments_payment_date on public.payments(payment_date desc);
create index idx_payments_direction    on public.payments(direction);

-- ---- EXPENSE CATEGORIES ----

create table public.expense_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  direction  public.transaction_direction not null,
  is_system  boolean not null default false,
  is_active  boolean not null default true,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  unique (name, direction)
);

-- ---- TRANSACTIONS (Gelir/Gider) ----

create table public.transactions (
  id               uuid primary key default gen_random_uuid(),
  direction        public.transaction_direction not null,
  category_id      uuid not null references public.expense_categories(id),
  transaction_date date not null,
  amount           numeric(14,2) not null check (amount > 0),
  kdv_included     boolean not null default false,
  kdv_rate         numeric(5,2) not null default 0,
  kdv_amount       numeric(14,2) not null default 0,
  net_amount       numeric(14,2) not null,
  description      text not null,
  reference_no     text,
  invoice_id       uuid references public.invoices(id) on delete set null,
  payment_method   public.payment_method not null default 'nakit',
  recurring_id     uuid,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_transactions_direction        on public.transactions(direction);
create index idx_transactions_category_id      on public.transactions(category_id);
create index idx_transactions_transaction_date on public.transactions(transaction_date desc);

-- ---- FIXED EXPENSES ----

create table public.fixed_expenses (
  id                uuid primary key default gen_random_uuid(),
  category_id       uuid not null references public.expense_categories(id),
  name              text not null,
  amount            numeric(14,2) not null check (amount > 0),
  kdv_rate          numeric(5,2) not null default 0,
  period            public.recurrence_period not null default 'aylik',
  day_of_month      smallint not null default 1 check (day_of_month between 1 and 28),
  start_date        date not null,
  end_date          date,
  auto_create_entry boolean not null default true,
  is_active         boolean not null default true,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_fixed_expenses_category_id on public.fixed_expenses(category_id);
create index idx_fixed_expenses_is_active   on public.fixed_expenses(is_active);

-- FK from transactions.recurring_id
alter table public.transactions
  add constraint fk_transactions_recurring
  foreign key (recurring_id) references public.fixed_expenses(id) on delete set null;

-- ---- EMPLOYEES ----

create table public.employees (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null,
  tc_no        text unique,
  sgk_no       text,
  title        text,
  phone        text,
  iban         text,
  gross_salary numeric(14,2) not null default 0,
  start_date   date not null,
  end_date     date,
  status       public.employee_status not null default 'aktif',
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_employees_status on public.employees(status);

-- ---- SALARY PAYMENTS ----

create table public.salary_payments (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references public.employees(id),
  payment_year   smallint not null,
  payment_month  smallint not null check (payment_month between 1 and 12),
  gross_amount   numeric(14,2) not null,
  sgk_employee   numeric(14,2) not null default 0,
  sgk_employer   numeric(14,2) not null default 0,
  income_tax     numeric(14,2) not null default 0,
  stamp_tax      numeric(14,2) not null default 0,
  net_amount     numeric(14,2) not null,
  payment_date   date,
  payment_method public.payment_method not null default 'havale_eft',
  transaction_id uuid references public.transactions(id) on delete set null,
  notes          text,
  created_at     timestamptz not null default now(),
  unique (employee_id, payment_year, payment_month)
);

create index idx_salary_payments_employee_id on public.salary_payments(employee_id);
create index idx_salary_payments_period      on public.salary_payments(payment_year desc, payment_month desc);

-- ---- TAX DECLARATIONS ----

create table public.tax_declarations (
  id               uuid primary key default gen_random_uuid(),
  tax_type         public.tax_type not null,
  period_year      smallint not null,
  period_month     smallint,
  period_quarter   smallint,
  due_date         date not null,
  declaration_date date,
  base_amount      numeric(14,2),
  tax_amount       numeric(14,2),
  paid_amount      numeric(14,2) not null default 0,
  status           public.declaration_status not null default 'hazirlanacak',
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_tax_declarations_due    on public.tax_declarations(due_date);
create index idx_tax_declarations_status on public.tax_declarations(status);
create index idx_tax_declarations_type   on public.tax_declarations(tax_type);

-- ---- TRIGGERS: updated_at ----

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_invoices_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

create trigger trg_fixed_expenses_updated_at
  before update on public.fixed_expenses
  for each row execute function public.set_updated_at();

create trigger trg_transactions_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

create trigger trg_employees_updated_at
  before update on public.employees
  for each row execute function public.set_updated_at();

create trigger trg_tax_declarations_updated_at
  before update on public.tax_declarations
  for each row execute function public.set_updated_at();

-- ---- TRIGGER: Fatura ödeme durumu senkronu ----

create or replace function public.sync_invoice_payment_status()
returns trigger language plpgsql as $$
declare
  v_invoice_id uuid;
  v_total      numeric;
  v_paid       numeric;
  v_status     public.invoice_status;
begin
  v_invoice_id := coalesce(new.invoice_id, old.invoice_id);
  if v_invoice_id is null then return coalesce(new, old); end if;

  select total_amount into v_total from public.invoices where id = v_invoice_id;
  select coalesce(sum(amount), 0) into v_paid
    from public.payments
    where invoice_id = v_invoice_id and direction = 'tahsilat';

  if v_paid <= 0 then
    v_status := 'kesildi';
  elsif v_paid >= v_total then
    v_status := 'odendi';
  else
    v_status := 'kismi_odendi';
  end if;

  update public.invoices
    set paid_amount = v_paid, status = v_status, updated_at = now()
    where id = v_invoice_id and status not in ('taslak', 'iptal');

  return coalesce(new, old);
end;
$$;

create trigger trg_payment_sync_invoice
  after insert or update or delete on public.payments
  for each row execute function public.sync_invoice_payment_status();

-- ---- RPC: Fatura numarası üret ----

create or replace function public.increment_invoice_series(
  p_prefix text,
  p_year   smallint
) returns text
language plpgsql
as $$
declare
  v_num integer;
begin
  insert into public.invoice_series (prefix, year, last_number)
  values (p_prefix, p_year, 1)
  on conflict (prefix, year)
  do update set last_number = invoice_series.last_number + 1
  returning last_number into v_num;

  return p_prefix || '-' || p_year || '-' || lpad(v_num::text, 4, '0');
end;
$$;

-- ---- SEED: Gider Kategorileri ----

insert into public.expense_categories (name, direction, is_system, sort_order) values
  -- Gelir
  ('Yangın Söndürücü Bakım',          'gelir', true,  1),
  ('Yangın Söndürücü Dolum',           'gelir', true,  2),
  ('Yangın Söndürücü Satışı',          'gelir', true,  3),
  ('Yedek Parça / Sarf Malzeme Satışı','gelir', true,  4),
  ('Danışmanlık / Eğitim',             'gelir', true,  5),
  ('Diğer Gelir',                      'gelir', true,  9),
  -- Sabit Giderler
  ('Kira',                             'gider', true,  10),
  ('Elektrik',                         'gider', true,  11),
  ('Su',                               'gider', true,  12),
  ('Doğalgaz',                         'gider', true,  13),
  ('İnternet / Telefon',               'gider', true,  14),
  ('Abonelik / Yazılım',               'gider', true,  15),
  -- Değişken Giderler
  ('Hammadde / Malzeme Alımı',         'gider', true,  20),
  ('Araç / Yakıt',                     'gider', true,  21),
  ('Araç Bakım / Onarım',              'gider', true,  22),
  ('Kargo / Nakliye',                  'gider', true,  23),
  ('Reklam / Pazarlama',               'gider', true,  24),
  ('Ofis / Kırtasiye',                 'gider', true,  25),
  ('Muhasebe / Hukuk',                 'gider', true,  26),
  -- Personel
  ('Maaş Ödemeleri',                   'gider', true,  30),
  ('SGK İşveren Payı',                 'gider', true,  31),
  -- Vergi / Mali
  ('KDV Ödemesi',                      'gider', true,  40),
  ('Gelir Vergisi',                    'gider', true,  41),
  ('Kurumlar Vergisi',                 'gider', true,  42),
  ('Stopaj',                           'gider', true,  43),
  ('Damga Vergisi',                    'gider', true,  44),
  ('SGK Bildirimi',                    'gider', true,  45),
  -- Diğer
  ('Banka Masrafları',                 'gider', true,  50),
  ('Bakım / Onarım',                   'gider', true,  51),
  ('Diğer Gider',                      'gider', true,  99);
