# Arquitetura - GT3

## Visão Geral

O GT3 é uma plataforma de gestão organizacional que oferece visualização interativa do organograma empresarial, integrando informações de pessoas, cargos, projetos e processos.

---

## Stack Tecnológica

### Frontend
- **Framework**: React 18 + TypeScript
- **Build**: Vite
- **Roteamento**: React Router v6
- **Estado**: TanStack Query (React Query) + React Context
- **UI Components**: Radix UI + shadcn/ui
- **Estilização**: Tailwind CSS
- **Diagramas**: React Flow
- **Ícones**: Lucide React

### Backend
- **BaaS**: Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- **Autenticação**: Supabase Auth (Email/Senha + Magic Link + OTP)
- **API**: Edge Functions (Deno)
- **Realtime**: Supabase Realtime (WebSockets)

---

## Estrutura de Diretórios

```
src/
├── components/
│   ├── shared/           # Componentes compartilhados (KanbanBoard, HierarchyFilter, AudioPlayer, etc.)
│   ├── auth/             # FeatureRoute (guard de rota por feature de integração)
│   ├── settings/         # IntegrationsCard (aba "Integrações" em Configurações)
│   ├── meetings/         # Componentes de reuniões
│   ├── notifications/    # NotificationsPopover
│   ├── processes/        # ProcessAttachments, ProcessDocEditor, ProcessDocTree, ProcessDocUpload, ProcessDocShareDialog, ProcessFolderTree, ProcessTagFilter
│   │                     # Fluxograma: flow-core, BpmNodes, ProcessFlow, DiagramEditor, DiagramViewer, AIEditorDiagram, ExportDialog
│   ├── tasks/            # RecurrenceConfig
│   └── ui/               # Componentes shadcn/ui
├── hooks/                # Custom hooks (useNotifications, useTaskRecurrence, etc.)
├── pages/                # Páginas da aplicação
├── integrations/         # Integrações (Supabase)
└── lib/                  # Utilitários (date-utils.ts, export-csv.ts, slash-command-extension.ts, etc.)
```

---

## Schema do Banco de Dados

> **Fonte de verdade do schema:** `scripts/setup-database-complete.sql` (dump pg_dump oficial, 112 tabelas).  
> As 134 migrations legadas em `supabase/migrations/archive/` estão desatualizadas — não use para replicar o banco. Veja `docs/MIGRATIONS.md` para detalhes.

### Tabelas Principais

#### `positions` (Cargos)
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants |
| title | TEXT | Título do cargo |
| level | INTEGER | Nível hierárquico (0 = CEO) |
| reports_to_id | UUID | FK → positions (cargo superior) |
| subarea_id | UUID | FK → subareas |
| area_id | UUID | FK → company_areas (diretores) |
| description | TEXT | Job description |
| responsibilities | TEXT[] | Lista de responsabilidades |
| goals | TEXT[] | Lista de metas |

#### `employees` (Colaboradores)
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants |
| user_id | UUID | FK → auth.users |
| manager_id | UUID | FK → employees (deprecated) |
| status | TEXT | active, inactive, on_leave |
| is_ceo | BOOLEAN | Flag de CEO |

#### `process_folders` (Pastas de processos)
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants |
| name | TEXT | Nome da pasta |
| parent_id | UUID | FK → process_folders (sub-pasta) |
| sort_order | INTEGER | Ordem de exibição |
| created_by | UUID | FK → profiles |
| created_at | TIMESTAMPTZ | Data de criação |

#### `process_tags` (Tags de processos)
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID | PK |
| tenant_id | UUID | FK → tenants |
| name | TEXT | Nome da tag |
| color | TEXT | Cor hex (default #6366f1) |
| created_by | UUID | FK → profiles |
| created_at | TIMESTAMPTZ | Data de criação |

#### `process_tag_assignments` (Vínculo processo ↔ tag)
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID | PK |
| process_id | UUID | FK → processes |
| tag_id | UUID | FK → process_tags |
| created_at | TIMESTAMPTZ | Data de criação |
| — | UNIQUE | (process_id, tag_id) |

#### `process_doc_folders` (Pastas de anexos de processos)
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID | PK |
| process_id | UUID | FK → processes ON DELETE CASCADE |
| parent_id | UUID | FK → process_doc_folders (sub-pasta) |
| name | TEXT | Nome da pasta |
| sort_order | INTEGER | Ordem de exibição |
| is_public | BOOLEAN | Acesso público habilitado |
| public_token | TEXT | Token para URL pública |
| tenant_id | UUID | FK → tenants |
| created_by | UUID | FK → profiles |
| created_at | TIMESTAMPTZ | Data de criação |
| updated_at | TIMESTAMPTZ | Última atualização |

**RLS:**
- `pf_proc_select`: leitura por tenant autenticado
- `pf_proc_write`: escrita por admin ou manager
- `pf_proc_public`: leitura anon via `is_public + public_token`

#### `process_documents` (Documentos/arquivos de processos)
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID | PK |
| process_id | UUID | FK → processes ON DELETE CASCADE |
| folder_id | UUID | FK → process_doc_folders (nullable) |
| title | TEXT | Título do documento |
| content | TEXT | Conteúdo markdown (nullable) |
| type | TEXT | `document` ou `file` |
| file_path | TEXT | URL pública do arquivo no Storage |
| file_size | BIGINT | Tamanho em bytes |
| file_type | TEXT | MIME type |
| sort_order | INTEGER | Ordem de exibição |
| is_public | BOOLEAN | Acesso público habilitado |
| public_token | TEXT | Token para URL pública |
| tenant_id | UUID | FK → tenants |
| created_by | UUID | FK → profiles |
| created_at | TIMESTAMPTZ | Data de criação |
| updated_at | TIMESTAMPTZ | Última atualização |

**RLS:**
- `pd_proc_select`: leitura por tenant autenticado
- `pd_proc_write`: escrita por admin ou manager
- `pd_proc_public`: leitura anon via `is_public + public_token`

**Storage:** Bucket `process-documents`, path `/{tenantId}/processes/{processId}/{uuid}-{filename}`

#### `task_assignees` (Múltiplos responsáveis por tarefa)
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID | PK |
| task_id | UUID | FK → tasks ON DELETE CASCADE |
| employee_id | UUID | FK → employees ON DELETE CASCADE |
| tenant_id | UUID | FK → tenants |
| assigned_at | TIMESTAMPTZ | Data de atribuição |
| — | UNIQUE | (task_id, employee_id) |

**RLS:**
- `task_assignees_select`: leitura por tenant autenticado
- `task_assignees_insert`: escrita por admin, manager ou criador do projeto
- `task_assignees_delete`: exclusão por admin, manager ou criador do projeto

#### `task_recurrence` (Tarefas recorrentes)
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID | PK |
| task_id | UUID | FK → tasks ON DELETE CASCADE |
| frequency | TEXT | daily, weekly, biweekly, monthly, custom |
| interval | INTEGER | Intervalo entre recorrências |
| days_of_week | INTEGER[] | Dias da semana (0=dom, 6=sáb) |
| day_of_month | INTEGER | Dia do mês (1-31) |
| next_due | DATE | Próxima data de vencimento |
| last_generated | TIMESTAMPTZ | Última vez que gerou tarefa |
| is_active | BOOLEAN | Recorrência ativa |
| tenant_id | UUID | FK → tenants |
| created_at | TIMESTAMPTZ | Data de criação |

**RLS:**
- `task_recurrence_select`: leitura por tenant autenticado
- `task_recurrence_write`: escrita por admin, manager ou assignee da tarefa

#### `notifications` (Notificações)
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID | PK |
| user_id | UUID | FK → auth.users |
| tenant_id | UUID | FK → tenants |
| type | TEXT | task_assigned, task_due, task_overdue, mention, etc. |
| title | TEXT | Título da notificação |
| body | TEXT | Corpo/descrição |
| metadata | JSONB | Dados extras (task_id, project_id, etc.) |
| read | BOOLEAN | Lida (default false) |
| created_at | TIMESTAMPTZ | Data de criação |

**RLS:**
- `notifications_select`: leitura apenas pelo próprio `user_id`
- `notifications_update`: atualização apenas pelo próprio `user_id` (marcar como lida)
- `notifications_insert`: inserção por qualquer usuário autenticado do tenant

#### `tenant_features` (Override manual de features por integração — v8.28.0)
Guarda **apenas** o override manual de cada feature dependente de integração externa. **Nenhuma chave de API vive no banco** — a presença da chave é lida em runtime pela Edge Function `integrations-status` a partir dos secrets do ambiente.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID | PK (default `gen_random_uuid()`) |
| tenant_id | UUID | FK → tenants ON DELETE CASCADE |
| feature_key | TEXT | `meetings` \| `ai` \| `recording` \| `email` \| `push` |
| manually_disabled | BOOLEAN | Default `false` — quando `true`, oculta a feature mesmo com a chave presente |
| updated_by | UUID | FK → auth.users ON DELETE SET NULL |
| updated_at | TIMESTAMPTZ | Última atualização |
| created_at | TIMESTAMPTZ | Data de criação |
| — | UNIQUE | (tenant_id, feature_key) |
| — | INDEX | (tenant_id) |

```sql
CREATE TABLE public.tenant_features (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  feature_key        text NOT NULL,
  manually_disabled  boolean NOT NULL DEFAULT false,
  updated_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, feature_key)
);
CREATE INDEX tenant_features_tenant_id_idx ON public.tenant_features (tenant_id);

ALTER TABLE public.tenant_features ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer membro do tenant (dirige o gate de visibilidade)
CREATE POLICY tenant_features_select ON public.tenant_features
  FOR SELECT USING (tenant_id = public.get_user_tenant_id());

-- INSERT/UPDATE/DELETE: apenas admin do tenant
CREATE POLICY tenant_features_insert ON public.tenant_features
  FOR INSERT WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.is_admin());
CREATE POLICY tenant_features_update ON public.tenant_features
  FOR UPDATE USING (tenant_id = public.get_user_tenant_id() AND public.is_admin())
  WITH CHECK (tenant_id = public.get_user_tenant_id() AND public.is_admin());
CREATE POLICY tenant_features_delete ON public.tenant_features
  FOR DELETE USING (tenant_id = public.get_user_tenant_id() AND public.is_admin());
```

**Migration:** `20260713140000_tenant_features.sql`.

#### `ghl_webhook_sources` (Fontes de webhook GHL)
| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | UUID | PK |
| tenant_id | UUID | FK -> tenants |
| name | TEXT | Nome da fonte configurada |
| token_hash | TEXT | SHA-256 do token usado pelo endpoint publico |
| location_id | TEXT | Location ID do GoHighLevel, quando conhecido |
| is_active | BOOLEAN | Habilita ou desabilita recebimento |
| last_received_at | TIMESTAMPTZ | Ultimo webhook recebido |
| created_by | UUID | Usuario que criou a fonte |
| created_at / updated_at | TIMESTAMPTZ | Auditoria basica |

**RLS:**
- `ghl_webhook_sources_select`: leitura por admin ou manager do tenant
- `ghl_webhook_sources_insert/update/delete`: escrita apenas por admin do tenant

#### `ghl_webhook_events` (Eventos brutos GHL)
| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | UUID | PK |
| tenant_id | UUID | FK -> tenants |
| source_id | UUID | FK -> ghl_webhook_sources |
| event_type | TEXT | Tipo de evento inferido do payload |
| ghl_location_id | TEXT | Location ID inferido do payload |
| ghl_contact_id | TEXT | Contact ID inferido do payload |
| ghl_opportunity_id | TEXT | Opportunity ID inferido do payload |
| ghl_conversation_id | TEXT | Conversation ID inferido do payload |
| ghl_workflow_id | TEXT | Workflow ID inferido do payload |
| request_method | TEXT | Metodo HTTP recebido |
| request_url | TEXT | URL sem token |
| headers | JSONB | Headers sanitizados |
| query_params | JSONB | Query params sem token |
| payload | JSONB | Payload parseado; se nao for JSON, armazena `{ raw_body }` |
| raw_body | TEXT | Corpo bruto completo recebido do GHL |
| received_at | TIMESTAMPTZ | Data de recebimento |
| processed_at | TIMESTAMPTZ | Data de processamento futuro |
| processing_status | TEXT | stored, processing, processed, failed ou ignored |
| processing_error | TEXT | Erro de processamento futuro |

**RLS:**
- `ghl_webhook_events_select`: leitura por admin ou manager do tenant
- `ghl_webhook_events_update`: atualizacao apenas por admin do tenant
- Inserts sao feitos server-side pela Edge Function `ghl-webhook` com `service_role`

#### `employee_positions` (Múltiplos cargos)
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| employee_id | UUID | FK → employees |
| position_id | UUID | FK → positions |
| is_primary | BOOLEAN | Cargo principal |

#### `chat_messages` (Mensagens do chat) — atualizado v8.3.0
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID | PK |
| conversation_id | UUID | FK → chat_conversations |
| employee_id | UUID | Autor (FK → employees) |
| content | TEXT | Texto |
| type | TEXT | text/image/video/audio/file/system |
| attachments | JSONB | Array de anexos |
| reply_to_id | UUID | FK self — quote/reply |
| thread_root_id | UUID | FK self — raiz da thread (Slack-style, v8.2.0) |
| **pinned_at** | TIMESTAMPTZ | **v8.3.0 — quando foi fixada (NULL = não fixada)** |
| **pinned_by** | UUID | **v8.3.0 — employee que fixou** |
| **deleted_for** | UUID[] | **v8.3.0 — lista de user_ids para "apagar para mim"** |
| edited_at, deleted_at | TIMESTAMPTZ | Edição / soft-delete global |

#### `chat_conversations` — atualizado v8.3.0
Acrescentadas colunas `topic TEXT` (curto, exibido no header) e `description TEXT` (longa). Editáveis por admin/manager via `useUpdateChannelMeta` + `ChannelMetaDialog`.

#### `chat_mentions` (Menções no chat — v8.3.0)
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID | PK |
| tenant_id | UUID | Isolamento |
| message_id | UUID | FK → chat_messages |
| conversation_id | UUID | Atalho p/ filtros |
| mentioned_employee_id | UUID | Quem foi mencionado |
| mention_type | TEXT | "user" / "here" / "channel" |
| read_at | TIMESTAMPTZ | NULL = não lida |

RLS por `tenant_id`; o mencionado e o autor da mensagem leem; apenas o autor da mensagem grava (gate via `chat_my_employee_id`). Adicionada à publication `supabase_realtime` para invalidar `useMyUnreadMentionsCount` em tempo real.

#### `chat_presence` (Presença online — v8.2.0)
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| employee_id | UUID | UNIQUE — referência ao colaborador |
| tenant_id | UUID | FK → tenants |
| is_online | BOOLEAN | Heartbeat ativo |
| last_seen_at | TIMESTAMPTZ | Último heartbeat (atualiza a cada 30s via `useChatPresenceHeartbeat`) |
| status_text | TEXT | Status custom (ex.: "Em reunião") |
| status_emoji | TEXT | Emoji do status |
| dnd_until | TIMESTAMPTZ | Não perturbe até… |

RLS: leitura por tenant, escrita apenas pelo próprio employee. Adicionada a `supabase_realtime`.

#### `chat_starred_messages` (Mensagens salvas — v8.2.0)
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID | PK |
| employee_id | UUID | Quem salvou |
| message_id | UUID | FK → chat_messages |
| tenant_id | UUID | Isolamento |

UNIQUE (employee_id, message_id). RLS: cada usuário vê/edita apenas as próprias estrelas.

#### Hooks do chat (v8.3.0)
`useChatMentions` (extract + persist + unread count), `useChatPinned` (lista + togglePin), `useChatGallery` (agrupa attachments por mês), `useChatChannelMeta` (update topic/description/name), `useChatDeleteForMe` (append user_id em `deleted_for` + filtro local).

#### Componentes do chat (v8.3.0)
`MentionAutocomplete`, `MentionRichText`, `PinnedBar`, `MediaGallerySheet`, `ChannelMetaDialog` em `src/components/chat/`. `maybeCompressImage` em `src/lib/image-compression.ts`.

#### `chat_conversation_labels` + `chat_conversation_label_assignments` (Pastas/labels — v8.4.0)
| Tabela | Colunas-chave | Descrição |
|--------|---------------|-----------|
| chat_conversation_labels | id, tenant_id, name (UNIQUE/tenant), color, created_by | Pastas/labels custom por tenant |
| chat_conversation_label_assignments | conversation_id, label_id (UNIQUE) | Junção N:N |

RLS por `tenant_id`. Apenas admin/manager podem criar/editar/excluir labels; qualquer membro do tenant pode atribuir/remover label de uma conversa. Ambas em `supabase_realtime`.

#### `chat_participants` — atualizado v8.4.0
Acrescentadas colunas `archived_at TIMESTAMPTZ`, `muted_until TIMESTAMPTZ`, `pinned_at TIMESTAMPTZ`, `unread_override BOOLEAN DEFAULT false`. Estado por participante (não por conversa) — cada usuário arquiva/silencia/fixa independentemente. Índices parciais em `pinned_at` e `archived_at`.

#### Hooks do chat (v8.4.0)
`useChatLabels` + `useChatLabelAssignments` + `useCreateChatLabel` + `useDeleteChatLabel` + `useToggleLabelOnConversation`; `useChatParticipantState` expõe `useArchiveConversation`, `useMuteConversation` (1h/8h/24h/sempre), `usePinConversation`, `useMarkUnread`; `useChatDraft` persiste rascunho em `localStorage` por `tenant + user + conv`.

#### Componentes do chat (v8.4.0)
`QuickSwitcher` (Cmd/Ctrl+K, fuzzy via `CommandDialog`), `ConversationContextMenu` (pin/mute/archive/unread), `UnreadDivider` ("Novas mensagens").

#### `chat_reminders` (Lembretes — v8.5.0)
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| employee_id | UUID | Dono do lembrete |
| message_id | UUID | FK opcional para `chat_messages` |
| conversation_id | UUID | Para deep-link |
| remind_at | TIMESTAMPTZ | Quando disparar |
| text | TEXT | Texto livre opcional |
| fired_at | TIMESTAMPTZ | NULL até disparo |

RLS: cada usuário vê/edita apenas seus lembretes. Índice parcial em `remind_at WHERE fired_at IS NULL` para job de cron futuro (`chat-reminder-cron`). Em `supabase_realtime`.

#### `chat_polls` + `chat_poll_options` + `chat_poll_votes` (Enquetes — v8.5.0)
Poll vinculada a uma `chat_messages.id` (opcional), com `question`, `multi`, `closes_at`/`closed_at`. Opções armazenadas em `chat_poll_options` (sort_order). Votos em `chat_poll_votes` com UNIQUE `(poll_id, option_id, employee_id)` — single-vote remove votos anteriores antes de inserir; multi-vote faz toggle. RLS: leitura por participantes do canal; criação de poll por participante; opções e exclusão por autor da poll; votar exige `chat_presence_my_employee_id()`. Todas em `supabase_realtime`.

#### `chat_channel_bookmarks` (Links fixos — v8.5.0)
Title, url, icon, sort_order — exibidos abaixo do header do canal. Leitura por participante; criação/edição/exclusão restrita a admin/manager. Em `supabase_realtime`.

#### `chat_conversations.canvas_doc_id` (v8.5.0)
Coluna opcional referenciando `process_documents.id` — habilita o "Canvas/Notas do canal" reutilizando o `ProcessDocEditor` existente.

#### Hooks do chat (v8.5.0)
`useUserStatus` (`useMyPresence`, `useSetUserStatus`, `useSetDND`); `useChatBookmarks` + `useAddBookmark` + `useDeleteBookmark`; `useChatPoll` + `useCreatePoll` + `useVotePoll`; `useMyReminders` + `useCreateReminder` + `useDeleteReminder` + `parseReminderExpression`.

#### Componentes do chat (v8.5.0)
`StatusPicker` (popover de status + DND com presets), `BookmarksBar` (links fixos), `PollMessage` (enquete inline com barras), `SlashMenu` (`/lembrete`, `/poll`, `/me`, `/tarefa`, `/processo`).

#### Página nova (v8.5.0)
`src/pages/ChatActivity.tsx` — rota `/chat/activity`, lazy-loaded; caixa unificada de menções, salvas e lembretes.

#### Hooks do chat (v8.19.0)
`useChatOthersReads(channelIds)` — retorna `Map<channelId, ISO|null>` com o maior `last_read_at` entre os **outros** membros de cada canal (exclui o próprio usuário). Usado no preview das DMs na sidebar para o indicador de "visto" (✓/✓✓). Realtime em `chat_channel_members`, `refetchInterval` 20s.

---

## Hierarquia Organizacional

### Migração Pessoa-Pessoa → Cargo-Cargo (v6.1.0)

**Antes (v6.0):**
- `employees.manager_id` → ID do gestor (pessoa)
- Hierarquia quebrava quando alguém saía
- Não suportava cargos vagos

**Depois (v6.1):**
- `positions.reports_to_id` → ID do cargo superior
- Hierarquia persiste independente de quem ocupa
- Suporta cargos vagos no organograma
- Trigger previne ciclos

---

## Hooks Customizados

### `useProcessFolders()`
Gerencia pastas de processos por tenant.
- **Cache:** `queryKey: ["process-folders", tenantId]`
- **Mutations:** `createFolder`, `renameFolder`, `deleteFolder`, `moveFolder`
- Retorna lista plana de `ProcessFolder[]` ordenada por `sort_order`

### `useProcessTags()`
Gerencia tags de processos e suas atribuições.
- **Cache:** `queryKey: ["process-tags", tenantId]`
- **Mutations:** `createTag`, `updateTag`, `deleteTag`, `assignTag`, `removeTag`
- `assignTag`/`removeTag`: operam na tabela `process_tag_assignments`

### `useProcessDocuments(processId?)`
Gerencia pastas e documentos/arquivos anexos de um processo.
- **Cache:** `queryKey: ["process-documents", processId]` — isolado por processo
- **Mutations:** `createFolder`, `updateFolder`, `deleteFolder`, `toggleFolderPublic`, `createDocument`, `updateDocument`, `deleteDocument`, `toggleDocPublic`, `reorderFolders`, `reorderDocs`, `bulkTogglePublic`, `bulkToggleFolderChildren`, `moveDocument`, `moveMultipleDocs`
- **Uploads:** `uploadFile(file, folderId?)` → Storage `/{tenantId}/processes/{processId}/`, `uploadImage(file)` → subpasta `images/`
- Tabelas: `process_doc_folders` + `process_documents`

### `usePositionHierarchy()`
Monta árvore hierárquica de cargos:
```typescript
{
  flat: PositionData[],         // Lista plana
  tree: PositionHierarchyNode[], // Árvore montada
  map: Map<string, Node>        // Mapa para lookup rápido
}
```

### `useAllPositions()`
Busca todos os cargos com hierarquia para seletores.

### `useAuth()`
Gerencia sessão e profile do usuário.
- **Race condition corrigida (v7.4):** `setLoading(false)` aguarda `fetchProfile()` no evento `INITIAL_SESSION` via `setTimeout async`.
- Remove chamada redundante a `getSession()` — `INITIAL_SESSION` cobre o mesmo caso.

### `useTasks(projectId?)`
Dados + mutations de tarefas num único hook.
- **Regra:** Chamar **uma única vez** por componente e desestruturar dados e mutations juntos.
- **Cache:** `queryKey: ["tasks", tenantId, projectId]` — invalidação cirúrgica, nunca invalida outros projetos/tenants.
- **Mutations (v7.9):** `createTask`, `updateTask`, `deleteTask`, `moveTask`, `batchUpdateSortOrder`, `batchUpdate`, `batchDelete`, `syncAssignees`
  - `batchUpdateSortOrder(tasks[])` — recalcula sort_order de todas as tasks das colunas afetadas (fix drag-and-drop)
  - `batchUpdate({ taskIds, updates })` — atualiza status/prioridade/assignee em lote (seleção batch)
  - `batchDelete(taskIds)` — exclui múltiplas tarefas em lote
  - `syncAssignees(taskId, employeeIds[])` — sincroniza tabela `task_assignees` (multi-assignee)

### `useKanbanColumns()`
Colunas do board por tenant.
- **Cache:** `queryKey: ["kanban-columns", tenantId]` — isolado por tenant.

### `useTaskRecurrence(taskId?)`
Gerencia configuração de recorrência de uma tarefa.
- **Cache:** `queryKey: ["task-recurrence", tenantId, taskId]`
- **Mutations:** `createRecurrence`, `updateRecurrence`, `deleteRecurrence`, `toggleActive`
- Componente `RecurrenceConfig` consome este hook no modal de detalhe da tarefa

### `useNotifications()`
Notificações do usuário com suporte a realtime.
- **Cache:** `queryKey: ["notifications", userId]`
- **Realtime:** Subscription via Supabase Realtime na tabela `notifications` filtrando `user_id`
- **Mutations:** `markAsRead`, `markAllAsRead`, `deleteNotification`
- Componente `NotificationsPopover` no header consome este hook

### `usePublicDocument(token)`
Acesso público a documentos sem sessão.
- Usa `createClient` com anon key sem fallbacks hardcoded.
- Lança erro explícito se env vars ausentes.

### `useIntegrations()` (v8.28.0)
Combina o status das chaves (Edge Function `integrations-status`) com os overrides manuais (`tenant_features`) para decidir a visibilidade de cada feature dependente de integração externa.
- **Cache:** `queryKey: ["integrations-status", tenantId]` (status) + `["tenant-features", tenantId]` (overrides).
- **Regra de ativação:** `visível = (chave presente E saudável) E NOT desligada_manualmente`.
- **Fail-open:** em dúvida, erro ou carregando, retorna `true` (mostra) — para nunca perturbar a produção atual, que já tem todas as chaves.
- **Expõe:** `isActive(key)`, `getFeature(key)`, `features`, `setManuallyDisabled` (mutation — invalida `["tenant-features", tenantId]`).
- **Features:** `meetings`, `ai`, `recording`, `email`, `push`.

### Hooks de Reuniões
| Hook | Função |
|------|--------|
| `useMeetingsList()` | Lista reuniões com projeto e attendees |
| `useMeetingDetail()` | Detalhes com attendees e employee profiles |
| `useProcessTranscript()` | Processa transcrição via meeting-ai |
| `useApproveItems()` | Cria projetos/tarefas aprovados |
| `useCreateMeetingWithTranscript()` | Cria reunião com transcrição externa |
| `useSonioxTempKey()` | Gera chave para WebSocket Soniox |

### Hooks de Chat (v8.2.0)
| Hook | Função |
|------|--------|
| `useChat*` (`useChatConversations`, `useChatMessages`, `useSendChatMessage` …) | Núcleo do chat: conversas, mensagens, mutations, realtime push |
| `useChatPresenceHeartbeat()` | Mantém `chat_presence.last_seen_at` atualizado a cada 30s — invocado em `AppLayout` |
| `useTenantPresence()` | Lê presença de todos os colaboradores do tenant + realtime |
| `useThreadMessages(rootId)` | Mensagens-filhas de uma thread (`thread_root_id = rootId`) com realtime |
| `useThreadCounts(conversationId)` | Mapa `{ rootMessageId: replyCount }` para badges nas bolhas |
| `useChatStarredMessages()` | Mensagens salvas pelo usuário (com join no autor) |
| `useToggleStarMessage()` | Salva/remove estrela em uma mensagem |
| `useStarredMessageIds()` | `Set<string>` para checagem O(1) na bolha |

---

## Segurança

### Variáveis de Ambiente
- `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` são lidas via `import.meta.env` (prioridade) em `src/integrations/supabase/config.ts`.
- **Fallback de credenciais públicas (v8.13.2):** como a produção roda no **Lovable** (Cloudflare, `gt3.omnx.pro`) e o Lovable **não injeta `VITE_*` no build do frontend**, `config.ts` mantém `FALLBACK_SUPABASE_URL`, `FALLBACK_SUPABASE_PROJECT_ID` e `FALLBACK_SUPABASE_ANON_KEY` como fallback. Esses valores são **públicos por design** (vão ao bundle de qualquer forma, protegidos por RLS). `import.meta.env` sempre vence quando presente (Vercel/local).
- **NUNCA** usar fallback hardcoded para valores **secretos** (`service_role`, chaves de API privadas) — apenas para a URL/anon key públicas do Supabase. Ver CLAUDE.md §2.
- Getters: `getSupabaseUrl()`, `getDirectSupabaseUrl()` (URL real para o WebSocket do realtime), `getSupabaseAnonKey()`, `getSupabaseStorageKey()`.
- O `vercel.json` (rewrites de proxy + headers) só se aplica em deploy na Vercel; **é inerte na publicação via Lovable**. `SAME_ORIGIN_PROXY_HOSTS` em `config.ts` está vazio, então o client chama o Supabase **diretamente** (correto para o Lovable).
- Ver `.env.example` para lista completa de variáveis necessárias.

### Isolamento Multi-Tenant
- Todas as queries de dados **devem** incluir `.eq("tenant_id", tenantId)` como defesa em profundidade além do RLS.
- Queries de join (ex: `employee_projects`) devem filtrar `tenant_id` mesmo que RLS cubra — o RLS pode falhar silenciosamente.

### Remediação de brechas críticas (v8.25.1 — 2026-07-13)
Auditoria de segurança corrigiu 6 brechas de isolamento multi-tenant. Detalhes, comandos de deploy e testes de regressão em **`docs/SEGURANCA.md`**. Pontos que alteram o schema/segurança:
- **`profiles_update_own`** agora tem `WITH CHECK (tenant_id = get_user_tenant_id())` — usuário não pode trocar o próprio `tenant_id` via UPDATE. Migration `20260713100000`.
- **Nova tabela `tenant_invitations`** `(id, tenant_id, email, token, expires_at, used_at, created_by, created_at)`: RLS habilitada **sem policies de cliente** (só `service_role` e `handle_new_user` SECURITY DEFINER acessam). `handle_new_user` só honra `invited_tenant_id` do signup se houver convite válido (tenant+email+token, não expirado/usado); senão cria tenant próprio. Emitida por `create-employee`/`create-tenant`. Migration `20260713110000`.
- **`ensure_area_channel` / `ensure_omnx_bot` / `ensure_system_bot`**: `REVOKE EXECUTE` de PUBLIC/anon/authenticated; só `service_role` (triggers rodam como owner). Migration `20260713120000`.
- **Edge Functions** `send-chat-notification` e `process-ai` passaram a exigir JWT (`auth.getUser()`); `manage-access` aplica isolamento em todas as ações; `create-employee` recusa e-mail de outro tenant com 409.

### RLS de Processos (v7.9.11)

Visibilidade de processos é restrita por cargo OU área para `member`. Se o usuário ocupa um cargo subordinado ao Diretor de Vendas, por exemplo, ele herda acesso aos processos vinculados à área de Vendas porque o cargo de diretoria usa `positions.area_id` e o cargo subordinado resolve área via `positions.subarea_id → subareas.area_id`.

| Política | Tabela | Regra |
|----------|--------|-------|
| `processes_select` | `processes` | Admin vê tudo; manager vê processos criados por ele ou vinculados ao seu cargo/área; member vê processos vinculados ao seu cargo, área ou subárea |
| `steps_select` | `process_steps` | Herda visibilidade do processo pai via `user_can_read_process(process_id)` |
| `process_positions_select` | `process_positions` | Usuário vê vínculos de cargos apenas se puder ler o processo pai |
| `tenant_select_process_areas` | `process_areas` | Usuário vê vínculos de áreas apenas se puder ler o processo pai |

**Cadeia de relacionamento:**
```
auth.uid() → employees.user_id → employee_positions.employee_id
           → employee_positions.position_id/subarea_id/area_id
           → process_positions.position_id OU process_positions.position.subarea_id/area_id
           → process_areas.subarea_id/area_id OU processes.area_id/subarea_id
```

- Processos sem cargo, área ou subárea compatível são invisíveis para `member`.
- Managers preservam a exceção de criador para continuar vendo processos recém-criados antes de vincular cargos/áreas.
- `processes_hierarchy_view` é SECURITY INVOKER — o RLS de `processes` se aplica automaticamente.
- **Bug corrigido (v7.7.2):** Sem `created_by = auth.uid()`, managers que criavam processos não conseguiam lê-los de volta via `.select().single()` porque o processo novo ainda não tinha `process_positions` vinculadas → PGRST116.

### RLS de Tarefas, Projetos e Reuniões (v7.9.10)

Visibilidade restrita por atribuição e por vínculo de cargo/área — nenhum dado chega ao cliente sem permissão.

| Política | Tabela | Regra |
|----------|--------|-------|
| `tasks_select` | `tasks` | Admin vê tudo; manager vê tarefas de projetos acessíveis + tarefas atribuídas a si + **tarefas de todos os subordinados diretos e indiretos** (via `get_subordinate_employee_ids()`); member vê apenas tarefas onde é responsável via `assignee_id` ou `task_assignees` |
| `projects_select` | `projects` | Admin vê tudo; manager mantém exceções de criador/tarefa atribuída; member vê projetos onde possui ao menos uma tarefa atribuída ou onde foi adicionado como membro direto em `employee_projects` |
| `meetings_select` | `meetings` | Admin vê tudo; demais: criador (`created_by = auth.uid()`) OU participante (`meeting_attendees → employees.user_id`) |
| `meeting_attendees_select` | `meeting_attendees` | Admin vê tudo; demais: esta linha é o próprio usuário OU criou a reunião |

**Cadeias de relacionamento:**
```
Tasks:    auth.uid() → employees.user_id → employees.id = tasks.assignee_id
          auth.uid() → employees.user_id → task_assignees.employee_id
          auth.uid() = projects.created_by (dono vê todas as tarefas do projeto)

Projects: auth.uid() = projects.created_by (manager)
          auth.uid() → employees.user_id → tasks.assignee_id → tasks.project_id
          auth.uid() → employees.user_id → task_assignees.employee_id → tasks.project_id
          auth.uid() → employees.user_id → employee_projects.employee_id → employee_projects.project_id

Meetings: auth.uid() = meetings.created_by
          auth.uid() → employees.user_id → employees.id = meeting_attendees.employee_id → meeting_attendees.meeting_id = meetings.id
```

- Políticas INSERT/UPDATE/DELETE não foram alteradas — apenas SELECT.
- `emp_projects_select` mantém `tenant_id = get_user_tenant_id()` sem restrição adicional (conteúdo sensível já protegido por tasks/projects RLS).

**Helpers RLS (v7.9.10+):**
- `user_has_project_assigned_task(project_id)`: retorna `true` quando o usuário tem tarefa no projeto via `assignee_id` legado ou via `task_assignees`.
- `user_project_matches_position_or_area(project_id)`: compara o cargo e a área do usuário com os cargos/áreas dos colaboradores vinculados ao projeto.
- `user_can_read_project(project_id)`: centraliza regra de leitura de projeto para admin, manager e member.
- `get_readable_project_ids()` (`STABLE SECURITY DEFINER`): retorna o **conjunto** de `project_id`s legíveis pelo usuário atual (`= SELECT id FROM projects WHERE user_can_read_project(id)`). Usada na policy `tasks_select` como `project_id IN (SELECT get_readable_project_ids())` para que a checagem de acesso a projeto seja avaliada **uma única vez por query** (hashed SubPlan) em vez de por linha — evita o `statement timeout` no quadro/lista de tarefas para managers (v8.14.4).
- `user_process_matches_position_or_area(process_id)`: compara cargo, subárea e área do usuário com `process_positions`, `process_areas` e colunas diretas do processo.
- `user_can_read_process(process_id)`: centraliza regra de leitura de processo para admin, manager e member.
- `get_subordinate_employee_ids()`: retorna todos os `employee_id`s que reportam (direta ou indiretamente) ao manager logado, usando CTE recursiva sobre `positions.reports_to_id` → `employee_positions`.

### Mutations & Cache
- Invalidações de cache **nunca** devem usar queryKey mais amplo que o necessário.
- Padrão: `{ queryKey: ["recurso", tenantId, scopeId] }` — nunca `{ queryKey: ["recurso"] }` sozinho.

### Auditoria
- Erros em trilhas de auditoria (ex: `employee_status_history`) devem **lançar erro**, não ser silenciados com `console.error`.
- A mutação pai não deve reportar "sucesso" se o log de auditoria falhou.

### Permissões no Frontend
- `canModifyTask(task)` centraliza a lógica de permissão — aplica-se a **todos** os usuários, incluindo admins.
- Não usar `if (isMember) { verificar }` — a função já retorna `true` para não-membros.
- `canEdit` em modais nunca deve defaultar para `true` quando não há entidade carregada.
- `canManageProjects` permite admin/manager criar, editar e vincular pessoas em projetos; exclusao de projeto deve continuar gated por `isAdmin`.
- `canManageProcesses` permite admin/manager gerir processos, pastas, tags, anexos, documento e diagrama; exclusao de processo deve continuar gated por `isAdmin`.
- Comunicados seguem a RLS: admin edita/exclui todos; manager edita/exclui apenas comunicados cujo `author_id` seja seu employee atual.
- Entradas de navegacao e busca global marcadas como `adminOnly` nao devem aparecer para manager/member.

---

## Views do Banco

### `organograma_view`
View principal para o organograma de colaboradores.

### `position_hierarchy_view`
View para hierarquia de cargos (incluindo vagos).

---

## Migrações Recentes

### 20260713140000_tenant_features.sql (v8.28.0)
- Cria tabela `tenant_features` (tenant_id, feature_key, manually_disabled, updated_by) com `UNIQUE(tenant_id, feature_key)` e índice em `tenant_id`
- Guarda **apenas** o override manual da Central de Integrações — nenhuma chave de API vive no banco
- RLS: SELECT por membro do tenant (dirige o gate); INSERT/UPDATE/DELETE só admin

### 20260413000002_member_visibility_by_position_area.sql (v7.9.6)
- Garante `processes.area_id`, `processes.subarea_id` e `process_positions` para classificação por cargo/área
- Cria helpers `user_can_read_project`, `user_project_matches_position_or_area`, `user_can_read_process` e `user_process_matches_position_or_area`
- Restringe `member` a projetos/processos vinculados ao seu cargo OU à sua área, incluindo subordinados do diretor da área
- Preserva exceções de manager para processos/projetos criados ou tarefas atribuídas

### 20260413000001_create_ghl_webhook_ingestion.sql (v7.9.5)
- Cria tabela `ghl_webhook_sources` para configurar fontes GHL por tenant com `token_hash`
- Cria tabela `ghl_webhook_events` para armazenar payload bruto, JSON parseado, headers sanitizados e metadados inferidos
- Cria helper `hash_ghl_webhook_token(token)` para gerar o SHA-256 usado no cadastro da fonte
- RLS restringe leitura a admin/manager e escrita administrativa; inserts dos eventos entram pela Edge Function com `service_role`

### 20260319000001_kanban_advanced.sql (v7.9.0)
- Adiciona valores `ajustes` e `arquivado` ao enum `task_status`
- Cria tabela `task_assignees` (task_id, employee_id, tenant_id) com unique constraint + RLS
- Cria tabela `task_recurrence` (task_id, frequency, interval, days_of_week, day_of_month, next_due, is_active, tenant_id) + RLS
- Cria tabela `notifications` (user_id, tenant_id, type, title, body, metadata, read) + RLS por user_id
- Índices em `task_assignees(task_id)`, `task_assignees(employee_id)`, `task_recurrence(task_id)`, `notifications(user_id, read)`

### 20260311000001_process_folders_tags.sql
- Cria tabela `process_folders` (id, tenant_id, name, parent_id, sort_order, created_by) — suporte a sub-pastas
- Adiciona coluna `folder_id` em `processes` (FK → process_folders, on delete set null)
- Cria tabela `process_tags` (id, tenant_id, name, color) — categorização por cor
- Cria tabela `process_tag_assignments` (process_id, tag_id) — junction com unique constraint
- RLS em todas as 3 tabelas: isolamento por `tenant_id` via `profiles`

### 20260309120000_meeting_enhancements.sql
- Adiciona `scheduled_date`, `scheduled_time`, `project_id`, `location` em `meetings`
- Cria tabela `meeting_attendees` com RLS policies
- Triggers para tenant_id e updated_at

### 20260309140000_position_hierarchy_migration.sql
- Adiciona `reports_to_id` em `positions`
- Cria `check_position_cycle()` trigger
- Atualiza views com dados de hierarquia

---

## Módulo de Reuniões (v7.0 - v7.3)

### Arquitetura de Transcrição
```
Transcrição → Chunking → [Análise por Chunk] → Consolidação → Database
                          (Estágio 1)            (Estágio 2)
```

### Edge Functions
| Função | Descrição |
|--------|-----------|
| `soniox-temp-key` | Gera chave temporária para WebSocket Soniox |
| `meeting-ai` | Processa transcrição com chunking + consolidação |
| `meeting-approve` | Cria projetos/tarefas aprovados com campos expandidos |
| `manage-access` | Admin-only: ban/unban, reset de senha, exclusÃ£o/desativaÃ§Ã£o e troca de papel via service role com validaÃ§Ã£o de tenant |
| `create-employee` | Admin-only: cria auth user + employee. Detecta email duplicado pelo erro do Supabase e usa RPC `get_user_id_by_email` para reportar colisão de tenant (substitui `auth.admin.listUsers`). Por padrão envia **convite por email** (recovery link via `admin.generateLink` → `/reset-password`, enviado via Resend com branding do tenant) para o colaborador definir a própria senha; `send_invite=false` no payload volta ao fluxo de senha temporária. Retorna `invite_sent`. Envs: `RESEND_API_KEY`, `EMAIL_FROM`, `SITE_URL` |
| `ghl-webhook` | Recebe webhooks do GoHighLevel, valida token por fonte e armazena payload bruto em `ghl_webhook_events` |
| `send-chat-notification` | Web Push de novas mensagens de chat. Monta `title` (remetente + canal) e `body` (prévia) e **criptografa o payload** (RFC 8291/8188, `aes128gcm`) antes de enviar via VAPID. Sem o payload criptografado o service worker exibia texto genérico e o Android (FCM) descartava o push. Invocada pelo frontend ao inserir mensagem |
| `email-unread-chat` | Cron (1 min). Para cada conversa silenciosa há >= 5 min com mensagens ainda não lidas, envia um digest por email (Resend) ao email cadastrado do destinatário e registra o envio em `chat_email_notifications`. Protegida por header `x-cron-secret` (env `CRON_SECRET`). Consome a RPC `get_unread_chat_for_email`. Envs: `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET`, `SITE_URL` |
| `send-push` | Web Push **genérico** (tarefa atribuída, novo post no feed). Recebe `{ employee_ids, title, body, url?, tag? }`, busca `push_subscriptions` e envia (lógica em `_shared/webpush.ts`, compartilhada com `send-chat-notification`). `verify_jwt=false`; autenticada por header `x-internal-secret` (env `INTERNAL_PUSH_SECRET`, espelhado no Vault `internal_push_secret`). Chamada pelos triggers do banco via `pg_net` (`app_dispatch_push`) |
| `integrations-status` | **Só leitura** (v8.28.0). Reporta a **presença** (`available`) de cada secret de integração para qualquer usuário autenticado — é o que dirige o gate de features. Com `probe=1` (**admin-only**) faz um ping leve de validação contra OpenRouter (`/api/v1/models`) e Resend (`/domains`). **Nunca** devolve o valor de nenhum segredo. Secrets consultados: `LIVEKIT_*`, `OPENROUTER_API_KEY`, `S3_*`, `RESEND_API_KEY`/`EMAIL_FROM`, `VAPID_*` |
| `cami` | Assistente de IA (OpenRouter, `OPENROUTER_API_KEY`). Dois modos: **chat** (`{ message, history?, context? }` → `{ reply, actions }`) com tool-calling — tools de leitura (`search_items`, `list_my_tasks`, `list_upcoming_meetings`) executam no servidor; tools de ação (`propose_task`, `propose_meeting`, `open_item`) viram propostas que o frontend confirma; e **execute** (`{ execute:{ type, args } }`) que cria de fato tarefa/reunião após confirmação. Valida JWT do usuário manualmente. Consumida por `useCami` + `CamiPanel` |

### Notificações de Chat (Push + Email)

Dois canais complementares avisam sobre novas mensagens:

1. **Web Push (imediato)** — `send-chat-notification`. Ao inserir uma mensagem, o
   frontend invoca a função, que busca os membros do canal (exceto o autor),
   resolve `user_id → employee_id`, lê as `push_subscriptions` e envia um push
   **com payload criptografado** contendo `title` (`"Fulano em #canal"` ou só o
   nome em DM) e `body` (prévia da mensagem). O service worker (`public/sw.js`)
   lê esse payload e exibe a notificação personalizada. A criptografia
   (RFC 8291 + RFC 8188 / `aes128gcm`) é obrigatória: iOS tolera push sem
   payload, mas o FCM (Android) o descarta.

2. **Email (fallback após 5 min)** — `email-unread-chat`, disparada por pg_cron
   a cada minuto. Uma conversa é elegível quando ficou silenciosa por >= 5 min e
   ainda há mensagens não lidas (`chat_messages.created_at > chat_channel_members.last_read_at`).
   Envia **1 email-digest por conversa** (Resend) e dedupe via
   `chat_email_notifications`. O backfill inicial marca o estado atual como já
   notificado para não emailar backlog histórico.

#### `chat_email_notifications` (dedupe de email)
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid PK | |
| `tenant_id` | uuid | |
| `channel_id` | uuid | canal/conversa |
| `user_id` | uuid | destinatário |
| `last_emailed_message_at` | timestamptz | data da última mensagem já notificada por email |
| `emailed_at` | timestamptz | quando o último email foi enviado |
- **UNIQUE** `(channel_id, user_id)`
- **RLS:** habilitada **sem policies** (deny-all a clientes); só `service_role` acessa.

#### RPC `get_unread_chat_for_email(p_quiet interval)`
- `SECURITY DEFINER`, execute apenas para `service_role`.
- Retorna, por `(canal, destinatário)`, conversas com mensagens não lidas cuja
  mensagem não-lida mais recente seja mais antiga que `p_quiet` e mais nova que o
  último email registrado em `chat_email_notifications`.

#### RPC `create_chat_task_notification(p_channel_id, p_assignee_user_id, p_title, p_body)`
- `SECURITY DEFINER`, execute para `authenticated` (migration `20260623120000`, v8.18.0).
- Insere a notificação `task_assigned_chat` ao criar uma tarefa pelo chat, **só se o
  responsável não silenciou o canal**. Valida que o chamador é membro do canal (deriva o
  `tenant_id` dele), que o responsável também é membro e ignora auto-notificação. A checagem
  de mute do destinatário em `chat_channel_mutes` roda como owner (bypassa RLS), o que a
  checagem client-side anterior não conseguia fazer de forma confiável.

### Cami — Assistente de IA

Painel lateral (drawer) no Chat que conversa com a Edge Function `cami`.

- **UI:** `src/components/cami/CamiPanel.tsx` (drawer à direita, mensagens, cartões
  de ação, input). Avatar em `CamiAvatar`. 3 pontos de entrada no `Chat.tsx`:
  slash `/ai`, botão "Pergunte a Cami" no compositor, e item do menu da mensagem
  (este abre em modo **sugerir resposta**, passando a mensagem como contexto).
- **Hook:** `src/hooks/useCami.ts` — estado da conversa, `send()` (modo chat) e
  `executeAction()` (modo execute, após confirmação).
- **Capacidades v1:** criar tarefas, agendar/iniciar reuniões, buscar e navegar
  até processos/documentos/projetos, sugerir respostas e Q&A sobre tarefas/reuniões.
- **Padrão "propor e confirmar":** ações nunca são executadas direto pelo LLM.
  A função devolve `actions` (propostas) que viram cartões com botão de
  confirmação; só ao confirmar o frontend chama o modo execute, que cria de fato
  (tarefa/reunião) e devolve `navigate` (ex.: entrar na reunião recém-criada).
- **Segurança:** todas as queries filtram `tenant_id`; ids para navegação só vêm
  de `search_items` (o LLM não inventa caminhos).

### Ativação de features por integração — Central de Integrações (v8.28.0)

Cada função que depende de uma API externa **acende sozinha** quando a chave correspondente está conectada no ambiente do clone. Se a chave não estiver conectada, a função fica **oculta** em toda a plataforma (não desabilitada/quebrada).

**Regra de gating:** `visível = (chave presente E saudável) E NOT desligada_manualmente`.

**Fail-open:** em dúvida, erro ou enquanto o status carrega, a feature é **mostrada** — para nunca perturbar a produção atual, que já tem todas as chaves configuradas.

**Mapa feature → chaves → o que gateia:**
| Feature | Secrets | O que fica gated |
|---------|---------|------------------|
| `meetings` | `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL` | Aba Reuniões, rotas `/reunioes`, `/meet/:roomId`, huddles (`/chat/:channelId/huddle`) |
| `ai` | `OPENROUTER_API_KEY` | Transcrição de áudio (chat/feed), resumo de reunião, assistentes CAMI/omnx-bot |
| `recording` | `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_ENDPOINT`, `S3_BUCKET` | Gravação MP4 |
| `email` | `RESEND_API_KEY`, `EMAIL_FROM` | Digest de e-mail |
| `push` | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web push |

**Árvore de dependência:** `meetings` (LiveKit) é a **raiz** do módulo de reunião; `ai` (transcrição/IA) e `recording` (gravação) são **camadas independentes** que ligam/desligam por cima **sem derrubar a reunião ao vivo**.

**Peças (Fase 1 — gate + status + override):**
- Tabela `tenant_features` — guarda **apenas** o override manual; nenhuma chave vive no banco.
- Edge Function `integrations-status` — só leitura; reporta presença (`available`) de cada secret para o gate + ping de validação (`probe=1`, admin-only) para OpenRouter/Resend.
- Hook `useIntegrations` — combina status + overrides; `isActive(key)`, fail-open.
- `FeatureRoute` (`src/components/auth/FeatureRoute.tsx`) — guard de rota que redireciona para `/dashboard` quando a feature não está ativa (fail-open). Envolve `/reunioes`, `/meet/:roomId` e `/chat/:channelId/huddle` em `App.tsx`.
- `AppSidebar` — `NavItem` ganhou campo `feature?`; item Reuniões marcado com `feature="meetings"`; o filtro de visibilidade do menu considera `isFeatureActive`.
- `IntegrationsCard` (`src/components/settings/IntegrationsCard.tsx`) — aba "Integrações" em Configurações (admin-only): status por serviço + toggle de override + link "obter chave". A grade de abas em `Configuracoes.tsx` passou de 5 para 6 colunas.

**Fase 2 (planejada):** conexão de chave pela própria UI via **Supabase Vault**, com resolução **Vault → env** nas Edge Functions existentes.

### GestÃ£o de Acesso e Roles
- A tabela `user_roles` permanece protegida por RLS e nÃ£o deve ser alterada diretamente pelo frontend para troca de papel.
- MudanÃ§as de role devem passar pela Edge Function `manage-access`, que valida permissÃ£o de admin, impede autoalteraÃ§Ã£o, confirma tenant do alvo e executa a mutaÃ§Ã£o com `service_role`.
- `manage-access` aceita chamadas de `https://gt3.empirebusiness.com.br`, `https://t3.empirebusiness.com.br` e localhost para desenvolvimento.

### Sistema de Chunking (v7.3)
- **CHUNK_SIZE**: 30.000 caracteres (~10 min de transcrição)
- **CHUNK_OVERLAP**: 3.000 caracteres
- **Pontos de quebra**: Mudança de speaker > duplo newline > fim de frase
- **Performance**: Para 1h20m (~8 chunks): 9 chamadas LLM (~20K tokens input)

### Schema Expandido de Tarefas
```typescript
interface ExpandedTask {
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "urgent";
  suggested_assignee: string;
  effort_estimate: "small" | "medium" | "large" | "extra_large";
  risk_level: "low" | "medium" | "high";
  acceptance_criteria: string[];
  steps: { order: number; description: string; estimated_time?: string }[];
  dependencies: { task_title_ref: string; dependency_type: "blocks" | "blocked_by" | "related_to" }[];
  project_suggestion: string;
  suggested_due_date: string;
}
```

### Hooks de Reuniões
| Hook | Função |
|------|--------|
| `useMeetingsList()` | Lista reuniões com projeto e attendees |
| `useMeetingDetail()` | Detalhes com attendees e employee profiles |
| `useProcessTranscript()` | Processa transcrição via meeting-ai |
| `useApproveItems()` | Cria projetos/tarefas aprovados |
| `useCreateMeetingWithTranscript()` | Cria reunião com transcrição externa |
| `useSonioxTempKey()` | Gera chave para WebSocket Soniox |

---

## Funcionalidades Recentes

**v8.29.1 - Tarefas: rascunho automático e fim da perda de dados no cadastro (2026-07-15):**
- **Causa raiz:** o form "Nova Tarefa" (`useState` em `KanbanBoard`) era destruído quando `Tarefas.tsx` desmontava o board ao ver `tasks === undefined` — o que ocorria em blips de `profile`/`tenant_id` (refresh de token/foco), mudando a `queryKey` e desabilitando a query de tarefas.
- **Correções:** `useTasks.ts` passou a usar `placeholderData: keepPreviousData` (tasks não volta a `undefined` → board não desmonta). `KanbanBoard.tsx` ganhou **rascunho automático** do formulário de criação em `localStorage` (`omnx:taskdraft:<projectId|global>`): persiste em digitação, restaura ao reabrir (mesmo após refresh) e limpa ao criar. Anexos não são persistidos.

**v8.29.0 - Processos: fluxograma visual repaginado (2026-07-15):**
- **Núcleo `flow-core.tsx`** (`src/components/processes/flow-core.tsx`) — fonte única de verdade do diagrama BPM. Acaba com a lógica de layout **triplicada** e a divergência `TB`×`LR`. Exporta os tipos `FlowNode`/`FlowEdge`/`FlowData`, o registro `nodeTypes`, `NODE_WIDTH`/`NODE_HEIGHT`, `makeEdges` (respeita `edge.type` e `edge.animated`), `toReactFlowNode` (propaga `phase` e `color` ao `data`), `layoutNodes` (dagre TB + swim-lane com faixa `laneBackground` desenhada) e `autoLayoutNodes`. `ProcessFlow.tsx`, `DiagramViewer.tsx`, `DiagramEditor.tsx` e `ExportDialog.tsx` consomem esse módulo; `ProcessFlow` re-exporta `FlowData`.
- **Modelo de nó/edge (persistido em `processes.flow_data` jsonb, retrocompatível — sem migration):** `FlowNode.type` = `start | end | task | decision | subprocess | note | document | data | event`; `FlowNode.color?` = `primary | success | warning | danger | info | neutral` (mapeia para tokens semânticos do DS); `FlowEdge.type?` = `smoothstep | straight | step | bezier` e `FlowEdge.animated?`. `phase` e `laneBackground` são nós de **runtime** (não persistidos).
- **`BpmNodes.tsx`** — nós com ícone + acento de cor (`accentFor`/`ACCENTS`, zero cor hardcoded), handles ocultos que aparecem no hover/seleção, start×end diferenciados, decisão em losango, novos `BpmDocumentNode`/`BpmDataNode`/`BpmEventNode` e `BpmLaneBackgroundNode` (faixa da swim-lane).
- **`DiagramEditor.tsx`** — editor em modal, agora sob `ReactFlowProvider`: drag-and-drop da paleta (`onDrop` + `screenToFlowPosition`), IDs `crypto.randomUUID()`, **undo/redo real** (pilha de snapshots; add/connect/delete/drag/edição; `Ctrl+Z`/`Ctrl+Shift+Z`), edição de conexões (rótulo/estilo/animada/excluir), painel com cor/tipo/fase, toolbar (auto-organizar/ajustar/duplicar/grade).
- **Export (`src/lib/export-diagram.ts` + `ExportDialog.tsx`):** o dialog monta o **diagrama completo off-screen** e captura esse elemento via `exportDiagramAsImage(fmt, { element })` — corrige a captura recortada do `ProcessFlow` embutido. Fundo do export por tema (`themeBackgroundColor`) e novo `copyDiagramToClipboard()` (botão "Copiar imagem").
- **Edge Function `process-ai`:** o schema da tool `generate_process_diagram` aceita os novos tipos de nó e `color` (opcional). **Deploy pendente** (produção no Lovable).

**v8.17.0 - Criar colaborador, push Android, transcrição "de novo" e card de resposta (2026-06-09):**
- **`create-employee` idempotente** — a edge function fazia `INSERT` cego em `employees` e estourava `duplicate key (employees_user_id_key)` quando já existia registro com aquele `user_id` (constraint `UNIQUE(user_id)` que existe em produção mas **não no `init.sql`** — baseline defasado). Agora verifica e faz `UPDATE` se já existe (nos dois caminhos: usuário novo e e-mail existente), aplicando o cargo/setor sempre. Resolveu os 3 sintomas: 500, setor zerado e senha temporária não exibida.
- **Transcrição com re-fazer** — `feed-audio-transcribe` aceita `force: true` (ignora o cache e re-transcreve, sobrescrevendo). `AudioPlayer` ganhou botão ↻ "Transcrever de novo". A transcrição do chat/feed usa **OpenRouter** (Gemini/GPT-4o); Soniox (`useSoniox`) é exclusivo das reuniões ao vivo.
- **Push Android resiliente** — `sw.js` trata `pushsubscriptionchange` (re-inscreve quando o FCM rotaciona a subscription, causa do "Android para de receber") + `vibrate`/badge PNG. `usePushNotifications` re-sincroniza a inscrição no `visibilitychange` (foreground) e recria inscrições com chave VAPID divergente.
- **Card de resposta (mobile)** — citação dentro da mensagem ganhou `min-w-0`/`overflow-hidden` e o banner "Respondendo a" ganhou `truncate`, eliminando o overflow horizontal.

**v8.16.0 - Chat: colar com Ctrl+V + auto-atualização sem F5 (2026-06-08):**
- **Paste do clipboard** — o composer de `Chat.tsx` tem `onPaste` que captura itens `kind==="file"` do `clipboardData` (print de tela / imagem / qualquer arquivo copiado) e os injeta no fluxo de anexos existente (`handleFiles`), com `preventDefault()` para não colar binário como texto.
- **Fallback de atualização do chat** — `useChatMessages` agora tem `refetchInterval: 5_000` + `refetchOnWindowFocus`/`refetchOnReconnect`. O Realtime (`postgres_changes`) segue como caminho primário (entrega instantânea via invalidação), mas o polling garante atualização do canal aberto mesmo quando o Realtime falha em produção (tabela fora da publication/RLS no Lovable) — eliminando a necessidade de F5.

**v8.14.0 - Notificações, badges e Feed→Canal (2026-06-01):**
- **Push opt-in explícito** — `usePushNotifications` não pede mais permissão automaticamente (o Chrome no Android silenciava prompts sem gesto, e nenhuma subscription de Android era criada). Agora há `enable()` chamado por clique, via o banner `PushNotificationOptIn` (montado no `AppLayout`). Quem já concedeu permissão é re-inscrito silenciosamente.
- **Badge de não-lido no Feed e Tarefas** — Feed migrou de `localStorage` para a tabela `feed_reads` (persiste entre dispositivos); Tarefas usa `useTasksUnreadCount` = `notifications` não-lidas `type='task_assigned'`. Badges renderizados na `AppSidebar`.
- **Feed → Canal** — trigger `trg_feed_post_broadcast_to_channels` espelha o post como mensagem no canal de chat: `visibility_type='all'` → canal **Geral** (`is_general`, via `ensure_general_channel`); alvo de **área/subárea** → canal da área (`ensure_area_channel`). Mensagem com selo `📢 Novo no Feed` + anexo `{type:'feed_post'}` renderizado como card clicável (`FeedBroadcastCard` no chat) que abre o post via deep-link `/feed?post=<id>`. Canais padrão pré-existentes foram reconciliados (`is_general` + `area_id` por nome). Tabela `feed_post_channel_broadcasts` faz o dedupe.
- **Push de feed e tarefa** — `send-push` (edge) + `app_dispatch_push` (pg_net): trigger `trg_push_task_assigned` em `notifications` (tarefa atribuída) e o próprio trigger de broadcast do feed disparam push aos destinatários/membros do canal.
- **Mobile**: viewport com `user-scalable=no` + `viewport-fit=cover` (sem pinch-zoom; ativa safe-area).

**v7.9.8 - Alinhamento UI/RLS do manager (2026-04-13):**
- Projetos: o menu de cards separa `canManageProjects` de exclusao, mantendo a acao "Excluir" somente para admin
- Processos: nova permissao `canManageProcesses` libera para manager as acoes que a RLS ja permitia, como pastas, tags, anexos, documento, diagrama e reprocessamento; delete de processo segue admin-only
- Comunicados: manager continua criando comunicados, mas o card so exibe editar/excluir para seus proprios comunicados; admin gerencia todos
- Busca global: paginas `adminOnly`, como Configuracoes, deixam de aparecer para roles sem acesso

**v7.9.7 - Fix menu flutuante do editor de documentos (2026-04-13):**
- `RichTextEditor` preserva a seleção do Tiptap no `mousedown` dos botões de formatação, evitando que o bubble menu desmonte antes de aplicar negrito, itálico, sublinhado, destaque, código, link e título

**v7.9.11 - Visibilidade member de processos por área ou subárea (2026-04-16):**
- `member` passa a ver processos quando sua subárea estiver vinculada ao processo, além do caso já coberto por cargo e área
- O helper `user_process_matches_position_or_area()` agora compara explicitamente `subarea_id` antes do fallback por `area_id`

**v7.9.10 - Visibilidade member por membro direto de projeto (2026-04-16):**
- `member` passa a ver projetos em que foi adicionado diretamente em `employee_projects`, além dos projetos onde possui tarefas atribuídas
- `projects_select` combina membership direto do projeto com a regra já existente de tarefa atribuída

**v7.9.9 - Visibilidade member por multi-assignee de tarefa (2026-04-16):**
- `member` continua vendo projetos quando possui tarefa via `assignee_id` e passa a vê-los também quando é adicionado na tarefa via `task_assignees`
- Helper `user_has_project_assigned_task()` passa a cobrir os dois caminhos de atribuição para evitar divergência entre políticas

**v7.9.6 - Visibilidade member por cargo ou área (2026-04-13):**
- `member` passa a ver apenas projetos vinculados ao seu cargo OU à sua área, inferido pelos colaboradores vinculados em `employee_projects`
- Usuário subordinado ao diretor de uma área vê projetos vinculados à diretoria da mesma área, pois a comparação normaliza `positions.area_id` e `positions.subarea_id → subareas.area_id`
- Processos passam a usar a mesma regra por cargo/área via `process_positions`, `process_areas` e colunas diretas de área
- Helpers `SECURITY DEFINER` centralizam leitura e evitam recursão entre policies RLS

**v7.9.5 - Ingestao de webhooks GHL (2026-04-13):**
- Tabelas `ghl_webhook_sources` e `ghl_webhook_events` adicionadas para armazenar payloads brutos do GoHighLevel por tenant
- Edge Function `ghl-webhook` recebe POST publico, valida token por SHA-256 e grava headers sanitizados, query params, payload JSON e corpo bruto
- `supabase/config.toml` registra `ghl-webhook` com `verify_jwt = false`; autenticacao fica no token da fonte

**v7.9.4 â€” UX de tarefas: comentários, imagens e etiquetas (2026-04-09):**
- `TaskDetailModal` (`src/components/shared/TaskDetailModal.tsx`): campo de comentário mudou de input simples para textarea com `Enter` para enviar e `Shift+Enter` para quebra de linha
- Colagem com `Ctrl+V` em descrição e comentário agora insere imagem renderizável no conteúdo da tarefa, com compatibilidade para comentários antigos salvos com marcador `__img__`
- Etiquetas no topo do modal deixaram de ser destrutivas ao clique; remoção agora fica isolada em um botão `x` pequeno sobre o chip

**v7.9.0 — Kanban Avançado + Notificações + Multi-Assignees (2026-03-19):**
- **Fix timezone:** Datas de vencimento exibiam 1 dia antes (UTC-3). Novo utilitário `src/lib/date-utils.ts` com `normalizeDateForSave()`, `extractDateForInput()`, `parseDateSafe()` — usado em todos os inputs de data
- **Fix drag-and-drop:** `batchUpdateSortOrder` recalcula sort_order de todas as tasks das colunas afetadas, eliminando posições duplicadas/inconsistentes
- **Novos status:** Enum `task_status` expandido com `ajustes` (entre review e done) e `arquivado` (após done). Toggle "Mostrar Arquivados" no Kanban filtra tasks arquivadas
- **Ordenação:** Dropdown no toolbar do Kanban — ordenar por prioridade ou data de vencimento. Drag-and-drop desabilitado quando sort !== manual
- **Filtros avançados:** Filtro por data (range com inputs de/até), status temporal (atrasado/em dia/sem data), botão limpar filtros
- **Seleção em lote:** Batch mode com checkbox nos cards + barra flutuante para mover status, alterar prioridade, atribuir responsável, excluir em massa
- **Múltiplos responsáveis:** Tabela `task_assignees` (many-to-many task ↔ employee). Avatar stack nos cards do Kanban. Multi-select no modal de detalhe. Mutation `syncAssignees` em `useTasks`
- **Tarefas recorrentes:** Tabela `task_recurrence` com frequências (daily, weekly, biweekly, monthly, custom). Componente `RecurrenceConfig` no modal de detalhe. Hook `useTaskRecurrence`
- **Notificações:** Tabela `notifications` com RLS por `user_id`. Hook `useNotifications` com Supabase Realtime. Componente `NotificationsPopover` no header do AppLayout
- **Mobile:** Filtros colapsáveis no Kanban, touch targets adequados para interação mobile

**v7.9.1 — Editor de Documentos Notion-like (2026-03-30):**
- `RichTextEditor` (`src/components/shared/RichTextEditor.tsx`): menu de slash commands (`/`) via extensão Tiptap Suggestion + componente `SlashCommandMenu`; bubble menu flutuante ao selecionar texto; tooltips com atalhos de teclado; upload de imagem por file picker
- `SlashCommandMenu` (`src/components/shared/SlashCommandMenu.tsx`): menu dropdown com blocos agrupados (Básico, Títulos, Listas, Blocos, Mídia), navegação por teclado (↑↓ Enter Esc), filtragem por query
- `SlashCommand` extension (`src/lib/slash-command-extension.ts`): extensão Tiptap usando `@tiptap/suggestion` para detectar `/` e renderizar o menu
- `ProcessDocEditor`: auto-save com debounce (2s) + indicador visual (salvando/salvo/não salvo); Ctrl+S para save manual; modo padrão mudou de "view" para "edit"; clique no view mode entra em edição
- CSS ProseMirror melhorado: tipografia com hierarquia clara de headings, line-height 1.625, caret colorido, seleção estilizada, hover em imagens, code blocks, task items checked com strikethrough

**v7.8.1 — Fix Editor de Documentos (2026-03-16):**
- `ProcessDocEditor`: sub-componentes inline (`Toolbar`, `TitleSection`, `ContentSection`, `DocumentOutline`, `EditorContent`) extraídos para variáveis JSX — elimina remontagem de Textarea a cada keystroke (foco perdido / tela "sumindo")
- `useEffect` de reset agora depende apenas de `document.id` via `prevDocIdRef` — impede sobrescrita do conteúdo local após save + re-fetch do cache
- TOC (`useMarkdownTOC`) passa a receber `debouncedContent` (300ms) — elimina recalculo a cada keystroke

**v7.8.0 — Documentos Anexos em Processos (2026-03-15):**
- Tabelas `process_doc_folders` + `process_documents` com RLS tenant isolation e acesso público via `public_token`
- Storage bucket `process-documents`, path `/{tenantId}/processes/{processId}/{uuid}-{filename}`
- Hook `useProcessDocuments(processId)`: CRUD completo de pastas/documentos, upload, reordenação, bulk toggle público
- Componente `ProcessAttachments` em `src/components/processes/ProcessAttachments.tsx`
- `ProcessoDetalhes.tsx`: aba "Anexos" adicionada como 3ª aba
- Migration `20260315000002_process_doc_folders_documents.sql`

**v7.7.0 — Pastas e Tags para Processos (2026-03-11):**
- Tabelas `process_folders`, `process_tags`, `process_tag_assignments` com RLS
- Coluna `folder_id` em `processes` (FK → process_folders, nullable)
- Hooks `useProcessFolders` e `useProcessTags`
- `useProcesses` atualizado: filtro `folder_id`, fetch de tags por processo, mutation `moveToFolder`
- Componentes `ProcessFolderTree` (sidebar recursiva) e `ProcessTagFilter` (chips filtragem)
- `Processos.tsx`: layout 2 colunas, sidebar colapsável, filtro de tags, mover processo para pasta, tags nos cards

**v7.4 — Security & Stability Hardening (2026-03-09):**
- **C1:** `usePublicDocument` — removidos fallbacks hardcoded com URL/key Supabase; erro explícito se env vars ausentes
- **C2:** `KanbanBoard` — `useTasks()` chamado uma única vez; mutations e dados desestruturados juntos (elimina estado independente e bugs no drag-and-drop)
- **C3:** `EmployeeDetailModal` — query `employee_projects` agora filtra por `tenant_id` (defesa em profundidade além do RLS)
- **C4:** `useEmployees.updateStatus` — erro na inserção do histórico de auditoria agora propaga como exceção
- **A1:** `useAuth` — race condition corrigida: `setLoading(false)` aguarda `fetchProfile` no evento `INITIAL_SESSION`
- **A2:** `useTasks` — invalidação de cache usa `["tasks", tenantId, projectId]` (não mais `["tasks"]` global)
- **A5:** `KanbanBoard.handleDragEnd` — `canModifyTask()` aplicado para todos os perfis, sem bypass para admins
- **A6:** `useKanbanColumns` — invalidação usa `["kanban-columns", tenantId]`
- **M2:** `supabase/client.ts` — `throw Error` em vez de `console.error + || ''` quando env vars ausentes
- **M3:** `KanbanBoard` — `canEdit` default corrigido de `true` para `false` quando task não está carregada
- **M5:** `Tarefas.tsx` — estado de erro visível ao usuário quando `useTasks()` falha
- **M6:** `.env.example` — adicionadas `VITE_SITE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`

**v7.3 — Design Premium Quick Wins:**
- **Tipografia**: Plus Jakarta Sans (display) + JetBrains Mono (código) via Google Fonts
- **Cores**: Indigo aprimorado com variações (hover, glow, muted), accent emerald
- **Sombras**: shadow-primary e shadow-primary-lg com tom da brand
- **Hover**: Cards com glow sutil + elevação + borda colorida
- **Botões**: Primary com glow effect no hover
- **Animações**: Stagger animations para listas (fade-in-up com delay progressivo)
- **Dark mode**: Bordas mais sutis (217 20% 16%), glow mais pronunciado
- **Skeleton**: Shimmer effect premium com gradiente sofisticado

**v7.3 — Extração de Tarefas Aprimorada:**
- **Chunking**: Transcrições longas divididas em 30k chars com 3k overlap
- **Sistema 2-estágios**: Análise por chunk + consolidação final
- **Campos expandidos**: steps, dependencies, acceptance_criteria, risk_level, effort_estimate
- **UI**: Collapsible details e risk badges no MeetingApproval
