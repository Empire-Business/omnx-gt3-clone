-- Add 'ajustes' and 'arquivado' to task_status enum
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'ajustes' AFTER 'review';
ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'arquivado' AFTER 'done';
