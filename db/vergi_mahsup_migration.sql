-- ============================================================
-- VERGİ MAHSUP MIGRATION
-- Köklü ERP — "Vergi Borcuna Mahsup" özelliği
-- ============================================================

-- payment_method enum'una vergi_mahsup ekle
alter type public.payment_method add value if not exists 'vergi_mahsup';

-- invoices tablosuna mahsup kolonları ekle
alter table public.invoices
  add column if not exists mahsup_durumu text not null default 'normal'
    check (mahsup_durumu in ('normal', 'vergi_mahsup')),
  add column if not exists mahsup_tarihi date,
  add column if not exists mahsup_aciklama text;

-- İndeks: mahsup_durumu'na göre hızlı filtreleme
create index if not exists idx_invoices_mahsup_durumu
  on public.invoices (mahsup_durumu)
  where mahsup_durumu = 'vergi_mahsup';
