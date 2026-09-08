-- ══════════════════════════════════════════════════════════════
-- EVENTOS INTERNOS — hardening de RLS (v8.44.1)
--
-- ⚠️ ESTA MIGRATION **NÃO FOI APLICADA**. Ela foi escrita a partir de uma
--    auditoria estática do módulo de Eventos Internos e está no disco à
--    espera de decisão do dono do banco. O sistema está EM PRODUÇÃO.
--
-- ⚠️ ANTES DE APLICAR, rodar dry-run numa transação abortada:
--        BEGIN;
--          \i supabase/migrations/20260903120000_eventos_internos_hardening.sql
--        ROLLBACK;
--    O dry-run é o que pegou, na v8.39.0, uma constraint duplicada que teria
--    abortado a migration inteira em produção. Depois do dry-run, conferir
--    também que:
--      • os enums `app_role` e `employee_status` têm mesmo os valores usados
--        aqui ('manager' e 'active');
--      • nenhum fluxo legítimo depende de um `member` publicar evento
--        (bloco 1) — quem só é `member` deixa de conseguir criar evento;
--      • não há inscrição sendo feita hoje em evento `draft` por algum
--        fluxo administrativo do frontend (bloco 2).
--
-- Idempotente: só DROP POLICY IF EXISTS / CREATE POLICY, CREATE OR REPLACE
-- FUNCTION e DROP TRIGGER IF EXISTS / CREATE TRIGGER. Nenhuma migration
-- existente é reescrita; nenhuma tabela é criada ou alterada.
--
-- ── O que cada bloco corrige ──────────────────────────────────
--   1. internal_events_insert não checava papel NENHUM: qualquer `member`
--      podia POSTar scope='company' + status='published' e a Edge Function
--      `notify-upcoming-events` disparava push para a empresa inteira com
--      texto e capa escolhidos por ele. Passa a exigir admin OU manager.
--   2. internal_event_registrations_insert não olhava o evento: dava para se
--      inscrever em rascunho, em evento cancelado e em evento de outro
--      setor. Passa a exigir evento `published` (via helper novo
--      get_internal_event_status, no molde do get_internal_event_created_by).
--   3. internal_event_targets_select era só `tenant_id = ...`: a lista de
--      convidados de QUALQUER rascunho alheio vazava para o tenant inteiro.
--      Fechada usando o helper de status — sem recursão com
--      internal_events_select.
--   4. Escrita cross-tenant nas tabelas filhas: o trigger só preenchia
--      tenant_id quando o client omitia (e o client sempre manda), e nenhum
--      WITH CHECK conferia que o event_id era do mesmo tenant. Corrigido dos
--      dois lados (trigger sempre sobrescreve + igualdade no WITH CHECK).
--   5. internal_event_registrations_delete esqueceu o manager, ao contrário
--      de SELECT/INSERT/UPDATE. Padronizado.
--   6. internal_events_select fazia JOIN employees sem filtrar status:
--      ex-colaborador com sessão viva continuava vendo os eventos.
--   7. Policies de internal_event_notifications sem `TO authenticated` —
--      valiam para PUBLIC, incluindo `anon`. Recriadas com o papel declarado.
--   8. internal_events_delete exigia is_admin(), então a compensação de
--      criação parcial do hook (apagar o evento órfão quando a gravação dos
--      alvos falha) NÃO funcionava para manager. Passa a aceitar o criador.
--   9. (só recomendação, no fim do arquivo) alcance de `manager` em
--      internal_event_registrations_select.
--
-- ── Premissas de schema ───────────────────────────────────────
-- Validadas lendo as migrations (20260831190000_eventos_internos.sql e
-- 20260831191000_internal_event_notifications.sql), NUNCA o
-- src/integrations/supabase/types.ts, que está comprovadamente divergente da
-- produção:
--   • NÃO existe tabela `areas`; setores vivem em `public.company_areas`.
--   • `employees` NÃO tem `area_id` — o caminho é employee_positions →
--     positions → COALESCE(subareas.area_id, positions.area_id).
--   • `employee_positions` NÃO tem `tenant_id` (por isso o filtro explícito
--     de tenant do CLAUDE.md §2 não aparece naquele join).
--   • Helpers pré-existentes reaproveitados: get_user_tenant_id(),
--     is_admin(), has_role(uuid, app_role), get_internal_event_created_by(),
--     get_internal_event_tenant().
-- ══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 0. Helper novo: status do evento pai
--
-- Mesmo motivo de existir do `get_internal_event_created_by`: uma policy de
-- tabela FILHA precisa consultar uma coluna do PAI, e ler o pai diretamente
-- dispararia o RLS do pai — que por sua vez referencia a filha
-- (internal_events_select faz EXISTS em internal_event_targets). Isso é
-- recursão mútua e o Postgres aborta a query. SECURITY DEFINER + search_path
-- fixo é o padrão do repo (get_meeting_created_by, get_internal_event_tenant).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_internal_event_status(p_event_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT status FROM public.internal_events WHERE id = p_event_id;
$function$;

COMMENT ON FUNCTION public.get_internal_event_status(uuid) IS
  'Status do evento pai, lido sem passar pelo RLS de internal_events. Existe para as policies das tabelas filhas não entrarem em recursão mútua com internal_events_select.';

-- ═══════════════════════════════════════════════════════════════
-- 1. internal_events_insert — publicar deixa de ser direito de todos
--
-- A policy antiga era apenas `tenant_id = get_user_tenant_id() AND
-- created_by = auth.uid()`. Nenhuma checagem de papel. Como `scope` e
-- `status` chegam do client, um `member` faz:
--     POST /internal_events { scope:'company', status:'published',
--                             title:<texto dele>, cover_url:<imagem dele> }
-- e o cron do `notify-upcoming-events` entrega push in-app + Web Push para a
-- empresa inteira, com conteúdo que ele controla. É megafone corporativo
-- aberto — a falha mais grave do módulo.
--
-- Regra nova: só admin ou manager criam evento. Isso é MAIS restrito que
-- `meetings_insert` (que aceita qualquer autenticado do tenant) de propósito:
-- reunião chega a quem foi convidado; evento com scope='company' chega a
-- todo mundo e ainda dispara push. A escrita continua exigindo
-- created_by = auth.uid(), então ninguém publica em nome de terceiro.
--
-- ⚠️ Consequência a validar antes de aplicar: se hoje algum colaborador
--    `member` cria eventos legitimamente, ele para de conseguir. O caminho
--    nesse caso é promover a pessoa a manager, não afrouxar a policy.
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS internal_events_insert ON public.internal_events;
CREATE POLICY internal_events_insert
  ON public.internal_events FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND created_by = auth.uid()
    AND (
      public.is_admin()
      OR public.has_role(auth.uid(), 'manager'::app_role)
    )
  );

-- ═══════════════════════════════════════════════════════════════
-- 2. internal_event_registrations_insert — a inscrição passa a olhar o evento
--
-- A policy antiga aceitava qualquer colaborador inscrevendo a si mesmo, sem
-- ler NADA do evento: dava para se inscrever em rascunho (que a pessoa nem
-- deveria enxergar), em evento `cancelled`, em evento `done` e em evento de
-- outro setor. Como a tabela tem UNIQUE (event_id, employee_id), a linha
-- criada indevidamente ainda ocupa a chave e atrapalha a inscrição legítima.
--
-- Regra nova para o auto-cadastro: o evento precisa estar `published`.
-- Admin, manager e o organizador continuam podendo inscrever terceiros em
-- qualquer status (é assim que se monta a lista antes de publicar).
--
-- ── Por que NÃO se exige também pertencer ao público ──────────
-- Tecnicamente daria: um helper SECURITY DEFINER (ex.:
-- is_internal_event_for_employee(event_id, employee_id)) replicaria o bloco
-- de audiência do internal_events_select sem recursão, porque roda como dono
-- e não reentra no RLS. O problema NÃO é recursão, é cadastro: para
-- scope='areas' a área da pessoa é derivada de employee_positions →
-- positions, e a v8.39.0 registrou que só ~39 colaboradores têm cargo
-- vinculado. Ligar essa exigência hoje bloquearia inscrição legítima de todo
-- mundo sem cargo cadastrado — trocaria um furo de segurança por um
-- incidente de produção. Fica como tarefa no ROADMAP, condicionada a
-- fechar o cadastro de cargos. O `published` já mata os casos concretos
-- (rascunho e evento cancelado).
--
-- Nota: `registration_required` NÃO entra na condição. O frontend só oferece
-- o botão quando a ficha existe, e há evento publicado sem ficha em que a
-- inscrição é usada como confirmação de presença — bloquear aqui quebraria
-- esse uso sem ganho de segurança (o dado é do próprio autor).
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS internal_event_registrations_insert ON public.internal_event_registrations;
CREATE POLICY internal_event_registrations_insert
  ON public.internal_event_registrations FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    -- Bloco 4: a linha filha não pode apontar para evento de outro tenant.
    AND tenant_id = public.get_internal_event_tenant(event_id)
    AND (
      public.is_admin()
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.get_internal_event_created_by(event_id) = auth.uid()
      OR (
        -- Auto-inscrição: só em evento publicado.
        public.get_internal_event_status(event_id) = 'published'
        AND EXISTS (
          SELECT 1 FROM public.employees e
          WHERE e.id = internal_event_registrations.employee_id
            AND e.user_id = auth.uid()
            AND e.status = 'active'
        )
      )
    )
  );

-- ═══════════════════════════════════════════════════════════════
-- 3. internal_event_targets_select — a lista de convidados para de vazar
--
-- A policy antiga era `tenant_id = get_user_tenant_id()` e nada mais. Foi
-- escrita assim DE PROPÓSITO, para não entrar em recursão mútua com
-- internal_events_select (que faz EXISTS nesta tabela). O efeito colateral é
-- grave: qualquer colaborador do tenant lê os alvos de qualquer rascunho —
-- inclusive um rascunho de "conversa de desligamento" com quatro nomes. A
-- lista de convidados É a informação sensível, mesmo com o evento invisível.
--
-- A saída sem recursão é o helper de status do bloco 0: ele lê
-- internal_events como dono, então não reentra no RLS do pai.
--
-- Critério: admin OU criador do evento OU evento fora de rascunho.
-- Manager NÃO entra na lista: ele consegue EDITAR alvos de rascunho alheio
-- (policies de escrita já o incluíam desde a v8.39.0), mas não LER os de um
-- rascunho que não é dele. É assimétrico e conhecido — a alternativa seria
-- devolver a manager a leitura de todo rascunho do tenant, que é justamente
-- o vazamento que este bloco fecha. Se na prática algum manager precisar
-- revisar rascunho de terceiro, o certo é passá-lo a co-organizador (ou
-- alinhar antes de publicar), não reabrir a policy.
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS internal_event_targets_select ON public.internal_event_targets;
CREATE POLICY internal_event_targets_select
  ON public.internal_event_targets FOR SELECT
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR public.get_internal_event_created_by(event_id) = auth.uid()
      OR public.get_internal_event_status(event_id) <> 'draft'
    )
  );

-- ═══════════════════════════════════════════════════════════════
-- 4. Escrita cross-tenant nas tabelas filhas
--
-- Dois defeitos que se somavam:
--
-- (a) `set_internal_event_child_tenant` só preenchia `tenant_id` quando o
--     client OMITIA — e o client sempre manda o valor. Na prática o trigger
--     nunca corrigia nada; era decoração.
-- (b) Nenhuma policy de escrita conferia que o `event_id` pertence ao mesmo
--     tenant do `tenant_id` enviado. Combinando: dá para inserir linha filha
--     com o MEU tenant_id apontando para o evento de OUTRO tenant. Em
--     internal_event_registrations isso é pior que ruído — a UNIQUE
--     (event_id, employee_id) fica ocupada e a vítima não consegue mais se
--     inscrever no próprio evento. Negação de serviço permanente e silenciosa.
--
-- Correção nos dois lados (defesa em profundidade, CLAUDE.md §2): o trigger
-- passa a SEMPRE derivar o tenant do evento pai, e as policies ganham a
-- igualdade `tenant_id = get_internal_event_tenant(event_id)`.
--
-- O trigger cobre INSERT e UPDATE (antes só INSERT): sem o UPDATE, dava para
-- inserir certo e depois trocar o tenant_id da linha.
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.set_internal_event_child_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid;
BEGIN
  -- O tenant da linha filha é SEMPRE o do evento pai — nunca o que o client
  -- mandou. Se o client mandou outro, era erro ou ataque; nos dois casos o
  -- valor correto é o mesmo.
  v_tenant := public.get_internal_event_tenant(NEW.event_id);

  IF v_tenant IS NULL THEN
    -- Evento inexistente. A FK abortaria de qualquer forma, mas um erro
    -- explícito aqui é mais legível que uma violação de chave estrangeira.
    RAISE EXCEPTION 'evento % inexistente: nao e possivel derivar tenant_id', NEW.event_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  NEW.tenant_id := v_tenant;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_set_internal_event_target_tenant ON public.internal_event_targets;
CREATE TRIGGER trg_set_internal_event_target_tenant
  BEFORE INSERT OR UPDATE ON public.internal_event_targets
  FOR EACH ROW EXECUTE FUNCTION public.set_internal_event_child_tenant();

DROP TRIGGER IF EXISTS trg_set_internal_event_registration_tenant ON public.internal_event_registrations;
CREATE TRIGGER trg_set_internal_event_registration_tenant
  BEFORE INSERT OR UPDATE ON public.internal_event_registrations
  FOR EACH ROW EXECUTE FUNCTION public.set_internal_event_child_tenant();

-- ── 4.a targets: WITH CHECK com a igualdade de tenant ─────────
DROP POLICY IF EXISTS internal_event_targets_insert ON public.internal_event_targets;
CREATE POLICY internal_event_targets_insert
  ON public.internal_event_targets FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id()
    AND tenant_id = public.get_internal_event_tenant(event_id)
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
    AND tenant_id = public.get_internal_event_tenant(event_id)
    AND (
      public.is_admin()
      OR public.has_role(auth.uid(), 'manager'::app_role)
      OR public.get_internal_event_created_by(event_id) = auth.uid()
    )
  );

-- ── 4.b registrations: UPDATE com a igualdade de tenant ───────
-- (o INSERT já saiu corrigido no bloco 2)
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
    AND tenant_id = public.get_internal_event_tenant(event_id)
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
-- Nota: o USING do UPDATE do próprio colaborador NÃO exige e.status='active'
-- de propósito — quem foi desligado precisa continuar podendo CANCELAR a
-- própria inscrição (status='cancelled'), e o organizador também tira o nome
-- dele da lista. Quem é barrado de entrar é coberto pelo bloco 6 (leitura do
-- evento) e pelo bloco 2 (inscrição nova).

-- ═══════════════════════════════════════════════════════════════
-- 5. internal_event_registrations_delete — o manager que faltava
--
-- SELECT, INSERT e UPDATE incluem manager desde a v8.39.0; só o DELETE
-- esqueceu. O resultado é um manager que consegue marcar a inscrição como
-- 'cancelled' mas não consegue removê-la — inconsistência sem intenção por
-- trás, do tipo que gera "sumiu/não sumiu" na tela.
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS internal_event_registrations_delete ON public.internal_event_registrations;
CREATE POLICY internal_event_registrations_delete
  ON public.internal_event_registrations FOR DELETE
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
  );

-- ═══════════════════════════════════════════════════════════════
-- 6. internal_events_select — ex-colaborador para de ver evento
--
-- Os dois EXISTS da policy faziam JOIN em `employees` sem olhar `status`.
-- Desligar alguém no GT3 marca `employees.status='inactive'`, mas a sessão
-- do Supabase segue válida até o refresh token expirar — e nesse intervalo o
-- ex-colaborador continuava recebendo a agenda interna da empresa. O
-- `meetings_select` tem o mesmo padrão herdado; aqui pelo menos a tabela
-- nova sai correta.
--
-- Só o bloco de audiência ganha o filtro. Admin e criador seguem intactos:
-- se o próprio criador foi desligado, quem administra ainda precisa achar o
-- evento dele para transferir ou cancelar.
-- ═══════════════════════════════════════════════════════════════
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
              AND e.status = 'active'
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
              AND e.status = 'active'
              AND COALESCE(sa.area_id, pos.area_id) = t.area_id
          )
        )
      )
    )
  );
-- Observação: `scope='company'` continua alcançando qualquer autenticado do
-- tenant, inclusive um ex-colaborador com sessão viva — não há join em
-- employees nesse ramo para filtrar. Fechar isso exigiria um EXISTS novo
-- (employee ativo do tenant) em TODO evento de empresa, o que muda o plano
-- de execução da consulta mais quente do módulo. Fica registrado como
-- limitação conhecida, não como correção deste arquivo.

-- ═══════════════════════════════════════════════════════════════
-- 7. internal_event_notifications — policies sem papel declarado
--
-- As duas policies da v8.39.0 foram criadas sem `TO authenticated`, ou seja,
-- valem para PUBLIC — o que inclui o papel `anon`. Na prática `auth.uid()` é
-- NULL para anônimo e a comparação não casa, então não há vazamento hoje;
-- mas é a única exceção ao padrão do módulo, e policy que "não vaza por
-- acidente do NULL" é a que vaza quando alguém acrescenta um OR depois.
-- Recriadas com o papel explícito, como o resto do módulo faz.
--
-- Continua NÃO havendo policy de INSERT/UPDATE/DELETE de propósito: a
-- escrita é exclusiva do service_role, na Edge Function
-- `notify-upcoming-events`.
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "user reads own event notifications"
  ON public.internal_event_notifications;
CREATE POLICY "user reads own event notifications"
  ON public.internal_event_notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "admin reads tenant event notifications"
  ON public.internal_event_notifications;
CREATE POLICY "admin reads tenant event notifications"
  ON public.internal_event_notifications FOR SELECT
  TO authenticated
  USING (public.is_admin() AND tenant_id = public.get_user_tenant_id());

-- ═══════════════════════════════════════════════════════════════
-- 8. internal_events_delete — desfazer uma criação parcial
--
-- Isto NÃO é permissão nova por conveniência: é o que torna possível desfazer
-- uma criação que passou pela metade.
--
-- `createEvent` (src/hooks/useInternalEvents.ts) escreve em DUAS tabelas em
-- sequência — primeiro o evento, depois os alvos — e não há transação do lado
-- do client. Se o INSERT do evento passa e a gravação dos alvos falha, sobra
-- um evento sem público: invisível para todo mundo que não é admin nem o
-- criador, e impossível de alcançar pela tela. O hook passou a compensar
-- apagando o evento recém-criado. Só que a policy antiga exigia `is_admin()`,
-- então para um MANAGER a compensação falhava calada e o órfão ficava no
-- banco de qualquer forma (o hook devolve o id na mensagem de erro para
-- limpeza manual — remendo, não solução).
--
-- Regra nova: admin OU o próprio criador. É o mínimo que a compensação
-- precisa, e não abre a exclusão para terceiros — ninguém apaga evento
-- alheio.
--
-- `manager` foi AVALIADO e deliberadamente NÃO incluído. Manager já edita e
-- publica evento alheio (internal_events_update), mas apagar é destrutivo e
-- irreversível: o ON DELETE CASCADE leva junto os alvos, as inscrições com as
-- respostas da ficha e a trilha de idempotência das notificações. Além disso
-- `EventDetail.tsx` restringe o botão de excluir a admin, e uma policy mais
-- permissiva que a UI é dívida esperando alguém encontrar pela API. Quando
-- houver necessidade real, a linha a acrescentar é
-- `OR public.has_role(auth.uid(), 'manager'::app_role)` — e a UI precisa
-- mudar junto.
--
-- ⚠️ A compensação no client reduz o dano, mas não fecha a janela: entre o
--    INSERT do evento e o DELETE de compensação o evento existe. A solução
--    definitiva é uma RPC SECURITY DEFINER transacional que grave evento +
--    alvos numa transação só (registrada como pendência no ROADMAP v8.44.1).
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS internal_events_delete ON public.internal_events;
CREATE POLICY internal_events_delete
  ON public.internal_events FOR DELETE
  TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id()
    AND (
      public.is_admin()
      OR created_by = auth.uid()
    )
  );

-- ══════════════════════════════════════════════════════════════
-- 9. RECOMENDAÇÃO NÃO APLICADA — alcance de `manager` nas inscrições
--
-- `internal_event_registrations_select` deixa qualquer manager do tenant ler
-- as inscrições de TODOS os eventos, inclusive os que não criou. A coluna
-- `answers` é jsonb de conteúdo livre, definido pelo organizador na ficha:
-- restrição alimentar, condição de saúde, acompanhante, tamanho de camiseta.
-- É dado pessoal sensível de colega, entregue a um papel que não organizou
-- aquele evento.
--
-- A policy NÃO foi alterada aqui porque restringir pode quebrar fluxo
-- legítimo e o custo do erro é alto: hoje o RH costuma ser `manager`, e é
-- exatamente quem precisa consolidar a lista de um evento organizado por
-- outra pessoa. Sem confirmar isso com o dono do produto, apertar a policy
-- trocaria um risco de privacidade por um bloqueio operacional.
--
-- Quando houver decisão, o aperto sugerido é limitar manager ao evento que
-- ele criou (mesma forma do organizador), mantendo admin com visão total:
--
--   DROP POLICY IF EXISTS internal_event_registrations_select
--     ON public.internal_event_registrations;
--   CREATE POLICY internal_event_registrations_select
--     ON public.internal_event_registrations FOR SELECT
--     TO authenticated
--     USING (
--       tenant_id = public.get_user_tenant_id()
--       AND (
--         public.is_admin()
--         OR public.get_internal_event_created_by(event_id) = auth.uid()
--         OR EXISTS (
--           SELECT 1 FROM public.employees e
--           WHERE e.id = internal_event_registrations.employee_id
--             AND e.user_id = auth.uid()
--         )
--       )
--     );
--
-- Registrado como tarefa pendente no docs/ROADMAP.md (v8.44.1).
-- ══════════════════════════════════════════════════════════════
