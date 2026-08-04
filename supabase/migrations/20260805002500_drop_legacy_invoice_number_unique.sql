-- Atomik import index'i firma + fatura türü + normalize numara kapsamında
-- uniqueness sağlar. Eski global invoice_number constraint'i gelen ve giden
-- aynı numaralı faturaları hatalı biçimde birbirine bağlıyordu.

do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_index
     where indexrelid = to_regclass('public.invoices_firma_type_number_uidx')
       and indisunique
       and indisvalid
  ) then
    raise exception 'INVOICE_IMPORT_SCOPED_UNIQUE_INDEX_REQUIRED';
  end if;
end;
$$;

alter table public.invoices
  drop constraint if exists invoices_invoice_number_key;
