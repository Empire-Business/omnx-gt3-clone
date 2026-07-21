-- Add checklist_items column to tasks table for G2.9
ALTER TABLE public.tasks
ADD COLUMN checklist_items jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.tasks.checklist_items IS 'Array of {text: string, checked: boolean} items for task checklists';