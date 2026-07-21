# Changelog — Empire Manager

## 2026-04-22 — Feat: controle de visibilidade de reuniões + marcar participantes

**O que mudou:**
- Nova migration `20260422110000_meetings_project_member_visibility.sql` atualiza a RLS `meetings_select`: além do criador e participantes listados, membros do projeto vinculado à reunião agora também podem visualizá-la. Admin continua vendo todas.
- `MeetingAttendeesManager` agora busca todos os colaboradores ativos do tenant via `useEmployees()` (antes era limitado a membros de projetos visíveis ao usuário).
- Ao criar uma reunião, o sistema navega automaticamente para a aba "Participantes" da reunião criada, facilitando a marcação de pessoas imediatamente após a criação.
- A aba de detalhes da reunião passa a ser controlada por estado (`activeTab`), permitindo navegação programática entre tabs.

**Por quê:** Reuniões vinculadas a projetos devem ser visíveis para todos os membros do projeto, não apenas para o criador. O fluxo de adicionar participantes estava fragmentado (criar reunião → voltar → abrir → procurar aba).

**Impacto:** Requer `supabase db push` para aplicar a nova política de RLS. Usuários que são membros de projetos passam a ver automaticamente as reuniões vinculadas ao projeto.

**Arquivos alterados:**
- `supabase/migrations/20260422110000_meetings_project_member_visibility.sql` (nova)
- `src/components/meetings/MeetingAttendeesManager.tsx`
- `src/pages/Reunioes.tsx`

---

## 2026-04-20 — Security: correção de views com security_definer

**O que mudou:** Migration `20260420100000_fix_hierarchy_views_security_invoker.sql` aplica `security_invoker = true` nas views `employees_hierarchy_view`, `processes_hierarchy_view` e `projects_hierarchy_view`, que estavam com o comportamento padrão `security_definer` (bypassavam RLS quando acessadas diretamente via API REST).

**Por quê:** Supabase sinalizou as 3 views como risco de segurança. Views `security_definer` rodam com permissões do owner (postgres), ignorando RLS nas tabelas subjacentes para acesso direto via PostgREST.

**Impacto:** Acesso direto às views via API REST agora respeita RLS. Chamadas dentro de funções SECURITY DEFINER (ex: `user_process_matches_position_or_area`) não são afetadas. **Requer `supabase db push` para aplicar.**

**Arquivos alterados:** `supabase/migrations/20260420100000_fix_hierarchy_views_security_invoker.sql`

---

## 2026-04-20 — Feat: anexos no modal de criação de tarefa

**O que mudou:** O modal "Nova Tarefa" agora exibe uma seção "Anexos" onde o usuário pode selecionar um ou mais arquivos antes de criar a tarefa. Ao salvar, a tarefa é criada, os arquivos são enviados ao Supabase Storage (`task-attachments/{id}/`) e a tarefa é atualizada com os anexos. A primeira imagem é definida automaticamente como capa.

**Por quê:** Antes era necessário criar a tarefa primeiro e depois abrir o modal de detalhe para adicionar anexos — fluxo desnecessariamente fragmentado.

**Impacto:** Somente o modal de criação (não o de edição). Nenhuma mudança no schema do banco.

**Arquivos alterados:** `src/components/shared/KanbanBoard.tsx`

## 2026-04-16 — Fix: fallback da visibilidade de processos via organograma

**O que mudou:** O helper `user_process_matches_position_or_area()` agora também resolve posição, área e subárea do usuário a partir de `organograma_view`.

**Por quê:** Alguns usuários podem estar corretamente refletidos no organograma, mas não no caminho principal usado pela policy. Esse fallback alinha o RLS com a mesma fonte de dados consolidada que a UI usa para exibir a estrutura organizacional.

**Impacto:** Members cuja posição primária só esteja consistente via organograma passam a herdar corretamente a visibilidade de processos por cargo, área ou subárea.

**Arquivos alterados:**
- `supabase/migrations/20260416000005_fix_process_visibility_organograma_fallback.sql` (novo)

---

## 2026-04-16 — Fix: visibilidade de processos resolve posição atual pelo organograma

**O que mudou:** O helper `user_process_matches_position_or_area()` passou a resolver a posição/área/subárea do usuário também via `employees_hierarchy_view`, além de `employee_positions`.

**Por quê:** No caso real da usuária `Juliana Teste`, a visibilidade de processos ainda falhava mesmo com o processo vinculado à área correta. O ajuste reforça o caminho de resolução para usar a mesma fonte consolidada que abastece o organograma e as telas de colaboradores.

**Impacto:** Members com posição primária já refletida no organograma passam a herdar corretamente a visibilidade de processos por cargo, área ou subárea.

**Arquivos alterados:**
- `supabase/migrations/20260416000004_fix_process_visibility_current_position_resolution.sql` (novo)

---

## 2026-04-16 — Fix: member vê processo por área ou subárea vinculada

**O que mudou:** A regra de leitura de processos foi reforçada para considerar explicitamente `subarea_id`, além de `position_id` e `area_id`. Com isso, um usuário `member` consegue visualizar processos quando sua área ou sua subárea estiver vinculada ao processo.

**Por quê:** O comportamento desejado é que a classificação do processo por área/subárea reflita diretamente na visibilidade do member. A implementação anterior fazia a comparação principalmente por cargo e área; agora a subárea também entra como critério explícito.

**Impacto:** Sem impacto em admin ou manager. Para `member`, processos vinculados à sua subárea passam a ficar visíveis mesmo quando a intenção de segmentação é mais específica que a área inteira.

**Arquivos alterados:**
- `supabase/migrations/20260416000003_member_process_visibility_by_area_or_subarea.sql` (novo)
- `src/pages/Processos.tsx`
- `docs/ARQUITETURA.md`
- `docs/ROADMAP.md`

---

## 2026-04-16 — Fix: member vê projeto quando é membro direto do projeto

**O que mudou:** A policy `projects_select` foi ajustada para que usuários `member` vejam projetos em que foram adicionados diretamente na tabela `employee_projects`, além dos projetos em que já possuem tarefa atribuída.

**Por quê:** O caso de uso validado em teste é "member foi adicionado como membro do projeto". O ajuste anterior cobria apenas tarefa atribuída; faltava incluir o vínculo direto de membership do projeto.

**Impacto:** Sem impacto em admin ou manager. Para `member`, a lista de projetos passa a incluir projetos em que ele foi adicionado como membro direto mesmo sem tarefa atribuída.

**Arquivos alterados:**
- `supabase/migrations/20260416000002_member_project_visibility_direct_membership.sql` (novo)
- `docs/ARQUITETURA.md`
- `docs/ROADMAP.md`

---

## 2026-04-16 — Fix: member vê projeto quando é multi-assignee da tarefa

**O que mudou:** A visibilidade de projetos para `member` foi alinhada para considerar os dois caminhos de atribuição de tarefa: `tasks.assignee_id` e `task_assignees`. Assim, o membro continua vendo projetos onde a tarefa está atribuída a ele no campo legado e passa a vê-los também quando foi adicionado como responsável extra na tarefa.

**Por quê:** A regra funcional desejada é "member vê projeto se tem tarefa dele no projeto". No modelo atual, essa atribuição pode existir tanto no `assignee_id` quanto na tabela `task_assignees`, então o helper de projeto precisa cobrir ambos para evitar comportamento parcial.

**Impacto:** Sem impacto em admin ou manager. Para `member`, a visibilidade de projetos passa a incluir tarefas em que ele foi adicionado via multi-assignee.

**Arquivos alterados:**
- `supabase/migrations/20260416000001_member_project_visibility_multi_assignee.sql` (novo)
- `docs/ARQUITETURA.md`
- `docs/ROADMAP.md`

---

## 2026-04-14 — Auditoria de segurança + correções de bugs

**O que mudou:**
- CORS de todas as 9 Edge Functions corrigido para incluir `gt3.omnx.pro` na whitelist; removido wildcard `*` de `api`, `create-tenant` e `dispatch-webhook`
- `vercel.json`: `microphone=()` → `microphone=(self)` para permitir gravação de reuniões
- `useEmployees.ts`: 8 invalidações de queryKey corrigidas de `["employees"]` para `["employees", tenantId]`
- `useMeetings.ts`: invalidações de `useApproveItems` corrigidas com `tenantId` em meetings, projects e tasks
- `TaskDetailModal.tsx`: optional chaining em `profile?.full_name` (linha 264)
- `ErrorBoundary.tsx`: auto-reload com cooldown de 10s para chunk load errors após deploy
- `KanbanBoard.tsx` + `TaskDetailModal.tsx`: guard `isValid()` para datas inválidas em `format()`
- Favicon trocado para `logotipo05.png`; nome do tenant atualizado para "OMNX GT3" no banco
- `npm audit fix` executado: vulnerabilidade HIGH do lodash corrigida

**Por quê:** Novo domínio `gt3.omnx.pro` causou falhas de CORS em todas as Edge Functions; Permissions-Policy bloqueava microfone; invalidações amplas de cache podiam causar refetch desnecessário entre tenants; datas malformadas quebravam o Kanban com `RangeError`

**Impacto:** Gravação de reuniões restaurada; página de Tarefas estável; cache de queries mais preciso por tenant

**Arquivos alterados:**
- `supabase/functions/*/index.ts` (9 funções)
- `vercel.json`
- `src/hooks/useEmployees.ts`
- `src/hooks/useMeetings.ts`
- `src/components/shared/TaskDetailModal.tsx`
- `src/components/shared/ErrorBoundary.tsx`
- `src/components/shared/KanbanBoard.tsx`
- `src/hooks/useTenantBranding.ts`
- `index.html`
- `public/logotipo05.png`
- `supabase/migrations/20260414100000_update_tenant_name_and_favicon.sql`

---

## 2026-04-14 — Fix: visibilidade do feed por sub área

**O que mudou:** Corrigida a política RLS `feed_posts_select` que impedia membros de sub áreas específicas de visualizar posts direcionados a elas.
**Por quê:** Três bugs na política anterior: (1) `has_role('manager')` global deixava todos os managers verem tudo, violando a regra de visibilidade por área/subárea; (2) colaboradores com posição apenas em `employees.position_id` (coluna legada) não eram encontrados; (3) diretores com `positions.area_id` direto não eram cobertos na checagem de área.
**Impacto:** Posts com `visibility_type = 'specific'` agora filtram corretamente por subárea, área, cargo e membro. Admin sempre vê tudo. Manager e member veem apenas posts onde sua posição pertence ao target selecionado.
**Arquivos alterados:** `supabase/migrations/20260414060000_fix_feed_visibility_subarea.sql`

---

## 2026-04-14 — Feed social, rename para OMNX GT3, otimização de processos e fixes

### 1. Feed social
- Nova página `/feed` com posts de qualquer colaborador (estilo Facebook/LinkedIn)
- Qualquer colaborador pode postar, reagir (❤️) e comentar
- Admin/manager podem deletar qualquer post ou comentário
- Novas tabelas: `feed_posts`, `feed_reactions`, `feed_comments` com RLS
- Item "Feed" adicionado na sidebar, acima de Comunicados
- Hooks em `src/hooks/useFeed.ts`
- Migration: `supabase/migrations/20260414040000_feed_posts.sql`

### 2. Rename para OMNX GT3
- `index.html`: título e meta tags `<title>` e `og:title` atualizados para "OMNX GT3"
- `AppSidebar.tsx`: fallback de nome quando tenant.name não existe trocado para "OMNX GT3"

### 3. Otimização de carregamento de Processos
- `useProcesses()` em `ProcessoDetalhes` agora usa `{ queryEnabled: false }` — não dispara mais a query cara de lista inteira só para obter as mutations
- `useProcesses()` no hook aceita novo parâmetro `options.queryEnabled` para controlar se a query dispara
- Aba Responsáveis usa estado `activeTab` controlado — preparado para lazy loading futuro

### 4. Recorrência mais visível no modal de tarefa
- Seção "Recorrência" no painel lateral da tarefa ganhou caixa com fundo, ícone Repeat colorido e label em destaque
- Ícone `Repeat` adicionado ao import de lucide-react no `TaskDetailModal`

### 5. Fix: link de notificação de menção abre a tarefa correta
- Notificações de menção (@usuario) agora usam `link: /tarefas?taskId={id}` em vez de `/tarefas`
- `KanbanBoard` lê o param `?taskId` ao montar e abre o `TaskDetailModal` automaticamente, limpando o param da URL

### 6. Dialog de membros em ProjetoDetalhes (da sessão anterior)
- Substituído o Popover limitado (sem busca, max 10, sem área/subárea) por Dialog completo
- Busca por nome, Adicionar por Área, Adicionar por Subárea, Adicionar por Cargo
- Lista de membros atuais com botão de remoção

**Arquivos alterados:**
- `src/pages/Feed.tsx` (novo)
- `src/hooks/useFeed.ts` (novo)
- `supabase/migrations/20260414040000_feed_posts.sql` (novo)
- `src/App.tsx`
- `src/components/layout/AppSidebar.tsx`
- `index.html`
- `src/hooks/useProcesses.ts`
- `src/pages/ProcessoDetalhes.tsx`
- `src/components/shared/TaskDetailModal.tsx`
- `src/components/shared/KanbanBoard.tsx`
- `src/pages/ProjetoDetalhes.tsx`

---

## 2026-04-14 — Fix: Feed não carregava ("Erro ao carregar o feed")

**O que mudou:** `useFeedPosts` e `useFeedComments` reescritos para não usar join direto com `employees`.

**Por quê:** A tabela `employees` não possui colunas `full_name` nem `avatar_url` — esses dados estão na view `employees_hierarchy_view` (via `profiles`). O join `employee:employees(id, full_name, avatar_url)` retornava erro do PostgREST, travando toda a query e exibindo "Erro ao carregar o feed."

**Impacto:** Feed volta a funcionar — posts carregam e publicação funciona normalmente.

**Arquivos alterados:**
- `src/hooks/useFeed.ts`

---

## 2026-04-14 — Fix: visibilidade estrita de member por tarefas atribuídas

**O que mudou:** Políticas RLS de `tasks` e `projects` reescritas para member. Member agora vê **somente** tarefas onde é responsável (`assignee_id` ou `task_assignees`) e **somente** projetos onde tem pelo menos uma tarefa atribuída.

**Por quê:** A política anterior usava `user_can_read_project()` sem verificação de role no branch de tarefas — member que estava em um projeto (por subárea, membro direto ou criador) via **todas** as tarefas desse projeto, não apenas as suas.

**Impacto:** Sem impacto em admin ou manager. Membros perdem acesso a tarefas/projetos que não são deles.

**Arquivos alterados:**
- `supabase/migrations/20260414030000_member_strict_task_visibility.sql` (novo)

---

## 2026-04-14 — Fix: CORS nas Edge Functions de reunião e carregamento de processo

**O que mudou:**
1. `soniox-temp-key`, `meeting-ai` e `meeting-approve`: substituído `Access-Control-Allow-Origin` hardcoded por lógica dinâmica que aceita múltiplos origins (produção, staging, localhost). Corrige o erro "Failed to send a request to the Edge Function" quando acessado de origins não-listados (ex: preview URLs da Vercel ou localhost).
2. `ProcessoDetalhes.tsx`: corrigida guarda de carregamento — substituída verificação `isLoading || isFetching` por `isPending`. A versão anterior não cobria o estado em que `enabled: false` (auth ainda carregando), causando flash de "Processo não encontrado".

**Por quê:** O estado `isLoading` no TanStack Query v5 é `false` quando a query está desabilitada (`enabled: false`) — o que ocorre enquanto o `profile` do usuário ainda não carregou. Usar `isPending` (= sem dados ainda) cobre esse estado corretamente.

**Impacto:** As Edge Functions precisam ser redeploy no Supabase após essa mudança.

**Arquivos alterados:**
- `src/pages/ProcessoDetalhes.tsx`
- `supabase/functions/soniox-temp-key/index.ts`
- `supabase/functions/meeting-ai/index.ts`
- `supabase/functions/meeting-approve/index.ts`

---

## 2026-04-14 — Menções @usuario em comentários de tarefas

**O que mudou:** Ao escrever `@` no campo de comentário de uma tarefa, aparece um autocomplete com colaboradores. Ao selecionar, insere `@[Nome](id)`. O nome fica em destaque azul no comentário salvo. Colaboradores mencionados recebem uma notificação automática.

**Por quê:** Facilitar comunicação assíncrona e direcionar atenção de colaboradores específicos em tarefas.

**Impacto:** Sem migration necessária — usa a tabela `notifications` existente. A notificação aparece no sino do AppLayout em tempo real via Supabase Realtime.

**Arquivos alterados:**
- `src/components/shared/TaskDetailModal.tsx`

---

## 2026-04-14 — Recorrência com dias úteis e dias específicos

**O que mudou:** Novas opções de frequência para tarefas recorrentes: "Dias úteis (seg–sex)" e "Dias específicos" (checkboxes de dias da semana configuráveis).

**Por quê:** O sistema anterior só suportava intervalos fixos (diário, semanal, etc.). Usuários precisavam pular fins de semana ou escolher apenas determinados dias da semana (ex: toda segunda e quarta).

**Impacto:** Requer aplicar a migration `20260414020000` no Supabase. Após o deploy, tarefas existentes não são afetadas — apenas novas configurações de recorrência podem usar os novos tipos.

**Arquivos alterados:**
- `src/components/shared/RecurrenceConfig.tsx`
- `supabase/migrations/20260414020000_task_recurrence_weekdays_specific_days.sql` (novo)

---

## 2026-04-14 — Feed social, fixes de processo/reunião, membros por cargo e importar transcrição

**O que mudou:**

### 1. Feed de Comunicados (estilo Circle/Facebook)
- Adicionado sistema de **comentários** em comunicados: qualquer colaborador pode comentar; admin/manager podem excluir qualquer comentário
- Adicionado sistema de **reações** (❤️ like): toggle por colaborador, contagem exibida no card
- `AnnouncementCard` atualizado com: área de reações, toggle de comentários, input inline para novo comentário
- Criados hooks `useAnnouncementComments`, `useAnnouncementReactions`, `useAddComment`, `useDeleteComment`, `useToggleReaction` em `src/hooks/useAnnouncementInteractions.ts`
- Migration `20260414010000_announcement_comments_reactions.sql`: tabelas `announcement_comments` e `announcement_reactions` com RLS completo

### 2. [Bug Fix] Processos — flash de erro ao abrir
- Corrigida ordem de verificação em `ProcessoDetalhes.tsx`: `isFetching` agora inclui retries do ReactQuery, evitando flash da tela de erro antes do processo carregar

### 3. [Bug Fix / Recovery] Reuniões travadas em processamento
- Adicionado banner de status para reuniões em estado `"processing"` com botões:
  - **Reprocessar IA**: re-envia a transcrição existente para o meeting-ai
  - **Resetar**: volta o status para `"scheduled"` para o usuário gravar novamente
- Importados hooks `useProcessTranscript` e `useCreateMeetingWithTranscript`

### 4. [Feature] Importar transcrição de reunião externa
- Botão **"Importar Transcrição"** adicionado no cabeçalho da página de Reuniões
- Dialog com campo de título e textarea para colar a transcrição
- Usa o hook `useCreateMeetingWithTranscript` já existente → cria a reunião e dispara o meeting-ai automaticamente

### 5. [Feature] Adicionar membros em projetos por cargo
- Dialog de membros em `Projetos.tsx` atualizado com seção **"Adicionar por Cargo"**
- Select de cargos gerado a partir dos colaboradores ativos; botão adiciona todos de uma vez
- Contador de "N colaboradores a adicionar" em tempo real

### 6. [Feature] Aba "Responsáveis" em Processos
- Nova aba **"Responsáveis"** em `ProcessoDetalhes.tsx`
- Lista cargos vinculados ao processo com opção de desvincular
- Select para vincular novos cargos (usa `linkPosition` / `unlinkPosition` existentes)

**Por quê:** Melhorar a experiência de equipe com feed social, corrigir bugs de UX críticos e facilitar o gerenciamento de acesso por cargo.

**Impacto:** Requer deploy da migration `20260414010000` no Supabase antes de usar comentários e reações.

**Arquivos alterados:**
- `src/pages/Comunicados.tsx`
- `src/pages/ProcessoDetalhes.tsx`
- `src/pages/Projetos.tsx`
- `src/pages/Reunioes.tsx`
- `src/hooks/useAnnouncementInteractions.ts` (novo)
- `supabase/migrations/20260414010000_announcement_comments_reactions.sql` (novo)

---


## 2026-04-13 — Fix visibilidade de projetos para admin

**O que mudou:** Corrigido bug crítico onde admin não conseguia ver nenhum projeto.

**Por quê:** A migration `20260413000002` substituiu a política `projects_select` por `user_can_read_project(id)`, que internamente chama `is_admin()`. Essa função consulta a tabela `user_roles` — como o admin não tinha row nessa tabela (ou a função retornava `false`), o RLS bloqueava todos os projetos. O código client-side também foi simplificado: toda lógica de visibilidade por role foi removida do hook, que agora depende exclusivamente do RLS.

**Impacto:** Todos os usuários autenticados do tenant voltam a ver todos os projetos (comportamento original). A restrição de visibilidade por área/posição para members foi temporariamente removida e pode ser reimplementada corretamente no futuro.

**Arquivos alterados:**
- `src/hooks/useProjects.ts` — removida lógica client-side de role/área; hook simplificado para depender do RLS
- `supabase/migrations/20260413000003_fix_projects_select_rls.sql` — política `projects_select` revertida para `tenant_id = get_user_tenant_id()`
- SQL aplicado diretamente no dashboard Supabase (migration history estava divergente)
