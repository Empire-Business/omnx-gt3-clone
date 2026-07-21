Vou transformar o processamento de reuniões em um pipeline resiliente, com progresso real, limites controlados e recuperação automática, para não ficar preso em “Processando IA”.

## Diagnóstico

O processamento atual já retornou sucesso nos logs para a reunião `00533560-ec62-4754-abf3-536672c9cc0e` com 13 tarefas, mas ainda há risco estrutural de ficar preso porque:

- O status da reunião usa apenas `processing/completed`, sem fase, porcentagem, job id ou heartbeat.
- O frontend depende de polling do status e não mostra se os chunks estão avançando.
- O Edge Function processa chunks em paralelo sem limite de concorrência; isso pode disparar rate limit do OpenRouter/Gemini em reuniões grandes.
- A consolidação final ainda pode receber JSON grande demais quando muitos chunks retornam muitos detalhes.
- Se o background job morrer por timeout/plataforma antes do `catch`, o status pode continuar `processing`.

## O que será implementado

### 1. Tabela de jobs para IA de reuniões
Criar uma tabela `meeting_ai_jobs` com RLS por `tenant_id` para rastrear cada reprocessamento:

- `meeting_id`, `tenant_id`, `created_by`
- `status`: `queued`, `processing`, `completed`, `failed`, `cancelled`
- `phase`: `chunking`, `extracting`, `consolidating`, `saving`
- `progress`: 0 a 100
- `total_chunks`, `processed_chunks`, `failed_chunks`
- `started_at`, `finished_at`, `heartbeat_at`
- `error_message`
- `result_summary`/metadata leve

Isso permite saber exatamente onde travou, sem depender só do status da reunião.

### 2. Edge Function `meeting-ai` em modo job resiliente
Refatorar o processamento para:

- Criar um job antes de começar.
- Atualizar progresso a cada chunk processado.
- Usar concorrência limitada, por exemplo 2 chunks simultâneos, em vez de `Promise.all` ilimitado.
- Implementar retry com backoff para 429/rate limit.
- Usar timeout por chamada de IA para não esperar indefinidamente.
- Persistir heartbeat durante o processamento.
- Sempre finalizar o job como `completed` ou `failed`.
- Sempre destravar a reunião, voltando `meetings.status` para `completed` quando falhar.

### 3. Estratégia eficiente para reuniões grandes
Para transcrições grandes, mudar de “extrair tudo com máximo detalhe em todos os chunks” para pipeline em etapas:

1. Normalização e divisão em chunks menores e estáveis.
2. Extração objetiva por chunk: tarefas, responsáveis, decisões e pontos críticos.
3. Redução intermediária se houver muitos chunks.
4. Consolidação final apenas com o material já reduzido.

Assim a IA não recebe um JSON gigantesco na etapa final e a chance de timeout cai bastante.

### 4. Idempotência e reprocessamento seguro
Adicionar controle para evitar múltiplos reprocessamentos simultâneos da mesma reunião:

- Se já houver job `queued/processing` com heartbeat recente, o botão apenas acompanha esse job.
- Se houver job antigo sem heartbeat, ele será marcado como `failed/stale` e um novo poderá iniciar.
- Reprocessar com `force: true` limpará/substituirá os resultados anteriores de IA de forma explícita.

### 5. Frontend com progresso real
Atualizar `useMeetings.ts` e `Reunioes.tsx` para:

- Enviar `force: true` ao clicar em “Reprocessar IA”.
- Exibir barra de progresso e fase atual: “Extraindo 3/8”, “Consolidando”, “Salvando”.
- Mostrar erro visível se o job falhar, com botão “Tentar novamente”.
- Parar o polling quando o job terminar, evitando sensação de processamento infinito.
- Ajustar o toast: em vez de “Transcrição processada pela IA” logo após o `202`, mostrar “Processamento iniciado”.

### 6. Recuperação de reuniões presas
Criar uma migration/SQL de correção para destravar jobs/reuniões antigos:

- Jobs sem heartbeat recente serão marcados como `failed`.
- Reuniões em `processing` há muito tempo voltarão para `completed`, preservando `transcript_raw` e registrando o erro em `metadata.ai_error`.

Também vou aplicar isso para a reunião atual se ela ainda estiver presa.

### 7. Documentação obrigatória
Atualizar:

- `docs/ARQUITETURA.md`: nova tabela `meeting_ai_jobs`, RLS, Edge Function e fluxo.
- `docs/PRD.md`: capacidade de IA de reuniões grandes com progresso e recuperação.
- `docs/DESIGN-SYSTEM.md`: caso haja novo componente visual de progresso/estado.
- `docs/ROADMAP.md`: marcar a entrega e adicionar changelog/versionamento.

## Arquitetura técnica proposta

```text
Clique em Reprocessar IA
        |
        v
meeting-ai cria/retorna job
        |
        v
UI mostra job.progress + job.phase
        |
        v
Edge Function em background
  - chunking
  - extração com concorrência limitada
  - retries/backoff
  - consolidação reduzida
  - save resultados
        |
        v
job completed/failed
        |
        v
meeting status completed
        |
        v
aba Aprovação libera tarefas geradas
```

## Critérios de aceite

- Reuniões grandes não ficam indefinidamente em “Processando IA”.
- O usuário vê progresso real e fase atual.
- Rate limit da IA não quebra o processamento inteiro sem retry.
- Falhas destravam a reunião e aparecem como erro acionável.
- Reprocessar não cria múltiplos jobs concorrentes para a mesma reunião.
- Tarefas geradas continuam aparecendo no fluxo atual de aprovação.
- Multi-tenant preservado por `tenant_id` + RLS.
- Documentação atualizada conforme as regras do projeto.