-- Supabase'in mevcut varsayılan fonksiyon yetkileri anon/authenticated rolleri
-- için doğrudan EXECUTE eklemiş olabilir. Atomik import yalnız server-side
-- service_role çağrısına açıktır; kullanıcı kimliği p_user_id ile doğrulanır.

revoke all on function public.invoice_import_atomic(uuid, jsonb, jsonb, jsonb, jsonb, uuid) from public;
revoke all on function public.invoice_import_atomic(uuid, jsonb, jsonb, jsonb, jsonb, uuid) from anon;
revoke all on function public.invoice_import_atomic(uuid, jsonb, jsonb, jsonb, jsonb, uuid) from authenticated;
grant execute on function public.invoice_import_atomic(uuid, jsonb, jsonb, jsonb, jsonb, uuid) to service_role;
