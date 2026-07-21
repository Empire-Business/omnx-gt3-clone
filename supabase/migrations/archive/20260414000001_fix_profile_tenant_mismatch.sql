-- Fix: corrige profiles.tenant_id para usuários cujo perfil aponta para o
-- tenant errado (tenant gerado automaticamente pelo trigger antigo).
--
-- Causa: antes da migração 20260221004356, o trigger handle_new_user ignorava
-- invited_tenant_id e sempre criava um novo tenant para qualquer usuário.
-- Resultado: profile.tenant_id != employees.tenant_id → get_user_tenant_id()
-- retornava um UUID errado → o RLS bloqueava todos os projetos e tarefas.
--
-- Correção: para qualquer usuário cujo profile.tenant_id diverge do
-- employees.tenant_id, alinhamos o profile ao tenant correto (o do employee,
-- definido pelo admin que criou o usuário).

-- 1. Diagnóstico: exibe os usuários afetados antes de corrigir
DO $$
DECLARE
  r RECORD;
  affected_count INTEGER := 0;
BEGIN
  FOR r IN
    SELECT
      p.user_id,
      p.full_name,
      p.tenant_id   AS profile_tenant,
      e.tenant_id   AS employee_tenant
    FROM public.profiles p
    JOIN public.employees e ON e.user_id = p.user_id
    WHERE e.tenant_id != p.tenant_id
  LOOP
    RAISE NOTICE 'MISMATCH: user=% (%) | profile_tenant=% | employee_tenant=%',
      r.user_id, r.full_name, r.profile_tenant, r.employee_tenant;
    affected_count := affected_count + 1;
  END LOOP;

  IF affected_count = 0 THEN
    RAISE NOTICE 'Nenhum mismatch encontrado entre profiles e employees.';
  ELSE
    RAISE NOTICE 'Total de usuários com mismatch: %', affected_count;
  END IF;
END $$;

-- 2. Correção: alinha profile.tenant_id com employees.tenant_id
UPDATE public.profiles p
SET tenant_id = e.tenant_id
FROM public.employees e
WHERE e.user_id = p.user_id
  AND e.tenant_id != p.tenant_id;

-- 3. Diagnóstico pós-correção: exibe quantos foram corrigidos
DO $$
DECLARE
  remaining INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining
  FROM public.profiles p
  JOIN public.employees e ON e.user_id = p.user_id
  WHERE e.tenant_id != p.tenant_id;

  IF remaining = 0 THEN
    RAISE NOTICE 'Correção aplicada com sucesso. Nenhum mismatch restante.';
  ELSE
    RAISE NOTICE 'ATENÇÃO: ainda existem % mismatch(es) após a correção.', remaining;
  END IF;
END $$;

-- 4. Tenants órfãos criados erroneamente pelo trigger antigo
-- (sem employees, sem projetos, sem nada — criados apenas como efeito colateral)
-- NÃO removemos automaticamente para evitar perda acidental de dados.
-- Para remover manualmente, use:
--   DELETE FROM public.tenants t
--   WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.tenant_id = t.id);
