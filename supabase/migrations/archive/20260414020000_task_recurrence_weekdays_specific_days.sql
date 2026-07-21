-- ============================================================
-- Adiciona frequências 'weekdays' (dias úteis) e 'specific_days'
-- (dias específicos da semana) à tabela task_recurrence
-- ============================================================

-- 1. Remover o CHECK constraint existente e adicionar versão estendida
ALTER TABLE public.task_recurrence
  DROP CONSTRAINT IF EXISTS task_recurrence_frequency_check;

ALTER TABLE public.task_recurrence
  ADD CONSTRAINT task_recurrence_frequency_check
  CHECK (frequency IN ('daily', 'weekly', 'biweekly', 'monthly', 'custom', 'weekdays', 'specific_days'));

-- 2. Substituir a função process_task_recurrences() com suporte às novas frequências
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
    -- Criar nova tarefa copiando da original
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

    -- Calcular próxima ocorrência de acordo com a frequência
    next_date := CASE rec.frequency
      WHEN 'daily' THEN
        rec.next_occurrence + INTERVAL '1 day'

      WHEN 'weekly' THEN
        rec.next_occurrence + INTERVAL '7 days'

      WHEN 'biweekly' THEN
        rec.next_occurrence + INTERVAL '14 days'

      WHEN 'monthly' THEN
        rec.next_occurrence + INTERVAL '1 month'

      WHEN 'custom' THEN
        rec.next_occurrence + (COALESCE(rec.interval_days, 7) || ' days')::INTERVAL

      -- Apenas dias úteis (seg-sex): avança para o próximo dia que não seja sábado ou domingo
      WHEN 'weekdays' THEN (
        SELECT d::DATE
        FROM generate_series(
          rec.next_occurrence + INTERVAL '1 day',
          rec.next_occurrence + INTERVAL '8 days',
          INTERVAL '1 day'
        ) AS d
        WHERE EXTRACT(DOW FROM d) NOT IN (0, 6)
        ORDER BY d
        LIMIT 1
      )

      -- Dias específicos: avança para o próximo dia da semana que esteja em days_of_week[]
      -- EXTRACT(DOW): 0=Dom, 1=Seg, ..., 6=Sáb
      WHEN 'specific_days' THEN (
        SELECT d::DATE
        FROM generate_series(
          rec.next_occurrence + INTERVAL '1 day',
          rec.next_occurrence + INTERVAL '8 days',
          INTERVAL '1 day'
        ) AS d
        WHERE EXTRACT(DOW FROM d)::INT = ANY(COALESCE(rec.days_of_week, ARRAY[1,2,3,4,5]))
        ORDER BY d
        LIMIT 1
      )

      ELSE rec.next_occurrence + INTERVAL '7 days'
    END;

    -- Desativar se passou da data limite, senão avançar
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
