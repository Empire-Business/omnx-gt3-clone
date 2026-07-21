-- Segurança: fixa search_path em funções SECURITY DEFINER (evita hijack de
-- search_path / escalada de privilégio — recomendação do linter do Supabase).
-- Aplicado em produção (opbdoulspzlabxzevffc) em 2026-06-24 via Management API.
-- Idempotente: ALTER FUNCTION ... SET é seguro de re-rodar.

alter function public.create_omnx_bot_channel() set search_path = public;
alter function public.add_user_to_omnx_bot() set search_path = public;
alter function public.ensure_area_channel(p_area_id uuid, p_tenant_id uuid, p_area_name text) set search_path = public;
alter function public.trg_area_channel_rename() set search_path = public;
alter function public.trg_sync_employee_area_channel() set search_path = public;
