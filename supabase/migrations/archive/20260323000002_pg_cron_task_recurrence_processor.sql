-- Enable pg_cron and create function to process recurring tasks
-- Runs daily at 03:00 UTC (midnight BRT)

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Function: find due recurrences, create new tasks, advance next_occurrence
CREATE OR REPLACE FUNCTION public.process_task_recurrences()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec RECORD;
  new_task_id UUID;
  tasks_created INT := 0;
  recurrences_deactivated INT := 0;
  next_date DATE;
BEGIN
  FOR rec IN
    SELECT
      tr.*,
      t.title,
      t.description,
      t.project_id,
      t.assignee_id,
      t.created_by,
      t.priority,
      t.checklist_items,
      t.labels
    FROM task_recurrence tr
    JOIN tasks t ON t.id = tr.task_id
    WHERE tr.is_active = true
      AND tr.next_occurrence <= CURRENT_DATE
  LOOP
    -- Create new task copying from the original
    INSERT INTO tasks (
      tenant_id, project_id, assignee_id, created_by,
      title, description, status, priority,
      due_date, checklist_items, labels
    ) VALUES (
      rec.tenant_id,
      rec.project_id,
      rec.assignee_id,
      rec.created_by,
      rec.title,
      rec.description,
      'todo',
      rec.priority,
      rec.next_occurrence::timestamptz,
      -- Reset checklist items to unchecked
      CASE
        WHEN rec.checklist_items IS NOT NULL AND jsonb_array_length(rec.checklist_items) > 0
        THEN (
          SELECT jsonb_agg(
            jsonb_set(item, '{checked}', 'false'::jsonb)
          )
          FROM jsonb_array_elements(rec.checklist_items) AS item
        )
        ELSE '[]'::jsonb
      END,
      rec.labels
    )
    RETURNING id INTO new_task_id;

    tasks_created := tasks_created + 1;

    -- Calculate next occurrence based on frequency
    next_date := CASE rec.frequency
      WHEN 'daily' THEN rec.next_occurrence + INTERVAL '1 day'
      WHEN 'weekly' THEN rec.next_occurrence + INTERVAL '7 days'
      WHEN 'biweekly' THEN rec.next_occurrence + INTERVAL '14 days'
      WHEN 'monthly' THEN rec.next_occurrence + INTERVAL '1 month'
      WHEN 'custom' THEN rec.next_occurrence + (COALESCE(rec.interval_days, 7) || ' days')::INTERVAL
      ELSE rec.next_occurrence + INTERVAL '7 days'
    END;

    -- Deactivate if past end_date, otherwise advance
    IF rec.end_date IS NOT NULL AND next_date > rec.end_date THEN
      UPDATE task_recurrence SET is_active = false WHERE id = rec.id;
      recurrences_deactivated := recurrences_deactivated + 1;
    ELSE
      UPDATE task_recurrence SET next_occurrence = next_date WHERE id = rec.id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'tasks_created', tasks_created,
    'recurrences_deactivated', recurrences_deactivated,
    'processed_at', now()
  );
END;
$$;

-- Schedule: every day at 03:00 UTC (midnight BRT)
SELECT cron.schedule(
  'process-task-recurrences',
  '0 3 * * *',
  $$SELECT public.process_task_recurrences()$$
);
