# AGENTS.md — GT3 / Empire Manager Project Rules

> Este arquivo sincroniza as regras do CLAUDE.md para todos os agentes de AI
> (Lovable, Cursor, Windsurf, Codex, Jules, etc.). Fonte de verdade: `CLAUDE.md`.
> Gerado e mantido automaticamente pela skill omnx-code. Não edite manualmente.

---

## Stack obrigatória

- React 18 + TypeScript strict + Vite
- Tailwind CSS + shadcn/ui + Radix UI + Framer Motion
- Supabase (auth + database + RLS multi-tenant por `tenant_id`)
- TanStack Query v5 (server state)
- Vercel (deploy)
- Nunca introduza dependências fora desta stack sem aprovação explícita do usuário

## Regras de segurança (inegociáveis)

- NUNCA use `SUPABASE_SERVICE_ROLE_KEY` no frontend ou em qualquer código client-side
- NUNCA exponha chaves de API, tokens ou secrets em código commitado
- NUNCA use fallbacks hardcoded: `|| "https://real.supabase.co"` ou `|| "eyJ..."` em nenhum arquivo
- NUNCA crie arquivos `.env` sem garantir que estão listados no `.gitignore`
- Sempre ative Row Level Security (RLS) em todas as tabelas do Supabase
- Toda query de dados DEVE incluir `.eq("tenant_id", tenantId)` além do RLS (dupla proteção)
- `canEdit` e `canModify` nunca defaultam para `true` — default SEMPRE `false` quando entidade não carregada
- Ao detectar qualquer violação dessas regras no código existente, reporte imediatamente antes de continuar

## Regras de Git (inegociáveis)

- `.env`, `.env.*`, `*.pem`, `*.key` e arquivos com chaves sempre no `.gitignore`
- Commits seguem Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- Nunca use mensagens genéricas: `update`, `ajustes`, `misc`, `wip`, `temp`, `fix stuff`
- Nunca force-push na branch `main`
- Nunca delete ou renomeie a branch `main`

## Regras de acesso Lovable (inegociáveis)

- Nunca remova deploy keys do GitHub Settings deste repositório
- Nunca revogue o OAuth app "Lovable" na conta GitHub
- Nunca renomeie ou transfira o repositório sem antes reconectar no painel do Lovable
- O diretório `.lovable/` e arquivos `lovable.config.*` são somente leitura — nunca edite, mova ou delete sem instrução explícita do usuário seguida de confirmação
- Nunca altere a visibilidade do repositório de forma que bloqueie o acesso do Lovable

## Comandos OMNX

- `/omnx-code` — modo de trabalho normal (codar, documentar, refatorar)
- `/omnx-code atualizar skill` — atualiza omnx-code + security-auditor + AGENTS.md
- `/security-auditor` — auditoria de segurança completa + correção automática

## Fluxo de desenvolvimento

- Antes de codar qualquer feature: leia `docs/ARQUITETURA.md`, `docs/ROADMAP.md`, `docs/PRD.md`
- Se não existirem → crie esses documentos primeiro. Não comece a codar sem eles
- Toda documentação técnica vai para `docs/[NOME].md`
- O `CLAUDE.md` é um índice enxuto — nunca coloque documentação longa diretamente nele
- Ao remover uma feature: delete o código, o doc em `docs/` e a entrada no índice do `CLAUDE.md`
- Sempre atualizar `docs/ROADMAP.md` após implementar (marcar `[x]` + Changelog)

## Arquitetura multi-tenant

- Sistema SaaS com isolamento por `tenant_id` em todas as tabelas
- CEO = título organizacional (`is_ceo` em `employees`) — diferente de Admin
- Admin = papel de acesso (`role='admin'` em `user_roles`)
- Nunca confundir CEO com Admin — são conceitos separados

## Comunicação

- Responda sempre em português brasileiro
- Explique o que vai fazer antes de fazer
- Nunca tome ações irreversíveis sem confirmação explícita do usuário

---

Se o usuário pedir algo que viole as regras acima (usar `service_role_key`, force-push em `main`, remover deploy key do Lovable, fallbacks hardcoded), **recuse, explique o motivo e sugira a alternativa segura**.

---

> Sincronizado com `CLAUDE.md` pela skill omnx-code.
> Para documentação completa do projeto, leia o `CLAUDE.md` e os arquivos em `docs/`.
> Versão do template: omnx-code v1.7 | Criado em: 2026-04-22
