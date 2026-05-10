-- Fatura adres alanlari

alter table public.invoices
  add column if not exists musteri_adres text,
  add column if not exists tedarikci_adres text;
