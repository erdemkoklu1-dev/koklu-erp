-- Fatura içe aktarma: her çağrı tek faturayı ve bağlı kayıtlarını tek transaction'da yazar.
-- Forward-only production migration. Çalıştırmadan önce aşağıdaki duplicate ön kontrolü geçmelidir.

do $$
begin
  if exists (
    select 1
      from public.invoices
     where nullif(regexp_replace(invoice_number, '[[:space:]]+', '', 'g'), '') is not null
     group by firma_id, invoice_type,
              upper(regexp_replace(invoice_number, '[[:space:]]+', '', 'g'))
    having count(*) > 1
  ) then
    raise exception 'INVOICE_IMPORT_DUPLICATE_PREFLIGHT_FAILED: normalize edilmiş mükerrer fatura numaraları var.';
  end if;
end;
$$;

drop index if exists public.invoices_firma_type_number_uidx;

create unique index invoices_firma_type_number_uidx
  on public.invoices (
    firma_id,
    invoice_type,
    upper(regexp_replace(invoice_number, '[[:space:]]+', '', 'g'))
  )
  where nullif(regexp_replace(invoice_number, '[[:space:]]+', '', 'g'), '') is not null;

drop function if exists public.invoice_import_atomic(uuid, jsonb, jsonb, jsonb, jsonb);

create or replace function public.invoice_import_atomic(
  p_firma_id uuid,
  p_customer jsonb,
  p_invoice jsonb,
  p_items jsonb default '[]'::jsonb,
  p_devices jsonb default '[]'::jsonb,
  p_user_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_jwt_role text;
  v_auth_uid uuid;
  v_effective_user uuid;
  v_user_firma uuid;
  v_effective_firma uuid;
  v_is_super_admin boolean := false;
  v_invoice_no text := nullif(trim(p_invoice->>'invoice_number'), '');
  v_normalized_invoice_no text;
  v_invoice_type public.invoice_type := coalesce(nullif(p_invoice->>'invoice_type', '')::public.invoice_type, 'satis');
  v_customer_id uuid := nullif(p_invoice->>'customer_id', '')::uuid;
  v_customer_branch_id uuid := nullif(p_customer->>'sube_id', '')::uuid;
  v_invoice_branch_id uuid := nullif(p_invoice->>'sube_id', '')::uuid;
  v_invoice_id uuid;
  v_customer_new boolean := false;
  v_constraint_name text;
begin
  if p_customer is null or jsonb_typeof(p_customer) <> 'object'
     or p_invoice is null or jsonb_typeof(p_invoice) <> 'object'
     or p_items is null or jsonb_typeof(p_items) <> 'array'
     or p_devices is null or jsonb_typeof(p_devices) <> 'array' then
    raise exception using errcode = '22023', message = 'Müşteri, fatura, kalem ve cihaz verisi geçersiz.';
  end if;
  if v_invoice_no is null then
    raise exception using errcode = '22023', message = 'Fatura numarası zorunludur.';
  end if;
  if jsonb_array_length(p_items) = 0 then
    raise exception using errcode = '22023', message = 'Faturada en az bir geçerli kalem bulunmalıdır.';
  end if;
  if exists (
    select 1
      from jsonb_to_recordset(p_items) as x(description text, quantity numeric)
     where nullif(trim(x.description), '') is null or x.quantity is null or x.quantity <= 0
  ) then
    raise exception using errcode = '22023', message = 'Fatura kalemi açıklaması ve pozitif miktarı zorunludur.';
  end if;

  begin
    v_auth_uid := auth.uid();
  exception when others then
    v_auth_uid := null;
  end;
  begin
    v_jwt_role := coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    );
  exception when others then
    v_jwt_role := null;
  end;

  if v_auth_uid is not null then
    v_effective_user := v_auth_uid;
  elsif v_jwt_role = 'service_role' then
    if p_user_id is null then
      raise exception using errcode = '42501', message = 'INVOICE_IMPORT_USER_REQUIRED: service-role çağrısında kullanıcı zorunludur.';
    end if;
    v_effective_user := p_user_id;
  else
    raise exception using errcode = '42501', message = 'INVOICE_IMPORT_NOT_AUTHENTICATED';
  end if;

  select kp.firma_id, coalesce(r.ad = 'Super Admin', false)
    into v_user_firma, v_is_super_admin
    from public.kullanici_profiller kp
    left join public.roller r on r.id = kp.rol_id
   where kp.id = v_effective_user;
  if not found or v_user_firma is null then
    raise exception using errcode = '42501', message = 'INVOICE_IMPORT_NO_TENANT: kullanıcıya bağlı firma bulunamadı.';
  end if;
  if p_firma_id is not null and p_firma_id <> v_user_firma and not v_is_super_admin then
    raise exception using errcode = '42501', message = 'INVOICE_IMPORT_TENANT_MISMATCH';
  end if;
  v_effective_firma := case
    when v_is_super_admin and p_firma_id is not null then p_firma_id
    else v_user_firma
  end;

  if v_customer_branch_id is not null then
    perform 1 from public.subeler where id = v_customer_branch_id and firma_id = v_effective_firma;
    if not found then
      raise exception using errcode = '42501', message = 'Müşteri şubesi kullanıcının firmasına ait değil.';
    end if;
  end if;
  if v_invoice_branch_id is not null then
    perform 1 from public.subeler where id = v_invoice_branch_id and firma_id = v_effective_firma;
    if not found then
      raise exception using errcode = '42501', message = 'Fatura şubesi kullanıcının firmasına ait değil.';
    end if;
  end if;

  v_normalized_invoice_no := upper(regexp_replace(v_invoice_no, '[[:space:]]+', '', 'g'));
  perform pg_advisory_xact_lock(hashtextextended(v_effective_firma::text || ':' || v_invoice_type::text || ':' || v_normalized_invoice_no, 0));

  select id into v_invoice_id
    from public.invoices
   where firma_id = v_effective_firma
     and invoice_type = v_invoice_type
     and upper(regexp_replace(invoice_number, '[[:space:]]+', '', 'g')) = v_normalized_invoice_no
   limit 1;
  if v_invoice_id is not null then
    return jsonb_build_object('status', 'atilandi', 'invoice_id', v_invoice_id, 'customer_id', null, 'musteri_yeni', false, 'cihaz_sayisi', 0);
  end if;

  if v_customer_id is not null then
    perform 1 from public.customers where id = v_customer_id and firma_id = v_effective_firma;
    if not found then
      raise exception using errcode = '42501', message = 'Seçilen müşteri firmaya ait değil.';
    end if;
  else
    select id into v_customer_id
      from public.customers
     where firma_id = v_effective_firma
       and nullif(regexp_replace(coalesce(tax_number, ''), '\D', '', 'g'), '') = nullif(regexp_replace(coalesce(p_customer->>'tax_number', ''), '\D', '', 'g'), '')
       and nullif(regexp_replace(coalesce(p_customer->>'tax_number', ''), '\D', '', 'g'), '') is not null
     limit 1;
  end if;

  if v_customer_id is null then
    insert into public.customers (full_name, type, tax_number, address, il, sube_id, is_active, firma_id)
    values (
      p_customer->>'full_name', coalesce(p_customer->>'type', 'company'),
      nullif(p_customer->>'tax_number', ''), nullif(p_customer->>'address', ''),
      nullif(p_customer->>'il', ''), v_customer_branch_id, true, v_effective_firma
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
    v_invoice_branch_id, v_effective_firma
  ) returning id into v_invoice_id;

  insert into public.invoice_items (invoice_id, line_order, description, quantity, unit, unit_price, kdv_rate, notes, firma_id)
  select v_invoice_id, x.line_order, x.description, x.quantity, x.unit, x.unit_price, x.kdv_rate, x.notes, v_effective_firma
    from jsonb_to_recordset(p_items) as x(
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
         x.control2_date, x.control3_date, true, x.qr_code, v_effective_firma
    from jsonb_to_recordset(p_devices) as x(
      custom_device_name text, quantity integer, invoice_date date, expiry_date date,
      control1_date date, control2_date date, control3_date date, qr_code text
    );

  return jsonb_build_object(
    'status', 'eklendi', 'invoice_id', v_invoice_id, 'customer_id', v_customer_id,
    'musteri_yeni', v_customer_new, 'cihaz_sayisi', jsonb_array_length(p_devices)
  );
exception
  when unique_violation then
    get stacked diagnostics v_constraint_name = constraint_name;
    if v_constraint_name <> 'invoices_firma_type_number_uidx' then
      raise;
    end if;
    select id into v_invoice_id
      from public.invoices
     where firma_id = v_effective_firma and invoice_type = v_invoice_type
       and upper(regexp_replace(invoice_number, '[[:space:]]+', '', 'g')) = v_normalized_invoice_no
     limit 1;
    if v_invoice_id is null then
      raise;
    end if;
    return jsonb_build_object('status', 'atilandi', 'invoice_id', v_invoice_id, 'customer_id', null, 'musteri_yeni', false, 'cihaz_sayisi', 0);
end;
$$;

revoke all on function public.invoice_import_atomic(uuid, jsonb, jsonb, jsonb, jsonb, uuid) from public;
grant execute on function public.invoice_import_atomic(uuid, jsonb, jsonb, jsonb, jsonb, uuid) to service_role;
