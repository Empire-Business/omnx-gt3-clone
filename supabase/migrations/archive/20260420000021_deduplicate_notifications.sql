-- Remove notificações duplicadas existentes (mantém a mais antiga de cada grupo)
-- e marca as duplicatas que foram lidas como lidas em todo o grupo

-- 1. Para cada grupo de duplicatas onde ao menos uma foi lida, marca todas como lidas
UPDATE public.notifications n
SET is_read = true
WHERE is_read = false
  AND EXISTS (
    SELECT 1 FROM public.notifications n2
    WHERE n2.user_id  = n.user_id
      AND n2.type     = n.type
      AND n2.link     = n.link
      AND n2.is_read  = true
  );

-- 2. Remove duplicatas, mantendo apenas a mais recente de cada grupo
DELETE FROM public.notifications
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id, type, link, tenant_id) id
  FROM public.notifications
  ORDER BY user_id, type, link, tenant_id, created_at DESC
);
