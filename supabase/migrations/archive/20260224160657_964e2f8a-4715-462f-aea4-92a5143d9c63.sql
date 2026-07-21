-- Add owner_id to projects (the person responsible for the project as a whole)
ALTER TABLE public.projects
ADD COLUMN owner_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;