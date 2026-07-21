-- Limpar todos os dados de exemplo, mantendo estrutura de auth/tenant intacta
-- Ordem respeitando FKs via CASCADE

TRUNCATE TABLE public.webhook_logs CASCADE;
TRUNCATE TABLE public.webhooks CASCADE;
TRUNCATE TABLE public.project_documents CASCADE;
TRUNCATE TABLE public.project_doc_folders CASCADE;
TRUNCATE TABLE public.process_steps CASCADE;
TRUNCATE TABLE public.process_areas CASCADE;
TRUNCATE TABLE public.process_positions CASCADE;
TRUNCATE TABLE public.tasks CASCADE;
TRUNCATE TABLE public.employee_projects CASCADE;
TRUNCATE TABLE public.employee_positions CASCADE;
TRUNCATE TABLE public.processes CASCADE;
TRUNCATE TABLE public.projects CASCADE;
TRUNCATE TABLE public.employees CASCADE;
TRUNCATE TABLE public.positions CASCADE;
TRUNCATE TABLE public.subareas CASCADE;
TRUNCATE TABLE public.company_areas CASCADE;