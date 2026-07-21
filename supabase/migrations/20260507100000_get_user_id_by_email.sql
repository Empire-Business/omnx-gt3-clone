-- RPC: localizar user_id em auth.users por email.
-- Usada pela Edge Function create-employee para detectar emails já cadastrados
-- sem depender de auth.admin.listUsers (que não escala e falhava em 500).
-- security definer + revogação de execute para anon/authenticated; só service_role chama.

create or replace function public.get_user_id_by_email(_email text)
returns uuid
language sql
security definer
set search_path = public, auth
as $$
  select id from auth.users where lower(email) = lower(_email) limit 1;
$$;

revoke execute on function public.get_user_id_by_email(text) from public;
revoke execute on function public.get_user_id_by_email(text) from anon;
revoke execute on function public.get_user_id_by_email(text) from authenticated;
grant execute on function public.get_user_id_by_email(text) to service_role;
