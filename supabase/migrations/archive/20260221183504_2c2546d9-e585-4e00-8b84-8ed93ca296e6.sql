
ALTER TABLE public.processes
ADD COLUMN IF NOT EXISTS process_markdown text,
ADD COLUMN IF NOT EXISTS flow_data jsonb,
ADD COLUMN IF NOT EXISTS original_prompt text;
