-- Backfill project labels on existing tasks so cards reflect the selected project.
-- Idempotent: it removes stale project-name labels and appends the current project label.

WITH tenant_project_names AS (
  SELECT
    tenant_id,
    ARRAY_AGG(LOWER(name)) AS project_names
  FROM public.projects
  GROUP BY tenant_id
),
tasks_without_project AS (
  SELECT
    t.id,
    COALESCE(
      (
        SELECT jsonb_agg(label)
        FROM jsonb_array_elements(COALESCE(t.labels, '[]'::jsonb)) AS label
        WHERE NOT (
          LOWER(COALESCE(label->>'text', '')) = ANY(COALESCE(tpn.project_names, ARRAY[]::text[]))
        )
      ),
      '[]'::jsonb
    ) AS next_labels
  FROM public.tasks AS t
  LEFT JOIN tenant_project_names AS tpn
    ON tpn.tenant_id = t.tenant_id
  WHERE t.project_id IS NULL
),
project_label_candidates AS (
  SELECT
    t.id,
    COALESCE(
      (
        SELECT jsonb_agg(label)
        FROM jsonb_array_elements(COALESCE(t.labels, '[]'::jsonb)) AS label
        WHERE NOT (
          LOWER(COALESCE(label->>'text', '')) = ANY(COALESCE(tpn.project_names, ARRAY[]::text[]))
        )
      ),
      '[]'::jsonb
    ) ||
    jsonb_build_array(
      jsonb_build_object(
        'text', p.name,
        'color',
        CASE
          WHEN LOWER(p.name) = 'gt3' THEN '#2563eb'
          ELSE (
            ARRAY[
              '#2563eb',
              '#16a34a',
              '#ea580c',
              '#7c3aed',
              '#dc2626',
              '#0891b2',
              '#ca8a04',
              '#db2777',
              '#4f46e5',
              '#0f766e'
            ]
          )[
            (
              (
                ('x' || SUBSTRING(md5(p.id::text || ':' || LOWER(p.name)) FROM 1 FOR 8))::bit(32)::int
              ) % 10
            ) + 1
          ]
        END
      )
    ) AS next_labels
  FROM public.tasks AS t
  JOIN public.projects AS p
    ON p.id = t.project_id
  LEFT JOIN tenant_project_names AS tpn
    ON tpn.tenant_id = t.tenant_id
),
task_label_updates AS (
  SELECT * FROM tasks_without_project
  UNION ALL
  SELECT * FROM project_label_candidates
)
UPDATE public.tasks AS t
SET labels = u.next_labels
FROM task_label_updates AS u
WHERE u.id = t.id
  AND t.labels IS DISTINCT FROM u.next_labels;
