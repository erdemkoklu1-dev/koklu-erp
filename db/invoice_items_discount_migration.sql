-- ============================================================
-- invoice_items tablosuna iskonto kolonları ekle
-- Köklü ERP — PDF e-Fatura import için
-- ============================================================

alter table public.invoice_items
  add column if not exists discount_rate   numeric(5,2) not null default 0,
  add column if not exists discount_amount numeric(14,2) not null default 0;

comment on column public.invoice_items.discount_rate   is 'İskonto oranı (%)';
comment on column public.invoice_items.discount_amount is 'İskonto tutarı (TL)';
