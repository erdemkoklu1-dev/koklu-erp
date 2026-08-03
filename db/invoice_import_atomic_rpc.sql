-- Fatura içe aktarma: her çağrı tek faturayı ve bağlı kayıtlarını tek transaction'da yazar.
-- Forward-only hazırlıktır; production'a bu görev kapsamında uygulanmaz.

create unique index if not exists invoices_firma_type_number_uidx
  on public.invoices (firma_id, invoice_type, upper(regexp_replace(invoice_number, '\s+', '', 'g')))
  where invoice_number is not null;

create or replace function public.invoice_import_atomic(
  p_firma_id uuid,
  p_customer jsonb,
  p_invoice jsonb,
  p_items jsonb default '[]'::jsonb,
  p_devices jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_no text := nullif(trim(p_invoice->>'invoice_number'), '');
  v_invoice_type public.invoice_type := coalesce(nullif(p_invoice->>'invoice_type', '')::public.invoice_type, 'satis');
  v_customer_id uuid := nullif(p_invoice->>'customer_id', '')::uuid;
  v_invoice_id uuid;
  v_customer_new boolean := false;
begin
  if p_firma_id is null or v_invoice_no is null then
    raise exception using errcode = '22023', message = 'Firma ve fatura numarası zorunludur.';
  end if;

  -- Aynı tenant/fatura için eşzamanlı istekleri de seri hâle getirir.
  perform pg_advisory_xact_lock(hashtextextended(p_firma_id::text || ':' || v_invoice_type::text || ':' || upper(regexp_replace(v_invoice_no, '\s+', '', 'g')), 0));

  select id into v_invoice_id
    from public.invoices
   where firma_id = p_firma_id
     and invoice_type = v_invoice_type
     and upper(regexp_replace(invoice_number, '\s+', '', 'g')) = upper(regexp_replace(v_invoice_no, '\s+', '', 'g'))
   limit 1;
  if v_invoice_id is not null then
    return jsonb_build_object('status', 'atilandi', 'invoice_id', v_invoice_id, 'customer_id', null, 'musteri_yeni', false, 'cihaz_sayisi', 0);
  end if;

  if v_customer_id is not null then
    perform 1 from public.customers where id = v_customer_id and firma_id = p_firma_id;
    if not found then
      raise exception using errcode = '42501', message = 'Seçilen müşteri firmaya ait değil.';
    end if;
  else
    select id into v_customer_id
      from public.customers
     where firma_id = p_firma_id
       and nullif(regexp_replace(coalesce(tax_number, ''), '\D', '', 'g'), '') = nullif(regexp_replace(coalesce(p_customer->>'tax_number', ''), '\D', '', 'g'), '')
       and nullif(regexp_replace(coalesce(p_customer->>'tax_number', ''), '\D', '', 'g'), '') is not null
     limit 1;
  end if;

  if v_customer_id is null then
    insert into public.customers (full_name, type, tax_number, address, il, sube_id, is_active, firma_id)
    values (
      p_customer->>'full_name',
      coalesce(p_customer->>'type', 'company'),
      nullif(p_customer->>'tax_number', ''),
      nullif(p_customer->>'address', ''),
      nullif(p_customer->>'il', ''),
      nullif(p_customer->>'sube_id', '')::uuid,
      true,
      p_firma_id
    ) returning id into v_customer_id;
    v_customer_new := true;
  end if;

  insert into public.invoices (
    invoice_number, invoice_type, customer_id, musteri_unvan, musteri_vergi_no,
    musteri_adres, musteri_il, musteri_ilce, invoice_date, due_date, subtotal,
    kdv_rate, kdv_amount, stopaj_rate, stopaj_amount, total_amount, paid_amount,
    status, description, notes, sube_id, firma_id
  ) values (
    v_invoice_no, v_invoice_type, v_customer_id, nullif(p_invoice->>'musteri_unvan', ''),
    nullif(p_invoice->>'musteri_vergi_no', ''), nullif(p_invoice->>'musteri_adres', ''),
    nullif(p_invoice->>'musteri_il', ''), nullif(p_invoice->>'musteri_ilce', ''),
    nullif(p_invoice->>'invoice_date', '')::date, nullif(p_invoice->>'due_date', '')::date,
    coalesce((p_invoice->>'subtotal')::numeric, 0), coalesce((p_invoice->>'kdv_rate')::numeric, 0),
    coalesce((p_invoice->>'kdv_amount')::numeric, 0), 0, 0,
    coalesce((p_invoice->>'total_amount')::numeric, 0), 0,
    coalesce(nullif(p_invoice->>'status', '')::public.invoice_status, 'kesildi'),
    nullif(p_invoice->>'description', ''), nullif(p_invoice->>'notes', ''),
    nullif(p_invoice->>'sube_id', '')::uuid, p_firma_id
  ) returning id into v_invoice_id;

  insert into public.invoice_items (invoice_id, line_order, description, quantity, unit, unit_price, kdv_rate, notes, firma_id)
  select v_invoice_id, x.line_order, x.description, x.quantity, x.unit, x.unit_price, x.kdv_rate, x.notes, p_firma_id
    from jsonb_to_recordset(coalesce(p_items, '[]'::jsonb)) as x(
      line_order integer, description text, quantity numeric, unit text,
      unit_price numeric, kdv_rate numeric, notes text
    );

  insert into public.devices (
    customer_id, custom_device_name, brand, capacity, quantity, serial_number,
    invoice_date, last_fill_date, expiry_date, control1_date, control2_date,
    control3_date, is_active, qr_code, firma_id
  )
  select v_customer_id, x.custom_device_name, null, null, x.quantity, null,
         x.invoice_date, x.invoice_date, x.expiry_date, x.control1_date,
         x.control2_date, x.control3_date, true, x.qr_code, p_firma_id
    from jsonb_to_recordset(coalesce(p_devices, '[]'::jsonb)) as x(
      custom_device_name text, quantity integer, invoice_date date, expiry_date date,
      control1_date date, control2_date date, control3_date date, qr_code text
    );

  return jsonb_build_object(
    'status', 'eklendi', 'invoice_id', v_invoice_id, 'customer_id', v_customer_id,
    'musteri_yeni', v_customer_new, 'cihaz_sayisi', jsonb_array_length(coalesce(p_devices, '[]'::jsonb))
  );
exception
  when unique_violation then
    select id into v_invoice_id
      from public.invoices
     where firma_id = p_firma_id and invoice_type = v_invoice_type
       and upper(regexp_replace(invoice_number, '\s+', '', 'g')) = upper(regexp_replace(v_invoice_no, '\s+', '', 'g'))
     limit 1;
    return jsonb_build_object('status', 'atilandi', 'invoice_id', v_invoice_id, 'customer_id', v_customer_id, 'musteri_yeni', false, 'cihaz_sayisi', 0);
end;
$$;

revoke all on function public.invoice_import_atomic(uuid, jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function public.invoice_import_atomic(uuid, jsonb, jsonb, jsonb, jsonb) to service_role;
