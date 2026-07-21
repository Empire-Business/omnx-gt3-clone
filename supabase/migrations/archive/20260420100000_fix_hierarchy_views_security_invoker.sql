-- Fix: views de hierarquia sinalizadas pelo Supabase com security_definer
--
-- Problema:
--   As views employees_hierarchy_view, processes_hierarchy_view e
--   projects_hierarchy_view foram criadas no Supabase Dashboard sem
--   security_invoker. Em Postgres, views são SECURITY DEFINER por padrão,
--   o que significa que rodam com as permissões do owner (postgres) e
--   bypassam RLS nas tabelas subjacentes quando acessadas diretamente.
--
-- Risco:
--   Qualquer usuário autenticado que chame essas views via API REST poderia
--   ler dados de outros tenants, pois as policies RLS das tabelas base não
--   são aplicadas dentro da view.
--
-- Correção:
--   Aplicar security_invoker = true faz a view rodar com as permissões do
--   usuário chamador, respeitando RLS nas tabelas subjacentes.
--
-- Nota:
--   Quando essas views são chamadas de dentro de funções SECURITY DEFINER
--   (ex: user_process_matches_position_or_area), o comportamento não muda
--   — a função continua rodando como postgres. O risco corrigido é o acesso
--   direto via PostgREST API.

ALTER VIEW public.employees_hierarchy_view SET (security_invoker = true);
ALTER VIEW public.processes_hierarchy_view SET (security_invoker = true);
ALTER VIEW public.projects_hierarchy_view SET (security_invoker = true);
