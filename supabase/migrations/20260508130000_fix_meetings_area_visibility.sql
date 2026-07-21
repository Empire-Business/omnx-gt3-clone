-- ══════════════════════════════════════════════════════════════
-- Corrige visibilidade de meetings vinculadas a uma area.
--
-- A policy meetings_select fazia JOIN com subareas para resolver
-- a area do usuario, o que excluia colaboradores cujo cargo esta
-- vinculado diretamente a uma area (sem subarea).
--
-- Sintoma: "fui adicionado a reuniao via grupo da area, mas ela
-- nao aparece em /reunioes". Ex: Bruno Andrease.
-- ══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS meetings_select ON public.meetings;

CREATE POLICY meetings_select ON public.meetings
FOR SELECT
USING (
  tenant_id = get_user_tenant_id()
  AND (
    is_admin()
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM meeting_attendees ma
      JOIN employees e ON e.id = ma.employee_id
      WHERE ma.meeting_id = meetings.id
        AND e.user_id = auth.uid()
    )
    OR (
      project_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM employee_projects ep
        JOIN employees e ON e.id = ep.employee_id
        WHERE ep.project_id = meetings.project_id
          AND e.user_id = auth.uid()
      )
    )
    OR (
      area_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM employees e
        JOIN employee_positions ep ON ep.employee_id = e.id
        JOIN positions pos ON pos.id = ep.position_id
        LEFT JOIN subareas sa ON sa.id = pos.subarea_id
        WHERE e.user_id = auth.uid()
          AND COALESCE(sa.area_id, pos.area_id) = meetings.area_id
      )
    )
  )
);
