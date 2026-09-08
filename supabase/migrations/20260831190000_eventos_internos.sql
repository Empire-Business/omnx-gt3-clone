-- ══════════════════════════════════════════════════════════════
-- EVENTOS INTERNOS — camada de dados
--
-- Área de eventos internos integrada à aba de Reuniões: um evento pode
-- apontar para uma `meetings` (a sala/reunião que o materializa), ser
-- direcionado à empresa toda, a setores específicos ou a pessoas
-- escolhidas, e ter uma ficha de inscrição opcional.
--
-- 3 tabelas:
--   internal_events               → o evento
--   internal_event_targets        → para quem é (áreas ou pessoas)
--   internal_event_registrations  → inscrição + ficha respondida
--
-- ── Notas de schema (validadas contra o banco de PRODUÇÃO, não contra
--    types.ts nem init.sql, que estão divergentes) ──
--   • NÃO existe tabela `areas` em produção. A tabela de setores é
--     `public.company_areas` (é para ela que `meetings.area_id` aponta).
--   • `employees` NÃO tem `area_id`. O vínculo colaborador→área é
--     employee_positions → positions → COALESCE(subareas.area_id,
--     positions.area_id) — exatamente o caminho usado pela policy
--     `meetings_select`.
--   • Helpers existentes reaproveitados: get_user_tenant_id(), is_admin(),
--     has_role(uuid, app_role), update_updated_at().
--   • app_role = (admin, manager, member); employee_status = (active,
--     inactive, on_leave).
-- ══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1. internal_events
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.internal_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text,
  cover_url   text,
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz,

  -- 'company' = empresa toda | 'areas' = setores específicos
  -- | 'custom' = pessoas escolhidas (ver internal_event_targets)
  scope       text NOT NULL DEFAULT 'company'
              CHECK (scope IN ('company', 'areas', 'custom')),

  -- Integração com a aba de reuniões internas. Nullable de propósito:
  -- o evento pode ser criado antes da sala existir.
  meeting_id  uuid REFERENCES public.meetings(id) ON DELETE SET NULL,

  status      text NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft', 'published', 'cancelled', 'done')),

  registration_required boolean NOT NULL DEFAULT false,
  -- Ficha de inscrição: { "fields": [{ id, label, type, required, options }] }
  registration_form     jsonb,

  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

-- Consulta principal: agenda do tenant por período.
CREATE INDEX IF NOT EXISTS internal_events_tenant_starts_idx
  ON public.internal_events (tenant_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS internal_events_tenant_status_idx
  ON public.internal_events (tenant_id, status);
CREATE INDEX IF NOT EXISTS internal_events_meeting_idx
  ON public.internal_events (meeting_id) WHERE meeting_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS internal_events_created_by_idx
  ON public.internal_events (created_by);

-- Mesmo padrão de `meetings_updated_at`.
DROP TRIGGER IF EXISTS internal_events_updated_at ON public.internal_events;
CREATE TRIGGER internal_events_updated_at
  BEFORE UPDATE ON public.internal_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 2. internal_event_targets — só quando scope <> 'company'
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.internal_event_targets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_id    uuid NOT NULL REFERENCES public.internal_events(id) ON DELETE CASCADE,
  -- ATENÇÃO: setores vivem em company_areas (não existe tabela `areas`).
  area_id     uuid REFERENCES public.company_areas(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),

  -- Exatamente UM dos dois preenchido.
  CONSTRAINT internal_event_targets_one_of_chk CHECK (
    (area_id IS NOT NULL)::int + (employee_id IS NOT NULL)::int = 1
  )
);

CREATE INDEX IF NOT EXISTS internal_event_targets_event_idx
  ON public.internal_event_targets (event_id);
CREATE INDEX IF NOT EXISTS internal_event_targets_tenant_area_idx
  ON public.internal_event_targets (tenant_id, area_id);
CREATE INDEX IF NOT EXISTS internal_event_targets_tenant_employee_idx
  ON public.internal_event_targets (tenant_id, employee_id);

-- Evita alvo duplicado (o hook faz replace-all dos alvos ao editar).
CREATE UNIQUE INDEX IF NOT EXISTS internal_event_targets_event_area_uq
  ON public.internal_event_targets (event_id, area_id) WHERE area_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS internal_event_targets_event_employee_uq
  ON public.internal_event_targets (event_id, employee_id) WHERE employee_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 3. internal_event_registrations — inscrição / ficha respondida
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.internal_event_registrations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_id    uuid NOT NULL REFERENCES public.internal_events(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'registered'
              CHECK (status IN ('registered', 'cancelled')),
  -- Respostas da ficha: { "<field_id>": <valor> }
  answers     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT internal_event_registrations_event_employee_uq
    UNIQUE (event_id, employee_id)
);

CREATE INDEX IF NOT EXISTS internal_event_registrations_event_idx
  ON public.internal_event_registrations (event_id, status);
CREATE INDEX IF NOT EXISTS internal_event_registrations_tenant_employee_idx
  ON public.internal_event_registrations (tenant_id, employee_id);

-- ─────────────────────────────────────────────────────────────
-- 4. Helpers SECURITY DEFINER
--    Cópia direta do padrão de `get_meeting_created_by`, que existe
--    justamente para uma policy filha (meeting_attendees_select) poder
--    checar o dono do pai sem disparar o RLS do pai — o que causaria
--    recursão mútua entre as policies.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_internal_event_created_by(p_event_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT created_by FROM public.internal_events WHERE id = p_event_id;
$function$;

CREATE OR REPLACE FUNCTION public.get_internal_event_tenant(p_event_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT tenant_id FROM public.internal_events WHERE id = p_event_id;
$function$;

-- Preenche tenant_id a partir do evento pai quando o client não manda —
-- mesmo padrão de `set_meeting_attendee_tenant` em meeting_attendees.
CREATE OR REPLACE FUNCTION public.set_internal_event_child_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := public.get_internal_event_tenant(NEW.event_id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_set_internal_event_target_tenant ON public.internal_event_targets;
CREATE TRIGGER trg_set_internal_event_target_tenant
  BEFORE INSERT ON public.internal_event_targets
  FOR EACH ROW EXECUTE FUNCTION public.set_internal_event_child_tenant();

DROP TRIGGER IF EXISTS trg_set_internal_event_registration_tenant ON public.internal_event_registrations;
CREATE TRIGGER trg_set_internal_event_registration_tenant
  BEFORE INSERT ON public.internal_event_registrations
  FOR EACH ROW EXECUTE FUNCTION public.set_internal_event_child_tenant();

-- ══════════════════════════════════════════════════════════════
-- RLS
--
-- O padrão copiado é o das tabelas de reunião (verificado em produção
-- com pg_policy):
--   SELECT → tenant_id = get_user_tenant_id() AND (is_admin() OR dono OR
--            destinatário)                            [meetings_select]
--   INSERT → tenant_id = get_user_tenant_id() AND created_by = auth.uid()
--                                                     [meetings_insert]
--   UPDATE → tenant + (is_admin() OR manager OR dono)  [meetings_update]
--   DELETE → tenant + is_admin()                       [meetings_delete]
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.internal_events              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_event_targets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_event_registrations ENABLE ROW LEVEL SECURITY;

-- ── internal_events ───────────────────────────────────────────
-- "Este evento é para mim?" resolvido no banco, espelhando o bloco de
-- área de `meetings_select` (COALESCE(subareas.area_id, positions.area_id)).
-- Rascunho (draft) só aparece para admin e para quem criou.
DROP POLICY IF EXISTS internal_events_select ON public.internal_events;
CREATE POLICY internal_events_select
  ON public.internal_events FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR created_by = auth.uid()
      OR (
        status <> 'draft'
        AND (
          scope = 'company'
          OR EXISTS (
            SELECT 1
            FROM public.internal_event_targets t
            JOIN public.employees e ON e.id = t.employee_id
            WHERE t.event_id = internal_events.id
              AND e.user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1
            FROM public.internal_event_targets t
            JOIN public.employees e ON e.user_id = auth.uid()
            JOIN public.employee_positions ep ON ep.employee_id = e.id
            JOIN public.positions pos ON pos.id = ep.position_id
            LEFT JOIN public.subareas sa ON sa.id = pos.subarea_id
            WHERE t.event_id = internal_events.id
              AND t.area_id IS NOT NULL
              AND COALESCE(sa.area_id, pos.area_id) = t.area_id
          )
        )
      )
    )
  );

DROP POLICY IF EXISTS internal_events_insert ON public.internal_events;
CREATE POLICY internal_events_insert
  ON public.internal_events FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS internal_events_update ON public.internal_events;
CREATE POLICY internal_events_update
  ON public.internal_events FOR UPDATE
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR created_by = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS internal_events_delete ON public.internal_events;
CREATE POLICY internal_events_delete
  ON public.internal_events FOR DELETE
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND public.is_admin()
  );

-- ── internal_event_targets ────────────────────────────────────
-- SELECT propositalmente simples (só tenant), como `areas_select`: se
-- referenciasse internal_events aqui, e internal_events_select
-- referencia esta tabela, as duas policies entrariam em recursão mútua.
DROP POLICY IF EXISTS internal_event_targets_select ON public.internal_event_targets;
CREATE POLICY internal_event_targets_select
  ON public.internal_event_targets FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id());

DROP POLICY IF EXISTS internal_event_targets_insert ON public.internal_event_targets;
CREATE POLICY internal_event_targets_insert
  ON public.internal_event_targets FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.get_internal_event_created_by(event_id) = auth.uid()
    )
  );

DROP POLICY IF EXISTS internal_event_targets_update ON public.internal_event_targets;
CREATE POLICY internal_event_targets_update
  ON public.internal_event_targets FOR UPDATE
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.get_internal_event_created_by(event_id) = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.get_internal_event_created_by(event_id) = auth.uid()
    )
  );

DROP POLICY IF EXISTS internal_event_targets_delete ON public.internal_event_targets;
CREATE POLICY internal_event_targets_delete
  ON public.internal_event_targets FOR DELETE
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.get_internal_event_created_by(event_id) = auth.uid()
    )
  );

-- ── internal_event_registrations ──────────────────────────────
-- Mesma forma de `meeting_attendees_select` (tenant + admin OU o próprio
-- colaborador OU quem criou o pai), sem a cláusula legada
-- "NOT EXISTS (user_roles do auth.uid())" daquela policy — ela libera a
-- tabela inteira para usuários sem linha em user_roles, e não faz sentido
-- reproduzir esse buraco numa tabela nova.
DROP POLICY IF EXISTS internal_event_registrations_select ON public.internal_event_registrations;
CREATE POLICY internal_event_registrations_select
  ON public.internal_event_registrations FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = internal_event_registrations.employee_id
          AND e.user_id = auth.uid()
      )
      OR public.get_internal_event_created_by(event_id) = auth.uid()
    )
  );

-- Inscrição é ato do próprio colaborador; admin/manager/organizador podem
-- inscrever terceiros.
DROP POLICY IF EXISTS internal_event_registrations_insert ON public.internal_event_registrations;
CREATE POLICY internal_event_registrations_insert
  ON public.internal_event_registrations FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.get_internal_event_created_by(event_id) = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = internal_event_registrations.employee_id
          AND e.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS internal_event_registrations_update ON public.internal_event_registrations;
CREATE POLICY internal_event_registrations_update
  ON public.internal_event_registrations FOR UPDATE
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.get_internal_event_created_by(event_id) = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = internal_event_registrations.employee_id
          AND e.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.get_internal_event_created_by(event_id) = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = internal_event_registrations.employee_id
          AND e.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS internal_event_registrations_delete ON public.internal_event_registrations;
CREATE POLICY internal_event_registrations_delete
  ON public.internal_event_registrations FOR DELETE
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR public.get_internal_event_created_by(event_id) = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.employees e
        WHERE e.id = internal_event_registrations.employee_id
          AND e.user_id = auth.uid()
      )
    )
  );

-- ── Documentação ──────────────────────────────────────────────
COMMENT ON TABLE  public.internal_events IS
  'Eventos internos da empresa. Integra com a aba de reuniões via meeting_id.';
COMMENT ON COLUMN public.internal_events.scope IS
  'company = empresa toda | areas = setores em internal_event_targets.area_id | custom = pessoas em internal_event_targets.employee_id';
COMMENT ON COLUMN public.internal_events.registration_form IS
  'Ficha de inscrição opcional: { "fields": [{ id, label, type, required, options }] }';
COMMENT ON TABLE  public.internal_event_targets IS
  'Destinatários do evento. area_id referencia company_areas (não existe tabela "areas").';
COMMENT ON TABLE  public.internal_event_registrations IS
  'Inscrições e respostas da ficha. Única por (event_id, employee_id).';
