# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Este é o arquivo mestre de diretrizes para o agente Claude Code.**
> Todo desenvolvimento DEVE seguir estas regras. Violações causam bugs silenciosos, vazamentos de segurança e dívida técnica.

---

## Visão Geral do Projeto

**OMNX GT3** (anteriormente "Empire Manager") é uma plataforma multi-tenant de gestão empresarial (SaaS) com:
- **Stack:** Vite + React 18 + TypeScript + Supabase (BaaS) + TanStack Query v5 + Tailwind CSS + shadcn/ui
- **Auth/DB:** Supabase (RLS + Row-level multi-tenancy por `tenant_id`)
- **UI:** Radix UI + shadcn/ui components, Framer Motion para animações
- **Drag-and-drop:** `@hello-pangea/dnd` (Kanban boards)
- **Diagramas de fluxo:** `@xyflow/react` + `dagre` (processos)
- **Exportação:** `@react-pdf/renderer`, `jspdf`, `jszip`, `html-to-image`
- **Deploy:** Vercel (`vercel.json` na raiz)

---

## Comandos de Desenvolvimento

```bash
npm run dev          # Inicia servidor de desenvolvimento (Vite)
npm run build        # Build de produção (TypeScript check + Vite build)
npm run build:dev    # Build em modo development
npm run lint         # ESLint em todo o projeto
npm run preview      # Preview do build de produção
npm run test         # Executa testes uma vez (Vitest)
npm run test:watch   # Executa testes em modo watch
```

Para rodar um único arquivo de teste:
```bash
npx vitest run src/test/example.test.ts
```

Testes usam **Vitest** + `@testing-library/react` + `jsdom`. Setup em `src/test/setup.ts`.

---

## 0. Antes de Qualquer Coisa: Leia os Documentos

**Todo desenvolvimento começa com leitura.** Antes de escrever uma linha de código:

| Documento | Caminho | Quando ler | Atualizado em |
|-----------|---------|------------|---------------|
| **ARQUITETURA.md** | `docs/ARQUITETURA.md` | Sempre — schema, hooks, segurança | 2026-04-21 |
| **ROADMAP.md** | `docs/ROADMAP.md` | Sempre — fase atual, tarefas pendentes | 2026-04-27 |
| **PRD.md** | `docs/PRD.md` | Ao alterar regras de negócio ou escopo | 2026-04-13 |
| **DESIGN-SYSTEM.md** | `docs/DESIGN-SYSTEM.md` | Ao criar componentes visuais | 2026-04-21 |
| **FEED.md** | `docs/FEED.md` | Ao alterar feed, permissões ou visibilidade | 2026-04-21 |
| **SETUP-DATABASE.md** | `docs/SETUP-DATABASE.md` | Ao replicar banco para novos clientes (Lovable) | 2026-05-06 |
| **MIGRATIONS.md** | `docs/MIGRATIONS.md` | Ao criar/alterar migrations ou replicar banco | 2026-05-06 |
| **PROCESSO-DUMP-BASELINE.md** | `docs/PROCESSO-DUMP-BASELINE.md` | Ao gerar dump pg_dump de bancos Supabase | 2026-05-06 |
| **INSTRUCOES-REPLICACAO-BANCO.md** | `docs/INSTRUCOES-REPLICACAO-BANCO.md` | Prompt pronto para passar a outro sistema/agente | 2026-05-06 |

---

## 1. Regra de Ouro: Documentação Sempre Atualizada

> ⚠️ **DOCUMENTAÇÃO DESATUALIZADA É O ERRO MAIS GRAVE POSSÍVEL.**
> Gera bugs silenciosos, retrabalho e perda de contexto entre sessões.

### Fluxo obrigatório

```
1. Receber pedido
2. Ler docs relevantes
3. Planejar alinhado com os docs
4. Implementar
5. ATUALIZAR DOCS — sem exceção
6. Marcar tarefas concluídas no ROADMAP.md
```

### Checklist de atualização (OBRIGATÓRIO após cada implementação)

**ARQUITETURA.md — atualizar se:**
- [ ] Coluna adicionada/removida/renomeada → atualizar SQL + diagrama ER
- [ ] Nova tabela criada → bloco SQL completo + RLS policies
- [ ] Trigger/function alterada → bloco SQL correspondente
- [ ] Hook criado/removido → seção de hooks
- [ ] Componente compartilhado criado/removido → árvore de diretórios
- [ ] Página criada/removida → árvore + seção de rotas
- [ ] Edge function criada/alterada → seção de Edge Functions
- [ ] Padrão de segurança alterado → seção de Segurança
- [ ] Bug crítico corrigido → seção "Funcionalidades Recentes"

**ROADMAP.md — atualizar se:**
- [ ] Tarefa concluída → marcar checkbox `[x]`
- [ ] Nova tarefa identificada → adicionar à fase correta
- [ ] Versão incrementada → atualizar "Status Atual" + Changelog

**PRD.md — atualizar se:**
- [ ] Feature adicionada/removida do escopo
- [ ] Regra de negócio alterada

**DESIGN-SYSTEM.md — atualizar se:**
- [ ] Novo token CSS criado
- [ ] Componente visual novo com variantes
- [ ] Paleta de cores alterada

> **Se qualquer doc ficou desatualizado, a implementação NÃO está completa.**

---

## 2. Regras de Segurança

### Credenciais e Variáveis de Ambiente

- **NUNCA** usar fallbacks hardcoded com valores **secretos**: `service_role`, chaves de API privadas (`RESEND_API_KEY`, `VAPID_PRIVATE_KEY`, etc.) — esses **jamais** podem aparecer no frontend, nem como fallback.
- **SEMPRE** lançar erro explícito se um secret obrigatório estiver ausente em código server-side (Edge Functions).
- Manter `.env.example` atualizado com todas as variáveis necessárias.
- **NUNCA** commitar `.env` (está no `.gitignore`).

#### Exceção: credenciais PÚBLICAS do Supabase (URL + anon/publishable key)

- A `VITE_SUPABASE_URL` e a `VITE_SUPABASE_PUBLISHABLE_KEY` (anon key) são **públicas por design** — vão para o bundle JS de qualquer forma (o navegador precisa delas) e são protegidas por RLS. **Não são secretas.**
- A produção roda no **Lovable** (servido via Cloudflare em `gt3.omnx.pro`), que **não injeta variáveis `VITE_*` no build do frontend**. Por isso, essas duas credenciais (e o `VITE_SUPABASE_PROJECT_ID`) **podem** ter fallback hardcoded em `src/integrations/supabase/config.ts`.
- Regra do fallback: `import.meta.env` **sempre** tem prioridade (Vercel/local usam o `.env`); o valor hardcoded só entra quando a env var está ausente.
- Essa exceção é **restrita a essas credenciais públicas do Supabase**. Para qualquer outro valor, a regra "sem fallback hardcoded" continua valendo.

### Isolamento Multi-Tenant

- Toda query de dados **deve** incluir `.eq("tenant_id", tenantId)` além do RLS.
- O RLS é a primeira linha de defesa; o filtro explícito é a segunda — ambos são obrigatórios.
- Queries de join (ex: `employee_projects`, `tasks`) sempre filtram `tenant_id`.

### RBAC e Permissões

- Roles em tabela separada `user_roles` — **nunca** em `profiles`.
- Verificação de permissão centralizada em `usePermissions()`.
- Funções como `canModifyTask(task)` aplicam-se a **todos** os usuários — **nunca** use `if (isMember)` para condicionar a verificação (admins também passam pela função, que retorna `true` para eles).
- `canEdit` e `canModify` nunca devem defaultar para `true` quando a entidade não está carregada — default deve ser `false`.

### Auditoria e Trilhas

- Erros em logs de auditoria (ex: `employee_status_history`) **devem lançar exceção** — não engolir com `console.error`.
- Nunca reportar "sucesso" ao usuário se uma operação de auditoria falhou.

### Supabase Client

- `createClient` nunca recebe strings vazias — preferir erro explícito a falha silenciosa.
- Não editar `src/integrations/supabase/types.ts` (gerado automaticamente).
- **NUNCA** usar `service_role` key no frontend — apenas em Edge Functions server-side.

---

## 3. Regras de Código

### Hooks e Estado

- **Server state** → TanStack Query (React Query)
- **UI state local** → `useState` / `useReducer`
- **Auth state** → `useAuth()`
- **Permissões** → `usePermissions()`

**Regra crítica de hooks:** Nunca chamar o mesmo hook duas vezes no mesmo componente para separar dados de mutations:
```typescript
// ❌ ERRADO — dois estados independentes, mutations podem não re-renderizar dados
const { data: tasks } = useTasks(projectId);
const { createTask, moveTask } = useTasks(projectId);

// ✅ CORRETO — um único estado
const { data: tasks, createTask, moveTask } = useTasks(projectId);
```

### Invalidação de Cache (React Query)

- Invalidações devem ser **cirúrgicas** — nunca mais amplas que o necessário:
```typescript
// ❌ ERRADO — invalida todos os projetos/tenants
qc.invalidateQueries({ queryKey: ["tasks"] });

// ✅ CORRETO — invalida apenas o escopo atual
qc.invalidateQueries({ queryKey: ["tasks", tenantId, projectId] });
```

### Race Conditions em Auth

- `setLoading(false)` nunca deve disparar antes de `fetchProfile()` completar no evento `INITIAL_SESSION`.
- Padrão correto em `useAuth`:
```typescript
if (event === "INITIAL_SESSION") {
  setTimeout(async () => {
    await fetchProfile(session.user.id);
    setLoading(false);
  }, 0);
}
```

### TypeScript

- Evitar `as any` — usar tipos corretos ou generics.
- Evitar non-null assertion `!` fora de contextos onde o guard já foi verificado.
- Preferir `enabled: !!tenantId` em queries a usar `tenantId!` sem verificação.

### Design System

- **NUNCA** usar cores hardcoded (`bg-purple-600`, `text-gray-500`).
- **SEMPRE** usar tokens semânticos (`bg-primary`, `text-foreground`, `border-border`).
- Novas cores → adicionar em `src/index.css` como CSS variable → mapear em `tailwind.config.ts`.
- Consultar `docs/DESIGN-SYSTEM.md` antes de criar componentes visuais.

### Arquitetura de Componentes

- Componentes compartilhados → `src/components/shared/`
- Componentes de feature → `src/components/[feature]/`
- Páginas → `src/pages/`
- Hooks → `src/hooks/`

### Interatividade — Regra "Tudo Clicável"

- **TODA** informação exibida **DEVE** ser clicável e navegar para o contexto relevante.
- Cards de colaborador → modal/página do colaborador
- Nomes de projeto → `/projetos/:id`
- KPIs do Dashboard → página correspondente
- **NUNCA** exibir dado estático sem interação.

---

## 4. Regras de Qualidade

- [ ] Zero cores hardcoded
- [ ] Dark mode funcional
- [ ] Responsivo (mobile → desktop)
- [ ] Loading states (skeletons)
- [ ] Empty states com mensagens claras
- [ ] **Error states visíveis** — queries com `isError` devem exibir mensagem ao usuário
- [ ] Error handling com feedback visual (`toast.error`)
- [ ] Acessibilidade (aria labels, contraste, suporte a teclado)
- [ ] TypeScript sem `any` implícito

---

## 5. Processo de Desenvolvimento

```
1. VERIFICAR  → Ler ROADMAP.md — fase atual e tarefas pendentes
2. CONSULTAR  → Ler ARQUITETURA.md + PRD.md — requisitos e schema
3. ESTILIZAR  → Ler DESIGN-SYSTEM.md — tokens e componentes
4. IMPLEMENTAR → Código seguindo todas as regras acima
5. ATUALIZAR  → docs/ARQUITETURA.md, docs/ROADMAP.md (e PRD/DS se aplicável)
6. VERSIONAR  → Incrementar versão no ROADMAP e adicionar entry no Changelog
```

---

## 6. Checklist Pré-Commit

```
[ ] Código compila sem erros TypeScript
[ ] Zero cores hardcoded
[ ] Zero credenciais hardcoded (sem fallbacks || "valor-real")
[ ] Queries com .eq("tenant_id", tenantId) onde aplicável
[ ] Invalidações de cache com queryKey completo e restrito
[ ] RLS policies aplicadas em novas tabelas
[ ] ARQUITETURA.md reflete estado real (hooks, tabelas, segurança)
[ ] ROADMAP.md atualizado (tarefas concluídas + Changelog)
[ ] Funcionalidade testada no preview
```

---

## 7. Erros Comuns a Evitar

| Erro | Consequência | Regra |
|------|-------------|-------|
| Fallback hardcoded `\|\| "eyJ..."` em env vars | Credenciais expostas no bundle JS | Remover fallback; lançar erro explícito |
| Chamar o mesmo hook duas vezes | Estados divergentes, bugs em mutations | Desestruturar tudo de uma única chamada |
| Invalidar `{ queryKey: ["tasks"] }` | Invalida todos tenants/projetos | Usar `["tasks", tenantId, projectId]` |
| `if (isMember) { verificarPermissão }` | Admin bypassa verificação | Sempre chamar canModify() para todos |
| `canEdit={...condition... : true}` | Modal abre editável sem dados | Default deve ser `false` |
| `console.error` em auditoria | Sucesso falso reportado ao usuário | Lançar erro; mutação falha explicitamente |
| `setLoading(false)` antes de fetchProfile | Renders com `profile = null` | Aguardar fetchProfile no INITIAL_SESSION |
| `createClient(url \|\| '', key \|\| '')` | Falhas silenciosas em todas as queries | Lançar erro se vars ausentes |
| Adicionar tabela sem atualizar ARQUITETURA.md | Diagrama desatualizado | Sempre atualizar SQL + seção de tabelas |
| Criar hook sem listar em ARQUITETURA.md | Estrutura de diretórios incompleta | Adicionar na seção de hooks |
| Completar feature sem atualizar ROADMAP.md | Contexto perdido entre sessões | Marcar `[x]` + adicionar ao Changelog |

---

## 8. Referências Rápidas

| Recurso | Localização |
|---------|-------------|
| Supabase Client | `src/integrations/supabase/client.ts` |
| Tipos gerados (não editar) | `src/integrations/supabase/types.ts` |
| Design tokens | `src/index.css` |
| Tailwind config | `tailwind.config.ts` |
| Auth hook | `src/hooks/useAuth.ts` |
| Permissões hook | `src/hooks/usePermissions.ts` |
| Componentes compartilhados | `src/components/shared/SharedComponents.tsx` |
| HierarchyFilter | `src/components/shared/HierarchyFilter.tsx` |
| KanbanBoard | `src/components/shared/KanbanBoard.tsx` |
| Layout | `src/components/layout/AppLayout.tsx` |
| Router | `src/App.tsx` |
| useEmployees | `src/hooks/useEmployees.ts` |
| useTasks | `src/hooks/useTasks.ts` |
| useKanbanColumns | `src/hooks/useKanbanColumns.ts` |
| useProjects | `src/hooks/useProjects.ts` |
| useProcesses | `src/hooks/useProcesses.ts` |
| useHierarchyFilter | `src/hooks/useHierarchyFilter.ts` |
| useAreas | `src/hooks/useAreas.ts` |
| useMeetings | `src/hooks/useMeetings.ts` |
| useProcessFolders | `src/hooks/useProcessFolders.ts` |
| useProcessTags | `src/hooks/useProcessTags.ts` |
| useProcessAreas | `src/hooks/useProcessAreas.ts` |
| useWebhooks | `src/hooks/useWebhooks.ts` |
| useTenantBranding | `src/hooks/useTenantBranding.ts` |
| useProjectDocuments | `src/hooks/useProjectDocuments.ts` |
| usePublicDocument | `src/hooks/usePublicDocument.ts` |
| Export utils | `src/lib/export-csv.ts`, `export-diagram.ts`, `export-document.ts`, `export-markdown.ts` |

---

## 9. Supabase — Regras Específicas

- Usar migration tool para mudanças de schema (CREATE, ALTER, DROP)
- **NUNCA** modificar schemas reservados: `auth`, `storage`, `realtime`, `supabase_functions`, `vault`
- **NUNCA** usar foreign key direto para `auth.users` em queries client-side (usar `profiles`)
- **SEMPRE** vincular colaborador a `auth.users` — todo employee DEVE ter `user_id`
- **NUNCA** criar colaborador sem conta de acesso — usar Edge Function com `service_role`
- **CEO vs Admin:** CEO é título organizacional (`is_ceo` em `employees`), Admin é papel de acesso (`role='admin'` em `user_roles`). São conceitos separados.

---

## 10. Versionamento Semântico

| Tipo de mudança | Bump |
|-----------------|------|
| Feature nova | Minor: `7.3` → `7.4` |
| Bug fix / security / hotfix | Patch: `7.4.0` → `7.4.1` |
| Quebra de compatibilidade ou redesign major | Major: `7.x` → `8.0` |

Sempre atualizar "Status Atual" no topo do `docs/ROADMAP.md` e adicionar entry no Changelog.

---

## 11. Security Auditor — Quando Executar

A skill `/security-auditor` deve ser executada nos seguintes momentos, sem exceção:

| Momento | Obrigatório? |
|---------|--------------|
| Início do projeto (antes de codar) | ✅ Sim |
| Antes de qualquer deploy em produção | ✅ Sim |
| Após adicionar qualquer integração externa | ✅ Sim |
| Após adicionar nova tabela ou Edge Function | ✅ Sim |
| Quando solicitado pelo usuário | ✅ Sim |

> Toda diretriz, checklist e política de segurança detalhada vive dentro da skill `/security-auditor`.
