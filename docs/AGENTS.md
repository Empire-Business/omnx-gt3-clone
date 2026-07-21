# AGENTS.md - Diretriz de Desenvolvimento

> **Este é o arquivo mestre de diretrizes.** Todo desenvolvimento DEVE seguir estas regras.

---

## 1. Regra de Ouro: Documentação Sempre Atualizada

> ⚠️ **VIOLAÇÃO DESTA REGRA É O ERRO MAIS GRAVE POSSÍVEL.**
> Documentação desatualizada gera bugs silenciosos, retrabalho e perda de contexto entre sessões.

**Antes de implementar qualquer funcionalidade, leia os documentos abaixo. Após implementar, atualize-os.**

| Documento | Caminho | Propósito | Quando atualizar |
|-----------|---------|-----------|-----------------|
| **PRD.md** | `docs/PRD.md` | Requisitos e escopo do produto | Ao adicionar/remover features, mudar regras de negócio |
| **ARQUITETURA.md** | `docs/ARQUITETURA.md` | Estrutura técnica, modelo de dados, segurança | Ao criar/alterar tabelas, colunas, triggers, rotas, hooks, componentes |
| **DESIGN-SYSTEM.md** | `docs/DESIGN-SYSTEM.md` | Tokens, componentes, padrões visuais | Ao criar tokens, componentes, mudar cores/tipografia |
| **ROADMAP.md** | `docs/ROADMAP.md` | Tarefas, fases, checkpoints | Ao completar tarefas, adicionar novas, mudar prioridades |

### Fluxo obrigatório

```
1. Receber pedido do usuário
2. Ler docs relevantes (PRD, ARQUITETURA, DESIGN-SYSTEM, ROADMAP)
3. Planejar implementação alinhada com os docs
4. Implementar
5. ATUALIZAR DOCS — obrigatório, sem exceção (ver checklist abaixo)
6. Marcar tarefas concluídas no ROADMAP
```

### Checklist de atualização de docs (OBRIGATÓRIO após cada implementação)

**ARQUITETURA.md — atualizar se qualquer item abaixo mudou:**
- [ ] Coluna adicionada/removida/renomeada em qualquer tabela → atualizar SQL da tabela E diagrama ER
- [ ] Nova tabela criada → adicionar bloco SQL completo + RLS policies
- [ ] Trigger/function alterada → atualizar bloco SQL correspondente
- [ ] Rota adicionada/removida/renomeada → atualizar seção de rotas
- [ ] Hook criado/removido → atualizar árvore de diretórios
- [ ] Componente compartilhado criado/removido → atualizar árvore de diretórios
- [ ] Página criada/removida → atualizar árvore + seção de rotas
- [ ] Edge function criada/alterada → atualizar seção de Edge Functions

**PRD.md — atualizar se:**
- [ ] Feature adicionada/removida do escopo
- [ ] Regra de negócio alterada
- [ ] Persona ou fluxo de usuário mudou

**DESIGN-SYSTEM.md — atualizar se:**
- [ ] Novo token CSS criado
- [ ] Componente visual novo com variantes específicas
- [ ] Paleta de cores alterada

**ROADMAP.md — atualizar se:**
- [ ] Tarefa concluída → marcar checkbox
- [ ] Nova tarefa identificada → adicionar à fase correta
- [ ] Versão incrementada → atualizar changelog

---

## 2. Regras de Código

### Design System

- **NUNCA** usar cores hardcoded em componentes (`bg-purple-600`, `text-gray-500`)
- **SEMPRE** usar tokens semânticos (`bg-primary`, `text-foreground`, `border-border`)
- Novas cores → adicionar em `index.css` como CSS variable → mapear em `tailwind.config.ts`
- Consultar `docs/DESIGN-SYSTEM.md` antes de criar qualquer componente visual

### Arquitetura

- **NUNCA** armazenar roles na tabela profiles (usar tabela `user_roles` separada)
- **NUNCA** verificar permissões via localStorage/client-side
- **SEMPRE** usar `tenant_id` em todas as tabelas de dados
- **SEMPRE** habilitar RLS em todas as tabelas
- **SEMPRE** usar `security definer` functions para evitar recursão em RLS
- **CEO vs Admin:** CEO é título organizacional (flag `is_ceo` em employees), Admin é papel de acesso (role='admin' em user_roles). São conceitos separados.
- Consultar `docs/ARQUITETURA.md` antes de criar tabelas ou mudar schema

### Supabase

- Usar migration tool para mudanças de schema (CREATE, ALTER, DROP)
- Usar insert tool para operações de dados (INSERT, UPDATE, DELETE)
- **NUNCA** modificar schemas reservados: `auth`, `storage`, `realtime`, `supabase_functions`, `vault`
- **NUNCA** editar `src/integrations/supabase/types.ts` (gerado automaticamente)
- **NUNCA** usar foreign key direto para `auth.users` em queries client-side (usar `profiles`)
- **SEMPRE** vincular colaborador a `auth.users` — todo employee DEVE ter `user_id` (conta de login)
- **NUNCA** criar colaborador sem conta de acesso — usar Edge Function com `service_role` para criar auth.users
- **SEMPRE** lembrar: colaborador = usuário logado. Todos acessam o sistema conforme seu role (admin/manager/member)

### Interatividade — Regra "Tudo Clicável"

- **TODA informação exibida DEVE ser clicável e navegar para o contexto relevante**
- Cards de colaborador → abrir modal/página do colaborador
- Nomes de projeto → navegar para `/projetos/:id`
- Contadores/KPIs do Dashboard → navegar para a página correspondente (Colaboradores, Projetos, Tarefas, Áreas)
- Gráficos → navegar para a página do dado representado
- Nomes de pessoas em listas → abrir modal do colaborador
- Links de contato (email/telefone) → abrir `mailto:`/`tel:`
- **NUNCA** exibir dado estático sem interação — se existe dado, existe navegação

### Componentes

- Componentes compartilhados em `src/components/shared/`
- Componentes de feature em `src/components/[feature]/`
- Páginas em `src/pages/`
- Hooks em `src/hooks/`
- Preferir componentes pequenos e focados
- Usar shadcn/ui como base

### Estado

- Server state → TanStack Query (React Query)
- UI state local → useState/useReducer
- Auth state → hook `useAuth()`
- Permissões → hook `usePermissions()`

---

## 3. Regras de Segurança

1. **RBAC:** Roles em tabela separada (`user_roles`), nunca em `profiles`
2. **RLS:** Toda tabela com RLS habilitado, policies usando `security definer` functions
3. **Multi-tenant:** Isolamento por `tenant_id` em TODAS as policies
4. **Auth:** Rotas protegidas, redirect para `/auth` se não logado
5. **Secrets:** Nunca hardcodar API keys, usar Supabase secrets
6. **Input:** Sanitizar inputs, usar Zod para validação

---

## 4. Regras de Qualidade

- [ ] Zero cores hardcoded
- [ ] Dark mode funcional
- [ ] Responsivo (mobile → desktop)
- [ ] Loading states (skeletons)
- [ ] Empty states com mensagens claras
- [ ] Error handling com feedback visual
- [ ] Acessibilidade (aria labels, contraste, teclado)
- [ ] TypeScript strict (sem `any`)

---

## 5. Processo de Desenvolvimento

### Para cada feature:

```
1. VERIFICAR  → Ler ROADMAP.md para saber a fase atual
2. CONSULTAR  → Ler PRD.md para entender requisitos
3. PLANEJAR   → Ler ARQUITETURA.md para alinhar com schema
4. ESTILIZAR  → Ler DESIGN-SYSTEM.md para seguir tokens
5. IMPLEMENTAR → Código seguindo todas as regras acima
6. TESTAR     → Verificar funcionalidade no preview
7. ATUALIZAR  → Marcar checkbox no ROADMAP, atualizar docs se necessário
```

### Ordem de execução do ROADMAP:

```
Fase 1 (Auth) → Fase 2 (Dados) → Fase 3-7 (Features) → Fase 8 (RBAC) → Fase 9 (Multi-tenant) → Fase 10 (Polish)
```

---

## 6. Checklist Pré-Commit

Antes de finalizar qualquer implementação, **TODOS os itens devem ser verificados**:

```
[ ] Código compila sem erros
[ ] Todas as cores via tokens (zero hardcoded)
[ ] RLS policies aplicadas em novas tabelas
[ ] tenant_id incluído em novas tabelas
[ ] ARQUITETURA.md reflete o estado REAL do banco (colunas, tabelas, triggers, rotas, hooks)
[ ] PRD.md atualizado se features mudaram
[ ] DESIGN-SYSTEM.md atualizado se tokens/componentes mudaram
[ ] ROADMAP.md atualizado com tarefas concluídas e versão incrementada
[ ] Funcionalidade testada no preview
```

> **Se qualquer doc ficou desatualizado, a implementação NÃO está completa.**

---

## 7. Erros Comuns a Evitar

| Erro | Consequência | Regra |
|------|-------------|-------|
| Adicionar coluna no banco sem atualizar ARQUITETURA.md | Diagrama ER e SQL ficam incorretos | Sempre atualizar SQL + ER ao mexer no schema |
| Remover campo e não remover da doc | Próxima sessão usa info errada | Grep pela coluna removida em todos os docs |
| Mudar rota sem atualizar seção de rotas | Doc aponta para rotas inexistentes | Atualizar bloco de rotas em ARQUITETURA.md |
| Criar hook/componente sem listar na árvore | Estrutura de diretórios fica incompleta | Atualizar árvore de diretórios |
| Alterar trigger sem atualizar doc | Lógica documentada diverge da real | Atualizar bloco SQL do trigger |
| Mudar cores de área sem atualizar referência | Cores erradas no organograma doc | Atualizar referências visuais |

---

## 8. Referências Rápidas

| Recurso | Localização |
|---------|-------------|
| Supabase Client | `src/integrations/supabase/client.ts` |
| Tipos gerados | `src/integrations/supabase/types.ts` |
| Design tokens | `src/index.css` |
| Tailwind config | `tailwind.config.ts` |
| Componentes compartilhados | `src/components/shared/SharedComponents.tsx` |
| **HierarchyFilter** | `src/components/shared/HierarchyFilter.tsx` |
| **MarkdownViewer** | `src/components/shared/MarkdownViewer.tsx` |
| Layout | `src/components/layout/AppLayout.tsx` |
| Router | `src/App.tsx` |
| **useHierarchyFilter** | `src/hooks/useHierarchyFilter.ts` |
| **useMarkdown** | `src/hooks/useMarkdown.ts` |
| useEmployees | `src/hooks/useEmployees.ts` |
| useProjects | `src/hooks/useProjects.ts` |
| useProcesses | `src/hooks/useProcesses.ts` |

---

## 9. Novidades V2.1 (Fase 4)

### Filtros Hierárquicos (Área → Subárea → Cargo)
Implementados em todas as listagens (Colaboradores, Projetos, Processos):
- Hook: `useHierarchyFilter()` — gerencia estado em cascata
- Componente: `HierarchyFilter` — UI de selects dinâmicos
- Badges: `HierarchyFilterBadges` — mostra filtros ativos

### Processos Vinculados à Estrutura
- Nova tabela: `process_positions` (muitos-para-muitos)
- Colunas: `area_id`, `subarea_id` em `processes` (denormalizado)
- View: `processes_hierarchy_view`
- Hook atualizado: `useProcesses()` com filtros hierárquicos

### Cards de Colaborador Aprimorados
- Métricas: `pending_tasks`, `active_projects`, `tasks_completed_this_week`
- Barra de progresso semanal
- Indicadores visuais de carga de trabalho
- View: `employees_hierarchy_view`

### Markdown Viewer Profissional
- Hook: `useMarkdown()` — processamento com remark-gfm
- Componente: `MarkdownViewer` — renderização profissional
- Features: TOC automática, syntax highlighting, tabelas GFM, checkboxes
- Modos: view (renderizado) / edit (editor)

### Regras de Uso
- **Filtros hierárquicos:** Usar em todas as listagens que envolvem colaboradores
- **Processos:** Vincular a pelo menos um cargo ao criar
- **Markdown:** Sempre usar MarkdownViewer para exibir documentação
- **Cores:** Badges de área usam `area_color` do banco (dinâmico)
