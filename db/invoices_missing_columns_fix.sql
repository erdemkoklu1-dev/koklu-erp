-- ════════════════════════════════════════════════════════════════
-- invoices tablosu eksik kolon düzeltmesi
-- "Could not find the 'musteri_email' / 'musteri_adres' ... column
--  of 'invoices' in the schema cache" hatasının kalıcı çözümü.
--
-- Bu iki migration daha önce CANLI DB'ye uygulanmamış:
--   - invoices_customer_branch_fields_migration.sql
--   - invoices_adres_migration.sql
-- Hepsi idempotent (IF NOT EXISTS) — tekrar çalıştırmak güvenli.
--
-- ÇALIŞTIRMA: Supabase Dashboard → SQL Editor → bu dosyayı yapıştır → Run
-- ════════════════════════════════════════════════════════════════

alter table public.invoices
  add column if not exists musteri_unvan    text,
  add column if not exists musteri_vergi_no text,
  add column if not exists musteri_telefon  text,
  add column if not exists musteri_email    text,
  add column if not exists musteri_adres    text,
  add column if not exists musteri_il       text,
  add column if not exists musteri_ilce     text,
  add column if not exists tedarikci_adres  text,
  add column if not exists tedarikci_il     text,
  add column if not exists tedarikci_ilce   text;

create index if not exists idx_invoices_sube_id    on public.invoices(sube_id);
create index if not exists idx_invoices_musteri_il on public.invoices(musteri_il);

-- PostgREST şema cache'ini yenile (hata "schema cache" diyorsa şart)
notify pgrst, 'reload schema';
