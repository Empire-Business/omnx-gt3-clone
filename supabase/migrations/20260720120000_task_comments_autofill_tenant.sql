-- Preenche tenant_id do comentario a partir da task quando o cliente nao envia.
-- Torna o insert de task_comments robusto contra builds antigos do frontend
-- (ex.: build divergente no Lovable) que omitem tenant_id e caiam em
-- "new row violates row-level security policy for table task_comments".
CREATE OR REPLACE FUNCTION public.task_comments_fill_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    SELECT t.tenant_id INTO NEW.tenant_id
    FROM public.tasks t
    WHERE t.id = NEW.task_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_comments_fill_tenant ON public.task_comments;
CREATE TRIGGER trg_task_comments_fill_tenant
  BEFORE INSERT ON public.task_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.task_comments_fill_tenant();
