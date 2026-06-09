-- Fatura müşteri/tedarikçi adres, şehir ve iletişim alanları

alter table public.invoices
  add column if not exists musteri_unvan text,
  add column if not exists musteri_vergi_no text,
  add column if not exists musteri_telefon text,
  add column if not exists musteri_email text,
  add column if not exists musteri_il text,
  add column if not exists musteri_ilce text,
  add column if not exists tedarikci_il text,
  add column if not exists tedarikci_ilce text;

create index if not exists idx_invoices_sube_id on public.invoices(sube_id);
create index if not exists idx_invoices_musteri_il on public.invoices(musteri_il);
