alter table public.customers
add column if not exists authorized_person text;

alter table public.customers
add column if not exists authorized_phone text;
