-- ============================================================
-- MÜŞTERİ CARİ HESAP + BELGELER MIGRATION
-- Köklü ERP — Cari Hesap Genişletme
-- ============================================================
-- Supabase'de çalıştırmadan önce:
-- 1. Storage > New Bucket > "erp-documents" (Private) oluştur
-- 2. Storage > Policies > erp-documents için service role erişimi ver
-- ============================================================

-- ---- MÜŞTERİ CARİ HESAP ----

create table public.customer_accounts (
  id              uuid primary key default gen_random_uuid(),
  customer_id     uuid not null unique references public.customers(id) on delete cascade,
  opening_balance numeric(14,2) not null default 0,  -- Devir bakiyesi (+ = biz alacaklıyız)
  credit_limit    numeric(14,2) not null default 0,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_customer_accounts_customer_id on public.customer_accounts(customer_id);

create trigger trg_customer_accounts_updated_at
  before update on public.customer_accounts
  for each row execute function public.set_updated_at();

-- ---- BELGELER (Dekont / Fatura PDF) ----

create table public.documents (
  id            uuid primary key default gen_random_uuid(),
  document_type text not null default 'diger'
    check (document_type in ('dekont', 'fatura_pdf', 'diger')),
  file_path     text not null,       -- Supabase Storage path
  file_name     text not null,
  file_size     integer,
  mime_type     text,
  amount        numeric(14,2),       -- Dekonttaki tutar (manuel girilir)
  notes         text,
  -- İlişkiler
  customer_id   uuid references public.customers(id) on delete set null,
  invoice_id    uuid references public.invoices(id) on delete set null,
  payment_id    uuid references public.payments(id) on delete set null,
  -- İşlem durumu
  processed     boolean not null default false,
  processed_at  timestamptz,
  -- Meta
  uploaded_at   timestamptz not null default now()
);

create index idx_documents_customer_id on public.documents(customer_id);
create index idx_documents_invoice_id  on public.documents(invoice_id);
create index idx_documents_processed   on public.documents(processed);
create index idx_documents_uploaded_at on public.documents(uploaded_at desc);
