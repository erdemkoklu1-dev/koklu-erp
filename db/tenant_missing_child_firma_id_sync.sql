-- Sprint 1.5B - Eksik child tablo tenant kolon senkronu
--
-- Kapsam:
-- - invoice_brokers.firma_id
-- - proforma_fatura_kalemleri.firma_id
-- - service_form_items.firma_id
--
-- Bu dosya yalnızca eksik firma_id kolonlarını ekler, mevcut satırları parent
-- kayıtlardan geri doldurur, indexleri ekler ve yeni/güncellenen child
-- satırlarda firma_id değerini parent kayıttan senkronlar.
--
-- Bilinçli olarak YAPMAZ:
-- - RLS açmaz
-- - NOT NULL yapmaz
-- - Policy drop/create yapmaz
-- - Veri silmez

do $$
begin
  if to_regclass('public.invoice_brokers') is not null then
    alter table public.invoice_brokers
      add column if not exists firma_id uuid references public.firmalar(id) on delete restrict;

    update public.invoice_brokers ib
    set firma_id = i.firma_id
    from public.invoices i
    where i.id = ib.invoice_id
      and i.firma_id is not null
      and ib.firma_id is distinct from i.firma_id;

    create index if not exists invoice_brokers_firma_id_idx
      on public.invoice_brokers(firma_id);
    create index if not exists invoice_brokers_invoice_firma_idx
      on public.invoice_brokers(invoice_id, firma_id);
  end if;

  if to_regclass('public.proforma_fatura_kalemleri') is not null then
    alter table public.proforma_fatura_kalemleri
      add column if not exists firma_id uuid references public.firmalar(id) on delete restrict;

    update public.proforma_fatura_kalemleri k
    set firma_id = p.firma_id
    from public.proforma_faturalar p
    where p.id = k.proforma_id
      and p.firma_id is not null
      and k.firma_id is distinct from p.firma_id;

    create index if not exists proforma_fatura_kalemleri_firma_id_idx
      on public.proforma_fatura_kalemleri(firma_id);
    create index if not exists proforma_fatura_kalemleri_proforma_firma_idx
      on public.proforma_fatura_kalemleri(proforma_id, firma_id);
  end if;

  if to_regclass('public.service_form_items') is not null then
    alter table public.service_form_items
      add column if not exists firma_id uuid references public.firmalar(id) on delete restrict;

    update public.service_form_items it
    set firma_id = sf.firma_id
    from public.service_forms sf
    where sf.id = it.service_form_id
      and sf.firma_id is not null
      and it.firma_id is distinct from sf.firma_id;

    create index if not exists service_form_items_firma_id_idx
      on public.service_form_items(firma_id);
    create index if not exists service_form_items_form_firma_idx
      on public.service_form_items(service_form_id, firma_id);
  end if;
end $$;

create or replace function public.set_invoice_brokers_firma_id()
returns trigger
language plpgsql
as $$
begin
  select i.firma_id
  into new.firma_id
  from public.invoices i
  where i.id = new.invoice_id;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.invoice_brokers') is not null then
    drop trigger if exists trg_invoice_brokers_set_firma_id on public.invoice_brokers;
    create trigger trg_invoice_brokers_set_firma_id
      before insert or update of invoice_id, firma_id
      on public.invoice_brokers
      for each row execute function public.set_invoice_brokers_firma_id();
  end if;
end $$;

create or replace function public.set_proforma_fatura_kalemleri_firma_id()
returns trigger
language plpgsql
as $$
begin
  select p.firma_id
  into new.firma_id
  from public.proforma_faturalar p
  where p.id = new.proforma_id;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.proforma_fatura_kalemleri') is not null then
    drop trigger if exists trg_proforma_fatura_kalemleri_set_firma_id on public.proforma_fatura_kalemleri;
    create trigger trg_proforma_fatura_kalemleri_set_firma_id
      before insert or update of proforma_id, firma_id
      on public.proforma_fatura_kalemleri
      for each row execute function public.set_proforma_fatura_kalemleri_firma_id();
  end if;
end $$;

create or replace function public.set_service_form_items_firma_id()
returns trigger
language plpgsql
as $$
begin
  select sf.firma_id
  into new.firma_id
  from public.service_forms sf
  where sf.id = new.service_form_id;

  return new;
end;
$$;

do $$
begin
  if to_regclass('public.service_form_items') is not null then
    drop trigger if exists trg_service_form_items_set_firma_id on public.service_form_items;
    create trigger trg_service_form_items_set_firma_id
      before insert or update of service_form_id, firma_id
      on public.service_form_items
      for each row execute function public.set_service_form_items_firma_id();
  end if;
end $$;
