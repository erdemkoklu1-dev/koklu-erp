alter table public.musteri_talepleri
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid;

create index if not exists musteri_talepleri_deleted_at_idx
  on public.musteri_talepleri(deleted_at);
