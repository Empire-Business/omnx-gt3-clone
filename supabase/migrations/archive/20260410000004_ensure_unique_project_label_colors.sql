-- Ensure each project uses a unique task label color inside its tenant.
-- GT3 stays fixed in blue; the remaining projects receive unique HSL colors
-- based on their stable order by project name/id.

WITH tenant_project_names AS (
  SELECT
    tenant_id,
    ARRAY_AGG(LOWER(name)) AS project_names
  FROM public.projects
  GROUP BY tenant_id
),
ranked_projects AS (
  SELECT
    p.id,
    p.tenant_id,
    p.name,
    LOWER(p.name) AS normalized_name,
    ROW_NUMBER() OVER (
      PARTITION BY p.tenant_id
      ORDER BY LOWER(p.name), p.id
    ) AS order_index
  FROM public.projects AS p
),
ordered_projects AS (
  SELECT
    rp.id,
    rp.tenant_id,
    rp.name,
    CASE
      WHEN rp.normalized_name = 'gt3' THEN '#2563eb'
      ELSE format(
        'hsl(%s %s%% %s%%)',
        ROUND(((rp.order_index - 1) * 137.508)::numeric % 360),
        68 + ((rp.order_index - 1) % 3) * 4,
        46 + ((rp.order_index - 1) % 2) * 6
      )
    END AS color
  FROM ranked_projects AS rp
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
    CASE
      WHEN t.project_id IS NULL THEN '[]'::jsonb
      ELSE jsonb_build_array(
        jsonb_build_object(
          'text', op.name,
          'color', op.color
        )
      )
    END AS next_labels
  FROM public.tasks AS t
  LEFT JOIN ordered_projects AS op
    ON op.id = t.project_id
  LEFT JOIN tenant_project_names AS tpn
    ON tpn.tenant_id = t.tenant_id
)
UPDATE public.tasks AS t
SET labels = plc.next_labels
FROM project_label_candidates AS plc
WHERE plc.id = t.id
  AND t.labels IS DISTINCT FROM plc.next_labels;
