# Roadmap - GT3

## Status Atual: v8.30.0

---

## ✅ Concluído

### v8.30.0 - Tarefas: fim do erro ao comentar (RLS) + notificação de comentário + "Perguntar no chat" (2026-07-20)
Bug relatado (Bruno, print): ao comentar numa tarefa aparecia **"new row violates row-level security policy for table task_comments"**. Causa raiz: a policy de INSERT exige `tenant_id = get_user_tenant_id()`, mas o build em produção (Lovable, divergente do `main`) **não enviava `tenant_id`** no insert → caía como `NULL` → viola o `WITH CHECK`. Fix independente do build + duas features pedidas.
- [x] **Fix RLS (migration `20260720120000_task_comments_autofill_tenant.sql`):** trigger `BEFORE INSERT` `trg_task_comments_fill_tenant` preenche `tenant_id` a partir da própria `tasks` quando o cliente omite. Aplicado direto em produção e **testado com RLS ativo** (insert sem `tenant_id` passa a funcionar). Resolve sem depender de republicar o Lovable
- [x] **Notificação de comentário (`TaskDetailModal.tsx`):** ao comentar, `sendCommentNotifications` avisa **responsáveis da tarefa + quem já comentou** (exceto o autor e quem já recebeu notificação de menção), tipo `task_comment`, link `/tarefas?taskId=<id>`. Consumido automaticamente pelo sino (`useNotifications`/`NotificationsPopover`)
- [x] **"Perguntar no chat" (`TaskDetailModal.tsx`):** botão na barra de ações da tarefa (visível quando há responsável com acesso, ≠ usuário atual). Abre dialog com pergunta opcional → `findOrCreateDM` (DM 1:1 com o responsável) → envia mensagem com **card da tarefa** (`attachments: [{type:"task", ...}]`, renderizado pelo `TaskCard` existente no chat) → RPC `create_chat_task_notification` (respeita mute) → navega para `/chat/:dmId`. Fluxo **testado ponta a ponta no banco com RLS ativo** (DM + mensagem-card + notificação do responsável)

### v8.29.1 - Tarefas: fim da perda de título/descrição ao criar + rascunho automático (2026-07-15)
Bug relatado (Bruno): às vezes, ao selecionar responsável/projeto no cadastro de tarefa, o título e a descrição já digitados **sumiam**. Causa raiz: o formulário "Nova Tarefa" guarda o estado em `useState` dentro do `KanbanBoard`, e a página `Tarefas.tsx` **desmontava o board inteiro** (skeleton) sempre que `tasks === undefined` — o que ocorria num piscar quando `profile`/`tenant_id` oscilava para `null` (refresh de token / foco de janela), mudando a `queryKey` e desabilitando a query. Board desmonta → estado do form destruído → reabre vazio (daí o caráter intermitente).
- [x] **`useTasks.ts`:** `placeholderData: keepPreviousData` na query de tarefas — `tasks` nunca mais volta a `undefined` após o 1º load, então o board não desmonta em blips de sessão/refetch. (Correção cirúrgica da causa raiz.)
- [x] **Rascunho automático (`KanbanBoard.tsx`):** o formulário de **criação** persiste continuamente em `localStorage` (`omnx:taskdraft:<projectId|global>`) enquanto aberto; ao reabrir (inclusive após refresh), restaura título/descrição/prioridade/status/projeto/responsável/data/checklist; limpa ao criar com sucesso. Proteção definitiva: nada se perde nem numa recarga completa. Validado no Playwright (reload → restaurado). Anexos (File) não são persistidos.

### v8.29.0 - Processos: fluxograma visual repaginado (editor rico, novos elementos, export confiável) (2026-07-15)
Redesign do construtor de fluxograma (BPMN) dos Processos, que estava limitado e com bugs. Sem migration — `processes.flow_data` (jsonb) continua compatível; todos os campos novos são opcionais.
- [x] **Núcleo compartilhado `flow-core.tsx`** (`src/components/processes/flow-core.tsx`) — acaba com a lógica de layout **triplicada** (antes copiada em `ProcessFlow`/`DiagramViewer`/`DiagramEditor`) e a divergência `TB`×`LR`. Centraliza tipos `FlowNode`/`FlowEdge`/`FlowData`, `nodeTypes`, dimensões, `makeEdges` (respeita `edge.type`/`animated`), `toReactFlowNode` (agora propaga `phase` e `color` ao `data` — antes o viewer perdia), `layoutNodes` (dagre + swim-lane) e `autoLayoutNodes`. `ProcessFlow.tsx` re-exporta `FlowData` para não quebrar imports
- [x] **Modelo estendido (retrocompatível):** `FlowNode.type` ganhou `document | data | event` (além de start/end/task/decision/subprocess/note); `FlowNode.color?` (chave semântica `primary|success|warning|danger|info|neutral` → tokens do DS, zero hardcode); `FlowEdge.type?` (smoothstep/straight/step/bezier) e `FlowEdge.animated?`
- [x] **Nós repaginados (`BpmNodes.tsx`):** ícone + acento de cor por tipo, **handles ocultos que aparecem no hover/seleção**, start (verde) × end (vermelho) diferenciados, decisão (losango) com melhor ajuste, novos `document` (base ondulada), `data` (paralelogramo) e `event` (círculo), e **faixa de swim-lane desenhada** (`laneBackground`) atrás dos nós
- [x] **Editor rico (`DiagramEditor.tsx`):** **drag-and-drop** da paleta para o canvas (além de clique), **IDs via `crypto.randomUUID()`** (fim das colisões), **undo/redo real** (captura add/connect/delete/drag/edição, com `Ctrl+Z`/`Ctrl+Shift+Z`), **edição de conexões** (rótulo, estilo da linha, animada, excluir), painel de propriedades com **cor/tipo/fase**, barra com auto-organizar/ajustar-à-tela/duplicar/grade. Envolto em `ReactFlowProvider`
- [x] **Export confiável (`export-diagram.ts` + `ExportDialog.tsx`):** o dialog agora renderiza o **diagrama completo off-screen** e captura esse elemento (fim do bug de recortar o `ProcessFlow` embutido pequeno); fundo do export **sensível ao tema**; novo **"Copiar imagem"** (PNG para a área de transferência)
- [x] **Schema da IA (`process-ai`):** enum de tipos ganhou `note/document/data/event` e `color` opcional (código pronto; **deploy da edge function pendente** — produção roda no Lovable)

### v8.28.0 - Central de Integrações (Fase 1): features acendem/ocultam por presença de chave (2026-07-13)
Cada função que depende de API externa **acende sozinha** quando a chave correspondente está conectada no ambiente do clone; se não estiver, a função fica **oculta** em toda a plataforma (não desabilitada/quebrada). Regra: `visível = (chave presente E saudável) E NOT desligada_manualmente`. **Fail-open** em dúvida/erro/carregando (nunca perturba a produção atual, que já tem todas as chaves).
- [x] **Gating por feature** — `meetings` (LiveKit) gateia a aba Reuniões, `/reunioes`, `/meet/:roomId` e huddles (`/chat/:channelId/huddle`); `ai` (OpenRouter) gateia transcrição de áudio, resumo de reunião e a assistente Clara/CAMI; `recording` (S3) gateia gravação MP4; `email` (Resend) gateia o digest de e-mail; `push` (VAPID) gateia web push. **Dependência:** `meetings` é a raiz do módulo de reunião; `ai` e `recording` são camadas independentes que ligam/desligam por cima **sem derrubar a reunião ao vivo**
- [x] **Tabela `tenant_features`** (migration `20260713140000_tenant_features.sql`) — guarda **apenas** o override manual (`manually_disabled`) por `(tenant_id, feature_key)`; **nenhuma chave de API vive no banco**. RLS: SELECT por membro do tenant (dirige o gate), INSERT/UPDATE/DELETE só admin
- [x] **Edge Function `integrations-status`** — só leitura; reporta presença (`available`) de cada secret para qualquer usuário autenticado (dirige o gate) + ping leve de validação (`probe=1`, admin-only) para OpenRouter (`/api/v1/models`) e Resend (`/domains`). **Nunca** devolve valores de segredos
- [x] **Hook `useIntegrations`** (`src/hooks/useIntegrations.ts`) — combina status + overrides; `isActive(key)`, `getFeature(key)`, `features`, `setManuallyDisabled` (invalida `["tenant-features", tenantId]`). Fail-open
- [x] **`FeatureRoute`** (`src/components/auth/FeatureRoute.tsx`) — guard de rota que redireciona para `/dashboard` quando a feature não está ativa (fail-open). `App.tsx` envolve `/reunioes`, `/meet/:roomId` e `/chat/:channelId/huddle` em `<FeatureRoute feature="meetings">`
- [x] **`AppSidebar.tsx`** — `NavItem` ganhou campo `feature?`; item Reuniões marcado com `feature="meetings"`; filtro de visibilidade do menu passou a considerar `isFeatureActive`
- [x] **Gate `ai` na Clara e transcrição** — `Chat.tsx` esconde o item "Clara", o slash `/ai`, o botão "Pergunte a Clara" (barra e menu de contexto) e o `CamiPanel` quando OpenRouter não está conectado; `AudioPlayer.tsx` (chat/feed) gateia o botão de transcrever e a auto-transcrição por `ai`
- [x] **Aba "Integrações" em Configurações** — `IntegrationsCard` (`src/components/settings/IntegrationsCard.tsx`, admin-only): status por serviço + toggle de override + link "obter chave". A grade de abas em `Configuracoes.tsx` passou de 5 para 6 colunas
- [x] **UI da Clara** — pills de "Ações rápidas" com `flex-wrap` (fim do scroll lateral) + visual refinado; correção de cor hardcoded (`emerald` → token `success`)
- [ ] **Fase 2 (planejada):** conexão de chave pela própria UI via **Supabase Vault**, com resolução **Vault → env** nas Edge Functions existentes

### v8.27.0 - Perfil: aniversário (🎉 no card do DM) e central de notificações (push/som) (2026-07-13)
- [x] **Aniversário no perfil** (Bruno): novo campo **"Aniversário"** no Perfil (`profiles.birth_date`, migration `20260713160000`). No **card do DM da pessoa na sidebar** aparece **"🎉 Hoje é meu aniversário!"** quando é o dia (compara só mês/dia; o ano nunca é exibido). O `birth_date` é buscado em **query separada e best-effort** (`useChat.ts`) — se a migration ainda não estiver aplicada, apenas não mostra o 🎉, sem quebrar nomes/avatares dos DMs
- [x] **Central de notificações no Perfil** (Bruno): faltava um lugar fixo pra ativar (só existia o banner que sumia). Novo card `NotificationSettings` (acessível a **todos**, no Perfil): **mobile → toggle de push**, **desktop → toggle do som** da notificação. Regra do produto: ambos **ligados por padrão** (som via `localStorage` com gate em `playNotifSound()`), só desativa quem quiser. Desligar o push remove a subscription do aparelho

### v8.26.0 - Chat: push no Android (webview + erro visível) e fix do reply estourando a tela no mobile (2026-07-13)
- [x] **Balão de resposta estourava a borda da tela no mobile** (Bruno): "quando mando respondendo a msg ela passa da borda da tela do telefone". Causa: a coluna do balão tinha `max-w-[85%]` mas, como flex item, herdava `min-width:auto` — e o quote da resposta usa `truncate` (`white-space:nowrap`), cuja largura mínima de conteúdo (a linha inteira) **vencia o `max-width`** e empurrava a coluna além da tela. Fix: `min-w-0` na coluna do balão (`Chat.tsx`), deixando o `max-w` + truncate agirem
- [x] **Push no Android — diagnóstico real + correções de UX** (Bruno): investigação em produção mostrou **0 subscriptions com user_agent Android** (os endpoints `fcm.googleapis.com` eram Chrome desktop; `fcm.googleapis.com` é usado por todo Chrome). Ou seja: **o Android nunca registra a subscription** — não é problema de entrega. Correções em `usePushNotifications.ts` + `PushNotificationOptIn.tsx`: (1) **detecção de webview** (Instagram/Facebook/etc.) — banner passa a orientar "Abrir no Chrome" em vez de sumir; (2) **falhas visíveis** — `subscribeNow` lança erro descritivo (webview / perfil carregando / subscribe rejeitado) em vez de falhar em silêncio; (3) **opt-in reabrível** — quando a permissão está `denied`, o banner mostra orientação + "Tentar de novo" (antes sumia pra sempre)
### v8.25.1 - Segurança: correção de 6 brechas críticas de isolamento multi-tenant (2026-07-13)
- [x] **Brecha 1 (Crítica):** `profiles_update_own` sem `WITH CHECK` deixava qualquer usuário trocar o próprio `tenant_id` e ver dados de outra empresa. Corrigido com `WITH CHECK` travando `tenant_id` via `get_user_tenant_id()`. Migration `20260713100000`.
- [x] **Brecha 2 (Crítica):** `handle_new_user` honrava `invited_tenant_id` do metadata (controlável no F12) sem validar convite. Criada tabela `tenant_invitations` (tenant+email+token) e validação no trigger; `create-employee`/`create-tenant` emitem o convite. Migration `20260713110000`.
- [x] **Brecha 3 (Crítica):** `create-employee` migrava conta de usuário de outro tenant (sequestro + senha nova). Agora recusa **409** sem migrar nem gerar senha.
- [x] **Brecha 4 (Crítica):** `manage-access` excluía `get_user_info` da checagem de isolamento. Isolamento agora vale para todas as ações; ausente = negar.
- [x] **Brecha 5 (Crítica):** `ensure_area_channel`/`ensure_omnx_bot`/`ensure_system_bot` (SECURITY DEFINER) chamáveis via RPC com tenant arbitrário. `REVOKE` de anon/authenticated; só `service_role`. Migration `20260713120000`.
- [x] **Brecha 6 (Alta):** `send-chat-notification` e `process-ai` sem autenticação. Agora exigem JWT (`auth.getUser()`).
- [x] **Achado extra:** `UserManagement` puxava perfis/roles dos colegas antes do guard de admin — query agora gated por `isAdmin`.
- [x] **Marca:** strings "Empire Manager" → "OMNX GT3" (bots de IA, e-mails de convite, transcrições).
- [x] Docs: `docs/SEGURANCA.md` (registro + deploy + testes) e `security-report/audit-2026-07-13.md`.
- ⚠️ **Pendente de deploy manual** (`supabase db push` + `functions deploy`) e ações do dono no Dashboard (revogar token vazado, CAPTCHA, rate limits). Ver `docs/SEGURANCA.md`.

### v8.25.0 - Chat: performance ao receber msg, status de entrega e ícones de anexo na sidebar (2026-07-13)
- [x] **Chat travava ao receber mensagem** (Bruno): "às vezes a msg chega, tem som de notificação e o chat meioq fica travado". Causa: `MessageRow` **não era memoizado** e a query de mensagens **recria os objetos** a cada refetch — então toda nova mensagem re-renderizava a **lista inteira**. Agora `MessageRow` é `React.memo` com **comparador custom** (`Chat.tsx`) que compara só os dados que afetam o render (id, content, edited_at, reactions, status, etc.) e ignora os callbacks inline (closures que capturam apenas `m.id` e setters estáveis — seguros de ignorar). Resultado: só a mensagem nova (e a que deixou de ser a última) re-renderiza
- [x] **"Não recebi a msg mesmo com a aba aberta"** (Bruno): o realtime chamava `.subscribe()` **sem tratar status** — se a conexão caísse, ficava mudo até o polling de 5s/30s. Agora `useChatMessages` e `useChatLastMessages` fazem **refetch de catch-up ao (re)conectar** (status `SUBSCRIBED`) e o canal de mensagens **se reinscreve** sozinho após `CHANNEL_ERROR`/`TIMED_OUT` (backoff de 3s), fechando a janela em que mensagens se perdiam
- [x] **Status de entrega estilo WhatsApp na sidebar** (Bruno): o card só mostrava ✓ (enviado) ou ✓✓ azul (lido). Agora tem **3 estados** em DMs quando a última msg é minha — ✓ cinza (**enviado**), ✓✓ cinza (**entregue** = a outra pessoa está/esteve online após o envio, via `chat_presence` + `other_user_id`) e ✓✓ azul (**lido**) — reaproveitando a mesma lógica já usada no balão da mensagem
- [x] **Ícone do tipo de anexo no preview da sidebar** (Bruno): "se a msg for áudio/imagem/arquivo, o card não indica o que é". O preview agora exibe um **ícone lucide** (imagem/vídeo/áudio/tarefa/reunião/chamada/enquete/publicação/anexo) antes do texto, **sempre** que a última mensagem tem anexo — inclusive quando há legenda de texto junto
- [ ] **Push no Android (em investigação)** (Bruno): iOS recebe, Android não. Diagnóstico corrigido — **não é falta de `gcm_sender_id`** (Web Push com VAPID não usa GCM/Firebase); a criptografia `aes128gcm` e o VAPID estão corretos (o iOS, mais rígido, prova isso). Próximo passo: checar em produção se há endpoints `fcm.googleapis.com` em `push_subscriptions` e o status de retorno do FCM nos logs da `send-chat-notification`; possível endurecimento = persistir a subscription rotacionada a partir do Service Worker (`pushsubscriptionchange`)

### v8.24.0 - Marca: favicon OMNX (wordmark empilhada) e seletor de hub com lockup OMNX (2026-07-10)
- [x] **Favicon com a marca OMNX** (Bruno): "coloca essa logo do omnx tbm no favicon... de uma forma q não quebre" + "fica fiel à logo original". Como a logo é um **lockup horizontal** (ilegível em 16×16), o favicon virou um **chip quadrado** (`public/favicon-omnx.png`, 512px) com a wordmark **empilhada `OM` / `NX`** — gerada a partir da **arte real** (`omnx-logo-light.png` recortada em OM/NX via `jimp`), preservando o "O" em anel e o "X" azul da marca, sobre fundo grafite `#0D1829` (o mesmo `theme-color`). PNG rasterizado ⇒ **não depende de webfont** e não quebra em nenhum navegador; fundo próprio ⇒ legível em aba clara e escura. `index.html` usa `favicon-omnx.png?v=5` (+ `favicon.ico?v=5` como fallback), o `manifest.json` (ícone PWA) e o `apple-touch-icon` também apontam pra ele. **Fix do "pisca e volta":** `useTenantBranding` reescreve o favicon em runtime e caía em `BRAND.favicon` (`/logo.png` antigo) quando o tenant não tem favicon próprio — `BRAND.favicon` passou a ser `/favicon-omnx.png?v=5`
- [x] **Seletor de hub com lockup OMNX + nome da plataforma** (Bruno): "no seletor... removesse aquela logo, e fica o OMNX e o nome da plataforma (OMNX Desk / GT3)". O botão do workspace e os 3 itens do dropdown "Trocar de hub" (`AppSidebar.tsx`) **deixaram de exibir o quadrado com a logo do tenant / iniciais**; agora usam o `OmnxLockup` com a palavra do hub (`GT3`, `Desk`, `CRM`) — cada item mostra `OMNX | Nome` no topo e a descrição embaixo. Vars `logoUrl`/`shortTenantName` removidas (sem uso)
- [x] **Fonte da palavra do produto → Chakra Petch** (Bruno): "utilizar uma fonte muito parecida com a da logo". O `OmnxLockup` passou a renderizar a palavra do produto em **Chakra Petch** (geométrica/técnica, cantos chanfrados — próxima da wordmark OMNX), com fallback para Space Grotesk. Fonte carregada via Google Fonts no `index.html`

### v8.23.0 - Chat: zoom nas fotos (mobile + desktop) e "Ver todos os membros" funcional (2026-07-03)
- [x] **Zoom no lightbox de imagens** (Bruno): "deixa poder dar zoom nas fotos... não funciona isso" (mobile e desktop). O lightbox só exibia a imagem estática. Novo componente `ZoomableImage` (em `Chat.tsx`) com **pointer events** (unificam mouse + toque): **desktop** → scroll pra ampliar/reduzir mantendo o ponto focal no cursor, duplo-clique alterna zoom, arrastar move a imagem, e botões `+`/`−`/`%` no rodapé; **mobile** → pinça pra ampliar, arrastar pra mover, toque duplo alterna. Zoom de 100% a 500%, com clamp de pan pra imagem não "fugir" da tela
- [x] **"Ver todos os N membros..." agora funciona** (Bruno): o botão no painel "Sobre o grupo" não tinha `onClick` — era só texto azul. Agora alterna (estado `showAllMembers`) entre os 8 primeiros e a lista completa, exibindo "Mostrar menos" quando expandido
- [x] **Ações de admin acessíveis nos membros no toque**: o "X" de remover membro era `opacity-0 group-hover` (só aparecia no hover — inexistente em telas de toque). Agora fica visível no mobile (`opacity-60`) e mantém o hover no desktop (`md:group-hover`), valendo também na lista expandida
- [x] **Foto de perfil do grupo "suporte cami"** — definida direto em produção (upload no bucket `chat-avatars` + `chat_channels.avatar_url`), a pedido do Bruno

### v8.22.0 - Colaboradores: convite por email + criação de novas áreas (departamentos) (2026-07-02)
- [x] **Convite por email ao criar colaborador** (Bruno): "poderia fazer esse convite por email". Antes, criar colaborador sempre gerava uma **senha temporária** que o admin repassava manualmente. Agora o `create-employee` (edge function) gera um **link de definição de senha** (recovery via `admin.generateLink`, redirect para `/reset-password`) e o envia por email via **Resend**, com o branding do tenant (nome + `primary_color`), reaproveitando os secrets já existentes (`RESEND_API_KEY`, `EMAIL_FROM`, `SITE_URL`). Vale tanto para usuário novo quanto para um já existente sendo vinculado ao tenant. **Fallback:** se o email não puder ser enviado (envs ausentes/Resend fora), cai na senha temporária de antes — o admin nunca fica sem meio de dar acesso (retorna `invite_sent: boolean`)
- [x] **Escolha convite × senha manual** (Bruno): "eu quero criar o colaborador de forma manual também". O formulário de novo colaborador (`Colaboradores.tsx`) ganhou o seletor **"Acesso do colaborador"**: `Enviar convite por email` (padrão) ou `Gerar senha temporária`. A escolha vai como `send_invite` no payload; `send_invite=false` mantém o fluxo antigo (modal com a senha)
- [x] **Criar novas áreas (departamentos) na página `/areas-cargos`** (Bruno): a página só permitia "Inicializar Estrutura T" (as 3 áreas padrão) — não dava para criar uma 4ª. Agora tem botão **"Nova área"** + `AreaFormDialog` (nome + cor), além de **editar** (renomear/cor) e **excluir** área direto no card do organograma (excluir só para áreas custom, preservando as 3 padrão). Cada área criada **já ganha um canal no chat automaticamente** (trigger `ensure_area_channel` no banco — comportamento pré-existente)
- [x] **Cor custom no organograma** — áreas fora das 3 padrão usam a cor escolhida (`company_areas.color`) via estilo inline (novo helper `resolveAreaVisual`), propagada para subáreas e cargos, em vez de cair no fallback visual de "Aquisição"
- [x] **Seletor de área dinâmico no cadastro de colaborador** — o `Select` de Área em `Colaboradores.tsx` era fixo (Aquisição/Entrega/Operação); agora lista **todas** as áreas do tenant (`useAreas`), então departamentos novos ficam atribuíveis a colaboradores
- [x] **Deploy da edge function `create-employee`** — **feito em produção** (`opbdoulspzlabxzevffc`) via `supabase functions deploy`. Secrets `RESEND_API_KEY`/`EMAIL_FROM`/`SITE_URL` confirmados no projeto. Sem migrations pendentes (a coluna `company_areas.color` e o trigger `area_channel_create` já existem em produção). O restante é frontend, publicado via Lovable

### v8.21.1 - Fix: pin de fixar sobrepunha o badge de não-lidas na lista (2026-07-01)
- [x] **Bug** (Bruno): "o pin de fixar às vezes, se tem uma msg nova, fica os dois um em cima do outro". O botão de pin (topo-direita, absoluto) e o badge de mensagens não-lidas disputavam o mesmo canto. A reserva de espaço (`pr-6`) só existia quando o canal **já estava fixado**, então ao passar o mouse sobre um canal **não fixado** com não-lidas o pin (que surge no `group-hover`) cobria o badge; e `pr-6` era curto para badges de 2-3 dígitos (`99+`). Agora reserva `pr-7` de forma fixa quando fixado e via `group-hover:pr-7` quando não fixado, cobrindo os dois casos (`Chat.tsx`)

### v8.21.0 - Chat: fixar conversa (Anotações inclusive) e ícone de pin no lugar da estrela (2026-07-01)
- [x] **Bug: não dava pra favoritar/fixar o Anotações** (Bruno): "não to conseguindo favoritar o chat de anotações". **Causa raiz:** o card "Anotações" é uma entrada virtual com a chave sentinela `__anotacoes__`, mas `chat_user_favorites.channel_id` era `uuid NOT NULL` — o INSERT falhava com `22P02` (invalid input syntax for type uuid) e o fixar do Anotações não gravava. Como a coluna **não tem FK** para `chat_channels`, a migration `20260701130000_chat_favorites_channel_id_text.sql` troca o tipo para `text` (UUIDs reais seguem batendo por string; a chave `__anotacoes__` passa a caber). **Aplicada em produção** (`opbdoulspzlabxzevffc`)
- [x] **Estrela → pin (fixar)** (Bruno): "é melhor mudar o svg e colocar o pin de fixar". Na lista de conversas, o botão de fixar (Anotações + DMs + grupos + canais) trocou o ícone `Star` por `Pin` e o texto "Favoritar/Desafavoritar" por "Fixar/Desafixar". A barra de mensagem fixada também passou de `Star` para `Pin` (coerente com o rótulo "Fixada"). O "Favoritar mensagem" do menu e o atalho "Mensagens favoritas" seguem com estrela (feature separada de mensagens marcadas)

### v8.20.1 - Fix: chat voltou a bloquear .md/.zip e limite preso em 25 MB (2026-07-01)
- [x] **Bug reportado** (Bruno): "não consigo subir no chat arquivo md, zip e essas coisa". **Causa raiz:** a migration de hardening `20260624121000_storage_bucket_limits.sql` (aplicada em produção em 24/06) **reintroduziu um allowlist de `allowed_mime_types`** no bucket `chat-attachments`, contradizendo a política "libera tudo, exceto XSS" documentada em `20260610120000` e implementada no frontend (`CHAT_ATTACHMENT_MIME_BLOCKLIST` em `useChat.ts`). O allowlist não incluía `text/markdown` (.md), nem as variantes de zip que o Windows envia (`application/x-zip-compressed`, `application/octet-stream`), além de json/csv/etc. Também manteve `file_size_limit` em 25 MB via `coalesce`, embora o código já espere 500 MB (commit `6893ffb`)
- [x] **Correção de banco** (`20260701120000_chat_attachments_allow_all_500mb.sql`): `chat-attachments` volta para `allowed_mime_types = NULL` e `file_size_limit = 524288000` (500 MB). **Aplicada em produção** (`opbdoulspzlabxzevffc`) via Management API. A defesa contra XSS (svg/html/xhtml) segue no frontend, já que o bucket é público
- [x] **Mesmo bloqueio em `attachments` e `process-documents`** — a mesma migration de 24/06 restringira esses buckets. Diferente do chat, eles **não têm blocklist de XSS no frontend**, então o bucket precisa continuar sendo a barreira. Migration `20260701123000_attachments_docs_expand_mime.sql` **expande o allowlist** (adiciona `text/markdown`, `text/csv`, `application/json`, `application/x-zip-compressed`, `application/octet-stream`, rar/7z/gzip/tar, pptx e mais mídia) mantendo svg/html **fora** de propósito. `file_size_limit` segue em 25 MB (não era o problema). **Aplicada em produção** (`opbdoulspzlabxzevffc`) via Management API

### v8.20.0 - Feed: URLs viram links clicáveis (azuis), igual ao chat (2026-06-30)
- [x] **Links clicáveis no feed** (Bruno): "no chat ele consegue aparecer como link azul, mas no feed ele fica assim" (texto plano). Posts e comentários do feed renderizavam o conteúdo com `<p whitespace-pre-wrap>` sem nenhum linkify, então URLs ficavam como texto não-clicável. Criado componente compartilhado `LinkifiedText` (`src/components/shared/LinkifiedText.tsx`) com `linkifyText()` — detecta `http(s)://` e `www.` via regex (sem incluir pontuação final), renderiza como `<a target="_blank" rel="noopener noreferrer">` com `text-primary underline` e `stopPropagation` no clique. Aplicado em `FeedPostCard` (preview do post) e `CommentItem` (texto do comentário) em `Feed.tsx`

### v8.19.0 - Chat: indicador de "visto" na sidebar, painel de início de DM e fix de avatar (2026-06-24)
- [x] **Indicador de "visto" na lista de conversas** (Bruno): "indicador de visualizar msg fora da msg, no sidebar". O preview da última mensagem nas DMs (`Chat.tsx`) agora exibe ✓ (cinza, enviado) ou ✓✓ (azul, visto) quando a última mensagem é minha — espelhando o status de leitura que antes só aparecia dentro da bolha. Novo hook `useChatOthersReads(channelIds)` (`useChat.ts`) retorna o maior `last_read_at` entre os outros membros de cada canal, com realtime em `chat_channel_members`
- [x] **Header e painel de início ao abrir nova DM** (Bruno): "ao iniciar uma nova mensagem direta não aparece o header". **Causa raiz:** `findOrCreateDM` criava o canal mas não invalidava `chat_channels`, então `channel` ficava `undefined` e o header (`{channel && ...}`) não renderizava. `handleStartDM` agora aguarda `invalidateQueries(["chat_channels"])` antes de selecionar. O estado vazio genérico ("Nenhuma mensagem ainda…") virou um **painel de início de conversa** com avatar + nome da pessoa e a mensagem "Este é o começo da sua conversa com X. Diga olá!"
- [x] **Fix: avatar do "Gustavo Ribeiro" quebrado** (Bruno): único usuário com `avatar_url` apontando para `https://gt3.omnx.pro/storage/...` (host Lovable que **não serve storage** → 404) em vez de `opbdoulspzlabxzevffc.supabase.co`. Dado corrigido em produção (1 linha de `profiles`). Como blindagem, `AvatarBadge` ganhou `onError` → cai para as iniciais quando a imagem falha, em vez de exibir o ícone de imagem quebrada

### v8.18.0 - Chat: data relativa no preview, silenciar respeitado de fato e "criar tarefa" via modal (2026-06-23)
- [x] **Data relativa nas conversas** (Bruno): "mensagens enviadas no dia anterior ficavam sempre com a hora, gerando confusão". O preview da última mensagem na lista de conversas (`Chat.tsx`) usava `format(..., "HH:mm")` puro. Novo helper `formatChatPreviewTime` (`useChat.ts`): hoje → `HH:mm`, ontem → "Ontem", < 7 dias → dia da semana, antigo → `dd/MM`. O separador de dia no thread também passou a exibir "Hoje"/"Ontem" via `formatChatDayLabel` (antes só `EEE · dd MMM`)
- [x] **Silenciar agora silencia o som** (Bruno): "silenciar a mensagem não silencia mesmo, continua a notificação". **Causa raiz:** o hook `useChatNotifications` (`useChat.ts`) tocava o som de nova mensagem em qualquer canal não-aberto e **nunca checava o mute** (a notificação do navegador já checava em `Chat.tsx:614`, mas o som não). Agora o hook recebe `mutedSet` (via `useMutedChannels`) por `ref` — sem re-subscrever o realtime a cada refetch — e ignora canais silenciados antes de tocar
- [x] **Tarefa atribuída respeita o mute do destinatário (server-side)** — ao criar tarefa pelo chat, a notificação `task_assigned_chat` passou a ser inserida por uma **RPC `SECURITY DEFINER` `create_chat_task_notification`** (migration `20260623120000`, aplicada em produção `opbdoulspzlabxzevffc`). A função valida canal/tenant do chamador, confirma que o responsável é membro do canal e **só insere se ele não silenciou o canal** — a leitura do mute alheio funciona de forma confiável porque roda como owner (bypassa RLS), eliminando a limitação da checagem client-side anterior
- [x] **"Criar tarefa" a partir da mensagem abre o modal do chat** (Bruno): antes a opção só fazia `window.open("/tarefas?title=...")` em nova aba. Agora o menu da mensagem dispara `onCreateTask` (novo prop de `MessageRow`), que abre o modal de criar tarefa já existente com a **mensagem inteira pré-preenchida na Descrição** e o Título vazio para preencher — mesmo fluxo (cria a tarefa e envia o card no canal)

### v8.17.6 - Meet: indicador de status da transcrição ao vivo (não mais silencioso) (2026-06-23)
- [x] **Contexto** (Bruno): "transcrições das reuniões não estão sendo geradas". Investigação confirmou que **todo o lado servidor está saudável**: `SONIOX_API_KEY` válida (a mesma já em produção — confirmado por hash do digest que o painel retorna), conta Soniox com créditos (transcreveu áudio real de ponta a ponta no teste async), modelo `stt-rt-preview` aceito no WebSocket, edge function `soniox-temp-key` OK (testada com JWT real), e UPDATE de `meetings` liberado por RLS para o tenant. 48/107 reuniões têm transcript (última em 18/jun); **nenhum commit** mexeu em meet/transcrição entre 17–22/jun → **não é regressão de código nem Soniox**
- [x] **Causa restante:** captura de áudio no navegador do host durante a call — que falhava **em silêncio** (`SilentTranscription` não tinha UI nem reportava erro)
- [x] **`MeetRoom`:** `SilentTranscription` virou **`TranscriptionStatus`** — pílula fixa (host) mostrando estado real: iniciando / reconectando / transcrevendo (nº de microfones captados) / sem áudio / erro, + nº de trechos já capturados; erros do Soniox viram `toast`. Torna falhas de captura visíveis e diagnosticáveis na hora

### v8.17.5 - Fix: criar tarefa pelo chat falhava (403 RLS) + member só atribui a si (2026-06-23)
- [x] **Bug reportado** (Bruno): "criar tarefas pelo chat está bugado, não funciona" — toast de erro; console mostrava `POST /rest/v1/tasks → 403`
- [x] **Causa raiz (regressão de RLS):** a migration `20260601180000_tasks_select_rls_perf.sql` reescreveu `tasks_select` com `ALTER POLICY` para otimizar o branch de `manager`, mas **removeu a cláusula `OR tasks.created_by = auth.uid()`** que a migration `20260515120000` havia adicionado nos branches member/manager. Como o frontend cria tarefa com `.insert(...).select().single()`, o **`RETURNING` aplica a policy de SELECT** à linha nova; quando o criador (member/manager) não conseguia "ver" a tarefa (atribuída a outro, sem responsável, ou projeto não legível), o RETURNING violava RLS e o INSERT inteiro abortava com 403. Admin não sofria (vê tudo). Diagnóstico confirmado em produção simulando o INSERT com RLS via `request.jwt.claims`
- [x] **Correção de banco** (`20260622140000_tasks_select_restore_created_by.sql`): restaura `OR tasks.created_by = auth.uid()` nos branches **member** e **manager** de `tasks_select`, preservando a otimização `get_readable_project_ids()`. **Aplicada em produção** (`opbdoulspzlabxzevffc`)
- [x] **Correção de UI** (`Chat.tsx`): para role **member**, o dialog de criar tarefa do chat agora trava o responsável só no próprio nome (igual às tarefas normais/KanbanBoard) — `select` desabilitado mostrando só o colaborador atual, pré-seleção a si mesmo ao abrir, e `enforcedAssigneeId` no submit

### v8.17.3 - Fix: transcrição do chat (502 `chat-transcribe`) e logo 404 (2026-06-09)
- [x] **Transcrição do chat dava 502** ("erro no Soniox"): o `Chat.tsx` chama a edge `chat-transcribe`, que **não existia no repositório** — havia uma versão fantasma em produção (baseada em Soniox) que estourava 502
- [x] **`chat-transcribe` recriada** com a mesma lógica de `feed-audio-transcribe` (OpenRouter / Gemini-GPT-4o), substituindo a versão Soniox. **Deployada em produção** — o chat volta a transcrever sem depender do build do front
- [x] **Logo 404 (`/logo-empire.png`)**: o arquivo estava no `.gitignore` (regra `*.png`) e **nunca foi versionado** → 404 em produção. `brand.ts` agora aponta logo/favicon para `/logo.png` (mesma imagem do rei, já versionada)

### v8.17.2 - Fix: duração do áudio (00:00) no player (2026-06-09)
- [x] **Bug reportado** (Bruno): player de áudio do chat mostrava `00:00 / 00:00` — não pegava a minutagem
- [x] **Causa raiz:** áudio de voz é gravado no navegador em **webm/opus** (MediaRecorder), formato que não grava a duração no header → `audio.duration === Infinity` no `loadedmetadata`, e o código descartava o valor
- [x] **Correção (`AudioPlayer`):** quando a duração vem `Infinity`, força o cálculo com seek pro fim (`currentTime = 1e101`) e captura o valor real no novo handler `onDurationChange`, depois reseta o cursor; `onTimeUpdate` ignora os eventos do seek forçado (flag `durationFixRef`). Vale também para áudios já existentes (cálculo em runtime)

### v8.17.1 - Gerar senha temporária de colaborador (admin entrega na hora) (2026-06-09)
- [x] **Contexto:** ao criar colaboradores na falha do bug v8.17.0, alguns ficaram sem senha (a temporária nunca foi exibida). O "Resetar Senha" existente só dispara **e-mail** (depende de SMTP + e-mail acessível) — pouco prático quando o admin precisa entregar a senha
- [x] **Nova ação `generate_temp_password`** em `manage-access` — gera uma senha forte, define direto no usuário (service_role, com checagem de admin + isolamento de tenant) e **retorna a senha** na resposta. **Deployada em produção**
- [x] **`useEmployees.generateTempPassword`** + UI em `UserManagement`: menu do usuário agora tem **"Resetar Senha (e-mail)"** e **"Gerar senha temporária"** (abre dialog com a senha + botão copiar)
- [x] **Criar colaborador dava 500** (Bruno): erro `duplicate key value violates unique constraint "employees_user_id_key"` — o colaborador "era criado" mas **sem setor**, e a **senha temporária não aparecia**. **Causa raiz:** a edge function `create-employee` fazia `INSERT` cego em `employees`, mas já existia um registro com aquele `user_id` (constraint `UNIQUE(user_id)` presente em produção, mas **ausente no `init.sql` — baseline defasado**). O `INSERT` estourava 500 e abortava **antes** de aplicar o `position_id` e de retornar `temp_password` → daí os 3 sintomas juntos
- [x] **`create-employee` idempotente** — nos dois caminhos (usuário novo e e-mail já existente): se o employee já existe, faz `UPDATE`; senão `INSERT`. O cargo/setor é aplicado sempre (delete da primária + insert). **Deployado em produção** (`opbdoulspzlabxzevffc`)
- [x] **Transcrição: "Transcrever de novo"** — `AudioPlayer` ganhou botão ↻ (ao lado do copiar) que força nova transcrição ignorando o cache. Backend `feed-audio-transcribe` passou a aceitar `force: true` (pula o cache hit e re-transcreve, sobrescrevendo). **Deployado em produção.** (Obs: a transcrição do chat roda via **OpenRouter**, não Soniox — Soniox é só nas reuniões ao vivo)
- [x] **Push no Android não chegava** (iOS ok) — tratada a causa clássica: o Chrome/FCM rotaciona a `PushSubscription` e o evento `pushsubscriptionchange` **não era tratado** (a inscrição salva "morria"). Adicionado handler no `sw.js` (re-inscreve com a chave antiga) + `usePushNotifications` re-sincroniza a inscrição ao voltar ao foreground (`visibilitychange`) e recria inscrições "presas" com chave VAPID divergente. `sw.js` também ganhou `vibrate` e badge em PNG
- [x] **Card de resposta quebrava a tela no mobile** — a citação dentro da mensagem (`Chat.tsx`) não tinha `min-w-0`/`overflow-hidden` (overflow clássico de flexbox) e o "Respondendo a [nome]" no composer não tinha `truncate`. Corrigido

### v8.16.1 - Segurança: zera alerta do Dependabot (react-router open redirect) (2026-06-09)
- [x] **`react-router` / `react-router-dom`** (moderate, GHSA-2j2x-hqr9-3h42 — open redirect via URL protocol-relative `//` em same-origin redirect) — resolvido por `npm audit fix`: `6.30.3 → 6.30.4` (patch dentro do range `^6` já declarado, `package.json` inalterado, só `package-lock.json`)
- [x] **Resultado:** `npm audit` → **0 vulnerabilidades**; typecheck (`tsc --noEmit`) limpo

### v8.16.0 - Chat: colar imagem com Ctrl+V + auto-atualização sem F5 (2026-06-08)
- [x] **Colar do clipboard (Ctrl+V)** — `onPaste` no composer de `Chat.tsx` (linha ~2079). Extrai itens `kind === "file"` do `clipboardData` (print de tela, imagem ou qualquer arquivo copiado), faz `preventDefault()` para não colar o binário como texto e reaproveita o `handleFiles()` existente (mesmo fluxo do botão de anexo/drag-drop → vira `pendingAttachment` com legenda opcional)
- [x] **Bug reportado** (Bruno): chat não atualizava sozinho e notificações nem sempre chegavam — precisava entrar e dar F5. **Causa raiz:** a query `useChatMessages` dependia 100% do Realtime do Supabase (`postgres_changes`), que falha em produção (Lovable) quando a tabela não está na publication/RLS de realtime — sem `refetchInterval`, nada atualizava com a aba focada
- [x] **Fallback de atualização** — `useChatMessages` (`src/hooks/useChat.ts`) ganhou `refetchInterval: 5_000` + `refetchOnWindowFocus`/`refetchOnReconnect`. O canal aberto passa a se atualizar a cada 5 s mesmo com o Realtime quebrado; quando o Realtime funciona, a invalidação segue entregando instantaneamente e o polling só cobre a lacuna

### v8.15.0 - Documentos: upload de qualquer tipo + preview em modal; ESC fecha conversa no Chat (2026-06-02)
- [x] **Upload liberado para todos os tipos** — removido o `accept` restritivo do input em `ProcessDocUpload.tsx` (antes só `.md,.txt,.pdf` e imagens; HTML, .docx, .xlsx etc. eram bloqueados pelo seletor do sistema). O bucket `process-documents` já não tinha restrição de MIME (`allowed_mime_types: null`), então a trava era puramente o atributo `accept`
- [x] **`FilePreviewModal`** (`src/components/processes/FilePreviewModal.tsx`) — modal que renderiza preview inline conforme o tipo: imagem (`<img>`), PDF (`<iframe>`), HTML (`<iframe sandbox>`), vídeo/áudio (`<video>`/`<audio>`), texto (fetch + `<pre>`); fallback para download nos demais. Exporta `getPreviewKind()` e `downloadFile()` (download via blob, funciona cross-origin no storage)
- [x] **Card de arquivo no editor** — `ProcessDocEditor` substituiu o link "Baixar arquivo" por um card com ícone por tipo + botões **Visualizar** (abre o modal) e **Baixar**. `PublicDocument` (pastas públicas) também ganhou Visualizar/Baixar por arquivo
- [x] **Chat: ESC fecha a conversa atual** — em `Chat.tsx`, novo handler de teclado limpa `selectedChannelId`/`notesView` e volta para a sidebar de contatos. Guardado contra overlays/popovers/edições ativas (lightbox, busca global, diálogos, menções, emoji, edição de msg) — esses tratam o ESC primeiro

### v8.14.4 - Hotfix: timeout ao carregar quadro/lista de Tarefas (RLS por-linha) (2026-06-01)
- [x] **Bug reportado** (Bruno Andrease, papel `manager`): abrir um projeto → aba Quadro mostrava "Erro ao carregar o quadro — canceling statement due to statement timeout"
- [x] **Causa raiz** — a policy RLS `tasks_select` chamava `user_can_read_project(project_id)` **por linha** de tarefa. Essa função dispara uma cascata de subconsultas (`user_has_project_assigned_task` + `user_project_matches_position_or_area`, esta com JOIN por `OR` = nested loop). Custo O(nº de tarefas): quadro de 1 projeto (82 tarefas) ≈ 1,5 s; página Tarefas (849 tarefas) ≈ **10,5 s** → estourava o `statement_timeout` (8 s). Só afeta `manager` (admin cai no curto-circuito `is_admin()`; member tem branch enxuta)
- [x] **Correção** — nova função `get_readable_project_ids()` (`= SELECT id FROM projects WHERE user_can_read_project(id)`) e a policy passa a usar `project_id IN (SELECT get_readable_project_ids())`. O planner avalia o conjunto **uma única vez** (hashed SubPlan) e cada linha vira hash lookup → O(nº de projetos) avaliado 1×. Semântica de acesso **idêntica** (result set conferido: mesmas 82 e 113 linhas)
- [x] **Ganho medido** (EXPLAIN ANALYZE, usuário manager): quadro de 1 projeto **1536 ms → 408 ms**; página Tarefas (todas) **10538 ms → 496 ms**
- [x] **Migration:** `20260601180000_tasks_select_rls_perf.sql` (aplicada em produção)

### v8.14.3 - Segurança: zera vulnerabilidades do Dependabot/npm audit (2026-06-01)
- [x] **`ws`** (moderate, GHSA-58qx-3vcg-4xpx — uninitialized memory disclosure) — transitiva via `@supabase/realtime-js` e `jsdom`; resolvida para `>=8.20.1` via `npm audit fix` (lockfile)
- [x] **`@tootallnate/once`** (low, GHSA-vpq2-c234-7xj6) — transitiva via `jsdom > http-proxy-agent` (dev); resolvida via `npm audit fix`
- [x] **`vitest`** (critical, GHSA-5xrq-8626-4rwp — leitura/execução de arquivo arbitrário quando o UI server está ativo) — atualizado `^3.2.4` → `^4.1.8` (major). Dev-only e não-explorável aqui (não usamos `@vitest/ui`), mas atualizado por precaução. Config (`vitest.config.ts`) compatível; testes seguem passando (1/1)
- [x] **Resultado:** `npm audit` → **0 vulnerabilidades**

### v8.14.2 - Hotfix: React error #300 em produção (hooks condicionais no KanbanBoard) (2026-06-01)
- [x] **Bug reportado** (Bruno): produção quebrava com `Minified React error #300` ("Rendered fewer hooks than expected. This may be caused by an accidental early return statement.")
- [x] **Causa raiz** — o `useEffect` do `openCreate` (introduzido na v8.14.1) foi colocado **depois** dos early returns do `KanbanBoard` (`if (queryError) return …` e `if (showSkeleton) return <KanbanSkeleton/>`). Durante o skeleton o componente retornava cedo e o hook não era registrado; ao carregar, ele passava a ser registrado → a contagem de hooks variava entre renders → violação das Regras dos Hooks (estoura minificado em produção)
- [x] **`KanbanBoard.tsx`** — `useEffect` movido para **antes** dos early returns (junto dos demais hooks). A lógica de abrir o dialog foi inlinada com os setters de `useState` (sempre definidos), evitando referenciar `handleOpenCreate`/`resetForm`, que são declarados depois dos returns (TDZ durante o render de skeleton)

### v8.14.1 - Fix: "+ Tarefa" no projeto não abria o dialog (2026-06-01)
- [x] **Bug reportado** (Bruno Andrease): em Projetos → abrir um projeto → "+ Tarefa", aparecia apenas o toast "Use o + Adicionar tarefa nas colunas do quadro" e nada abria. A toolbar do `KanbanBoard` (que contém o botão "Nova tarefa" que abre o dialog) fica **escondida** no `ProjetoDetalhes` porque é renderizada em modo compacto (`showSearch`/`showProjectFilter`/`showColumnManagement` todos `false`), restando só o "+ Adicionar tarefa" inline das colunas
- [x] **`KanbanBoard.tsx`** — novas props `openCreate?: boolean` + `onOpenCreateConsumed?: () => void`. Um `useEffect` abre o dialog de criação (`handleOpenCreate`) quando `openCreate` vira `true` e consome o sinal imediatamente (não reabre em re-render/remontagem)
- [x] **`ProjetoDetalhes.tsx`** — botão "+ Tarefa" do topo agora seta `activeView="kanban"` + `pendingCreate=true` (antes só mostrava o toast). Passa `openCreate`/`onOpenCreateConsumed` ao board
- [x] **Projeto travado** — o dialog já nasce com `project_id` = projeto atual (`resetForm`) e o seletor de projeto nem aparece quando há `projectId` (`{!projectId && ...}`), então a tarefa fica obrigatoriamente amarrada ao projeto em que o usuário está

### v8.14.0 - Notificações, badges e integração Feed↔Canais (2026-06-01)
- [x] **Mobile:** trava de pinch-zoom (`user-scalable=no`) + `viewport-fit=cover` no `index.html`
- [x] **Fix push no Android (raiz):** `usePushNotifications` deixou de pedir permissão automaticamente (o Chrome Android silencia prompts sem gesto → nenhuma subscription Android era criada). Opt-in agora é por clique no banner `PushNotificationOptIn`; quem já permitiu é re-inscrito silenciosamente. `send-chat-notification` instrumentada (logs por subscription + limpeza de endpoints mortos 404/410)
- [x] **Badges de não-lido** no Feed (tabela `feed_reads`, persiste entre dispositivos — antes era localStorage) e em Tarefas (`useTasksUnreadCount` = `notifications` `task_assigned` não-lidas), renderizados na sidebar
- [x] **Feed → Canal:** trigger espelha post no canal de chat — `all` → canal **Geral**; área/subárea → canal da área. Selo `📢 Novo no Feed` + card clicável (`FeedBroadcastCard`) com deep-link `/feed?post=<id>` (rola/destaca o post). Canais padrão reconciliados (`is_general` + `area_id`); dedupe via `feed_post_channel_broadcasts`
- [x] **Push de feed e tarefa:** edge function `send-push` + `app_dispatch_push` (pg_net) disparados por triggers (`trg_push_task_assigned`, broadcast do feed). Segredo interno no Vault (`internal_push_secret`)
- [x] **Refactor:** lógica de Web Push extraída para `_shared/webpush.ts` (compartilhada por `send-chat-notification` e `send-push`)
- [ ] **Pendente de config (usuário):** setar `INTERNAL_PUSH_SECRET` nos secrets da Edge Function `send-push` (valor já no Vault); publicar o front no Lovable; ativar notificações no Android e validar via logs

### v8.13.2 - Hotfix: produção quebrada por env vars do Supabase (2026-06-01)
- [x] **Fix "Missing Supabase environment variables" em produção** (`gt3.omnx.pro`). A produção é servida pelo **Lovable** (Cloudflare), não pela Vercel — confirmado pelos headers (`Server: cloudflare` + `x-deployment-id`; os headers do `vercel.json` não aparecem na resposta, ou seja, o `vercel.json` é inerte). O Lovable **não injeta variáveis `VITE_*` no build do frontend**, então o bundle saía com `import.meta.env.VITE_SUPABASE_* === undefined` e o `throw` em `client.ts` derrubava o app
- [x] **Fallback de credenciais públicas** em `src/integrations/supabase/config.ts` — `FALLBACK_SUPABASE_URL`, `FALLBACK_SUPABASE_PROJECT_ID` e `FALLBACK_SUPABASE_ANON_KEY`. `import.meta.env` mantém prioridade (Vercel/local seguem lendo o `.env`); o fallback só entra quando a env var está ausente (Lovable). A anon key é **pública por design** (vai ao bundle de qualquer forma, protegida por RLS) — exceção consciente à regra "sem fallback hardcoded" do CLAUDE.md §2, restrita a credenciais públicas
- [x] **Novos getters** `getSupabaseAnonKey()` e `getDirectSupabaseUrl()` em `config.ts`; `client.ts` passa a consumi-los

### v8.13.1 - Polish da Cami + fix sidebar (2026-06-01)
- [x] **Cami lê a conversa do canal** — `cami` busca as últimas 30 mensagens (com autor) como contexto: "qual documento ele citou?", "cria a tarefa do que combinamos"
- [x] **Markdown nas respostas** da Cami (`useMarkdown`/`prose`) — negrito, listas, código
- [x] **Badges padrão sempre ao reabrir** (reset da conversa) — 7 sugestões contextuais: Criar tarefa, Agendar reunião, Procurar processo, Resumir conversa, Sugerir resposta, Tarefas atrasadas, Próximas reuniões
- [x] **Fix horário da reunião** — `create_meeting` usa o horário de parede de São Paulo (`toSaoPauloWallClock`); "15h" não vira mais 18h (UTC)
- [x] **Fix sidebar:** badge de não lidas sobrepunha a estrela de favorito; agora fica ao lado (padding condicional)

### v8.13.0 - Cami: assistente de IA no chat (2026-06-01)
- [x] **Edge function `cami`** (OpenRouter, tool-calling) — modos chat e execute. Tools de leitura (`search_items`, `list_my_tasks`, `list_upcoming_meetings`) no servidor; tools de ação (`propose_task`, `propose_meeting`, `open_item`) viram propostas confirmáveis
- [x] **`useCami`** (`src/hooks/useCami.ts`) — estado da conversa + `send()` / `executeAction()`
- [x] **`CamiPanel`** (`src/components/cami/CamiPanel.tsx`) — drawer lateral no Chat com mensagens, cartões de ação (criar tarefa/agendar reunião com Confirmar) e botões de navegação
- [x] **3 pontos de entrada** ativados no `Chat.tsx` (slash `/ai`, botão do compositor, menu da mensagem → modo "sugerir resposta"); removidos os `toast("Cami — em breve")`
- [x] **Capacidades v1:** criar tarefas, agendar/iniciar reuniões, achar+navegar a processos/documentos/projetos, dicas de resposta + Q&A — tudo no padrão "propor e confirmar"
- [x] **config.toml** + deploy (`verify_jwt=false`, valida JWT manualmente). Reusa `OPENROUTER_API_KEY` já configurada

### v8.12.0 - Push com remetente/grupo + notificação por email (2026-06-01)
- [x] **`send-chat-notification`** — `sendWebPush` agora **criptografa o payload** (RFC 8291 + RFC 8188 / `aes128gcm`) antes de enviar. Antes só os headers VAPID eram enviados (corpo vazio), então o service worker caía no texto genérico "Nova mensagem no chat" e o Android (FCM) descartava o push. Agora a notificação mostra `title` = `"Fulano em #canal"` (ou só o nome em DM) e `body` = prévia da mensagem
- [x] **`public/sw.js`** — sem alteração necessária: já lia `payload.title`/`payload.body` (passa a receber o payload de fato)
- [x] **Notificação por email após 5 min** — nova edge function `email-unread-chat` (cron 1 min). Conversa silenciosa por >= 5 min com mensagens não lidas dispara **1 email-digest por conversa** via Resend ao email cadastrado do destinatário
- [x] **`chat_email_notifications`** (nova tabela) — dedupe por `(channel_id, user_id)`, RLS deny-all (só `service_role`)
- [x] **RPC `get_unread_chat_for_email(interval)`** — `SECURITY DEFINER`, lista conversas elegíveis (silenciosas + algo novo desde o último email)
- [x] **Cron `email-unread-chat-every-minute`** — pg_cron lê o segredo do Vault (`email_cron_secret`) e envia no header `x-cron-secret`
- [x] **Backfill inicial** — estado atual de não-lidos marcado como já notificado para não emailar backlog histórico
- [x] **Pendente de config (usuário):** definir secrets `RESEND_API_KEY` e `EMAIL_FROM` (domínio verificado no Resend). `CRON_SECRET` já configurado

### v8.11.0 - Mobile polish geral + fix reply no chat (2026-05-29)
- [x] **`AppLayout.tsx`** — `h-screen` → `h-[100dvh]` (viewport dinâmico para barra de endereço do Safari/Chrome mobile)
- [x] **`Auth.tsx`** — `min-h-screen` → `min-h-[100dvh]`, `pb-[calc(1rem+env(safe-area-inset-bottom))]` para safe-area iOS, todos inputs/botões com `h-11` (44px touch target mínimo)
- [x] **`Chat.tsx`** — `h-screen` → `h-[100dvh]`, compositor com `pb-[calc(1rem+env(safe-area-inset-bottom))]` para home indicator, área de mensagens `px-3 md:px-6`, search input `w-36 sm:w-56`, texto "Pergunte a Cami" e "Nova Reunião" ocultos em mobile (`hidden sm:inline`)
- [x] **`KanbanBoard.tsx`** — search input `w-full sm:w-[260px]` (já tinha modo lista + snap scroll, confirmado)
- [x] **`Dashboard.tsx`** — KPI cards com padding responsivo, labels 2-line mobile via `<br className="sm:hidden" />`, font sizes responsivos, grid 2-col → `md:grid-cols-2` (era `lg:`)
- [x] **`Feed.tsx`** — cards com `p-4 sm:p-5` para compactar no mobile
- [x] **`Projetos.tsx`** — botão "Novo Projeto" oculta texto em mobile, ProjectCard `p-4 sm:p-5`, Dialog create/edit com `max-h-[90dvh] overflow-y-auto`
- [x] **`Reunioes.tsx`** — header com `flex-wrap gap-3`, botão "Nova Reunião" oculta texto em mobile
- [x] **`Colaboradores.tsx`** — botão "Novo Colaborador" oculta texto em mobile
- [x] **`useChat.ts` + `Chat.tsx`** — **fix bug de reply**: `parent_id` não estava sendo salvo no banco. `send` mutation agora aceita e persiste `parent_id`; `send.mutate` passa `replyTo?.id`; objeto `meta` órfão removido

### v8.10.9 - Manager vê tarefas dos subordinados (2026-05-21)
- [x] **`get_subordinate_employee_ids()`** — nova função RLS que retorna recursivamente todos os `employee_id`s que reportam ao manager logado via `positions.reports_to_id`
- [x] **`tasks_select` policy** — manager agora vê tarefas atribuídas a subordinados diretos e indiretos (via `assignee_id` e `task_assignees`), além do comportamento anterior (projetos acessíveis + próprias tarefas)

### v8.10.8 - Redesign da call + polish mobile (2026-05-07)
- [x] **`MeetRoom.tsx`** — `h-screen` → `h-[100dvh]` (respeita barras dinâmicas do Safari/Chrome mobile). Wrapper inferior com `pb-[env(safe-area-inset-bottom)]` para o home indicator do iOS não cobrir os controles.
- [x] **`MeetTile`** — botão pin escondido em mobile (touch não tem hover; tap no tile já pina). Chip "Fixado" sutil aparece no top-left quando pinned, dando feedback visual em qualquer device.
- [x] **`MeetStage`** mobile — foco vai para 65% da altura (era 60%), gutters externos reduzidos (1.5 → 4 sm+) para ganhar área útil em telefones pequenos.

- [x] **`MeetTile.tsx`** (novo) — tile custom premium dark com glassmorphism. Avatar com gradiente determinístico por hash do nome quando câmera off. Ring esmeralda anima quando o participante está falando (`useIsSpeaking`). Pin manual ao clicar (botão pin no hover). Indicador de mic muted (pill rosa, sempre visível). Nome em pill glass com ícone de mic + ping animation quando falando. Variantes `focus` (área principal) e `thumb` (sidebar). Suporta screen share nativamente.
- [x] **`MeetStage.tsx`** — reescrito do zero. Substitui `FocusLayout`/`CarouselLayout` do LiveKit por layout custom totalmente responsivo:
  - **Desktop (≥768px):** split horizontal — área de foco ~70% + sidebar grid à direita (max 360px), scroll vertical interno.
  - **Mobile (<768px):** stack vertical — foco 60% no topo, carrossel horizontal com scroll snap embaixo.
  - **2 ou menos câmeras + sem screen share:** grid simétrico (1 ou 2 colunas) sem sidebar.
  - **Heurística de foco:** screen share > pin manual > último active speaker (estável, anti-flicker via `useSpeakingParticipants`) > primeiro remoto > local.
  - Pin manual via clique no tile sobrescreve auto-focus.
- [x] **`MeetControlBar.tsx`** — adaptação mobile: screen share/fullscreen/devices/background/noise filter colapsam no breakpoint apropriado e ficam disponíveis no dropdown "Mais". Núcleo (mic/cam/chat/leave) sempre visível. Barra ganha `backdrop-blur-md` e overflow horizontal protegido.

### v8.10.7 - Performance da call + amplificador de volume até 300% (2026-05-07)
- [x] **`MeetRoom.tsx`** — `LiveKitRoom` agora roda com `adaptiveStream: true` + `dynacast: true`. Vídeo publicado com `simulcast` (layers `h180` + `h360`) e teto `h540`. Antes câmera ia em 720p sem simulcast, derrubando reuniões com 8+ participantes (CPU/banda saturados). Screen share mantém `h1080` para legibilidade.
- [x] **`useMeetPreferences`** — `remoteAudioGain` default subiu de `1.5` (150%) para `2.0` (200%) e teto subiu de `2.0` para `3.0` (300%).
- [x] **`BoostedAudioRenderer`** — clamp aplicado a `0..3.0` em todos os pontos (init + setTargetAtTime).
- [x] **`RemoteVolumeControl`** — slider 0–300%, marcadores `0% / 150% / 300%`, botão "Restaurar padrão (200%)".

### v8.10.6 - Fix: criação de colaborador (2026-05-07)
- [x] **Edge `create-employee`** — removido `auth.admin.listUsers()` (não escala, retornava 500 ao verificar emails existentes). Agora tenta `createUser` direto e detecta colisão pelo erro do Supabase.
- [x] **RPC `get_user_id_by_email`** (`security definer`, restrita a `service_role`) — usada para localizar `user_id` em `auth.users` quando o email já existe e checar tenant.

### v8.10.5 - Pipeline resiliente de IA para reuniões grandes (2026-04-27)
- [x] **Tabela `meeting_ai_jobs`** com `status`, `phase`, `progress`, `total_chunks`, `processed_chunks`, `failed_chunks`, `heartbeat_at`, `error_message`. RLS por `tenant_id`, realtime habilitado.
- [x] **Edge `meeting-ai`** refatorado: cria job antes de processar, atualiza progresso/heartbeat por etapa, concorrência limitada (2 chunks paralelos), retry exponencial com fallback Gemini Flash → Haiku → Sonnet 4, timeout de 90s por chamada, redução em batches quando >6 chunks. Sempre destrava `meetings.status` se falhar.
- [x] **`useMeetingAiJob`** — polling 2s do job ativo. `useProcessTranscript` envia `force: true` por padrão.
- [x] **Banner com progresso real** em `Reunioes.tsx` (barra, fase em PT-BR, fragmento X/Y, falhas, erro do job, botões Reiniciar/Resetar).
- [x] **Recuperação automática** via SQL: jobs >4 min sem heartbeat viram `failed`; reuniões >10 min em `processing` voltam para `completed` com `metadata.ai_error`.

### v8.10.4 - PreJoin custom PT-BR + persistência robusta de fundo virtual (2026-04-27)
- [x] **`backgroundPresets.ts`** (novo) — catálogo central de presets de fundo virtual com IDs estáveis (`empire`, `office`, `library` etc.). Resolve a URL real em runtime via `resolveBackgroundUrl()`. Solução para o bug em que o asset `fundo-empire.png` mudava de hash a cada build, invalidando a URL salva no localStorage.
- [x] **`useMeetPreferences`** — `backgroundImageUrl` agora aceita tokens `preset:<id>`. `migrateLegacyBackgroundUrl()` converte automaticamente URLs antigas do asset Empire (qualquer hash) para `preset:empire`. Novo campo `displayName` lembra o nome digitado na PreJoin entre sessões.
- [x] **`applyBackgroundToTrack.ts`** (novo) — função pura que aplica um `BackgroundType` + URL/preset a uma `LocalVideoTrack` arbitrária. Usada tanto pela ControlBar (dentro da Room) quanto pela PreJoin (fora da Room).
- [x] **`BackgroundPickerPopover.tsx`** (novo) — UI compartilhada do seletor de fundo. Recebe `track` por prop, permitindo reuso fora de `LiveKitRoom`. Reaplicação robusta: o `useEffect` agora reage a mudanças da própria track (publish, troca de câmera) — antes só reagia ao participant, perdendo casos de reativação. Convidados continuam sem ver presets restritos.
- [x] **`VirtualBackgroundControl.tsx`** — simplificado: pega track via `useLocalParticipant()` e delega tudo para `BackgroundPickerPopover`.
- [x] **`MeetPreJoin.tsx`** (novo) — substitui `<PreJoin />` nativo do LiveKit (inglês, fundo bege, sem prévia de fundo). Tema dark consistente com a sala. Preview de vídeo ao vivo via `createLocalVideoTrack` com fundo virtual aplicado em tempo real (mesmo processor da call). Medidor de volume do microfone (Web Audio API + `AnalyserNode`, 12 segmentos coloridos). Seletores de Microfone/Câmera com persistência. Toggles in-preview para mic/cam off. Campo "Seu nome" lembrado entre sessões. Botão "Entrar na reunião" em destaque. Cleanup completo de tracks, AudioContext e RAF no unmount.
- [x] **`MeetRoom.tsx`** — substitui `<PreJoin />` LiveKit pelo novo `<MeetPreJoin />`.

### v8.10.3 - Call: fullscreen com controles, troca de devices em tempo real, chat custom (2026-04-27)
- [x] **`useMeetPreferences`** — novos campos `audioInputDeviceId`, `videoInputDeviceId`, `audioOutputDeviceId` persistidos em localStorage. Cada usuário mantém seus dispositivos preferidos entre sessões (assim como `backgroundType`, `backgroundImageUrl` e `noiseFilter` já eram persistidos).
- [x] **`DeviceSelector.tsx`** (novo) — popover na `MeetControlBar` que lista microfones, câmeras e saídas de áudio via `useMediaDeviceSelect`. Troca em tempo real durante a call e salva escolha em `useMeetPreferences`. Botão "Dispositivos" entre os controles centrais.
- [x] **`MeetRoom.tsx`** — fullscreen agora aplicado no **container raiz** da reunião (não no `<video>` do screen share), garantindo que `MeetControlBar` continue visível em tela cheia. Estado `isFullscreen` controlado via `fullscreenchange` e propagado para `MeetStage`. Aplica `videoCaptureDefaults` / `audioCaptureDefaults.deviceId` na criação da `Room` para reusar devices salvos do usuário.
- [x] **`MeetStage.tsx`** — refatorado: botão "Tela cheia" agora chama `onToggleFullscreen` do pai. Mostra "Sair da tela cheia" + ícone `Minimize2` quando ativo. Sem mais `requestFullscreen` direto no elemento `<video>` (que escondia os controles).
- [x] **`MeetChat.tsx`** (novo) — chat custom em PT-BR substituindo o `<Chat />` padrão do LiveKit (que estava com bugs de envio/render). Lista rolável com auto-scroll, balões diferenciados (próprio vs outro participante), composer com Enter para enviar, Shift+Enter para quebra de linha, indicador de envio.

### v8.10.1 - UX do cancelamento de ruído + dual-layer (browser + Krisp AI) (2026-04-23)
- [x] **`AudioNoiseFilterControl`** — refatorado para padrão shadcn da `MeetControlBar`. Ícones `Sparkles` (ativo) / `Waves` (desligado) substituem `Mic`/`MicOff` (que confundiam com o botão de microfone). Label fixo "Cancelar ruído" — estado vai no visual (`variant="default"` quando ativo, `variant="secondary"` quando desligado). Tooltip explica que é Krisp AI.
- [x] **`MeetRoom.tsx`** — `audioCaptureDefaults` agora aplicado ao `<LiveKitRoom>` baseado em `prefs.audioEnhanced` (camada 1: `noiseSuppression` + `echoCancellation` + `autoGainControl` nativos do browser). Krisp AI processa por cima (camada 2). Resultado: isolamento de voz no nível Google Meet / Zoom.

### v8.10.0 - Krisp AI noise cancellation na call LiveKit (2026-04-22)
- [x] **`@livekit/krisp-noise-filter`** instalado como dependência
- [x] **`useMeetPreferences`** — novo campo `noiseFilter: boolean` (default `true`) adicionado ao `MeetPreferences`
- [x] **`AudioNoiseFilterControl`** — botão na ControlBar que aplica `KrispNoiseFilter()` à faixa de áudio local via `LocalAudioTrack.setProcessor()`. Liga automaticamente ao entrar na call. Toggle persiste em localStorage. Exibe toast se browser não suportar WebAssembly.
- [x] **`MeetRoom.tsx`** — `AudioNoiseFilterControl` montado na `ControlBar` ao lado de `VirtualBackgroundControl`

### v8.9.0 - Melhorias na call LiveKit: notificação sonora, polling de convidados, transcrição em background, fundo virtual (2026-04-22)
- [x] **`GuestApprovalPanel.tsx`** — notificação sonora de novo convidado gerada programaticamente via Web Audio API (dois bipes 880Hz + 1100Hz). Substitui abordagem anterior com `Audio` element + arquivo `.wav` (quebrava por política de autoplay).
- [x] **`useLiveKit.ts` — `useGuestApprovalQueue`** — adicionado `refetchInterval: 2500` como fallback de polling além do Realtime. Novos pedidos de convidados agora aparecem em até 2,5s mesmo se o canal Supabase Realtime demorar.
- [x] **`MeetRoom.tsx` + `useLiveKitTranscription`** — removido `LiveKitTranscriptOverlay` (toggle visível). Transcrição agora inicia automaticamente em background via componente `SilentTranscription` sem nenhuma UI visível. Saves automáticos em `meetings.transcript_raw` a cada 10s mantidos.
- [x] **`VirtualBackgroundControl.tsx`** — botão "Fundo" agora sempre renderizado (antes `return null` em browsers sem suporte). Em browsers incompatíveis, clique exibe `toast.error` explicando o requisito Chrome 94+/Edge 94+ em vez de ocultar o recurso.

### v8.8.0 - Revisão geral: segurança multi-tenant e bugs de componentes (2026-04-22)
- [x] **`supabase/functions/api/index.ts`** — GET, PATCH e DELETE não filtravam por `tenant_id`; qualquer usuário autenticado podia ler/alterar/deletar registros de outro tenant por UUID. Corrigido com filtro `.eq("tenant_id", tenantId)` em todas as operações. Também corrigido bug de CORS: helper `json()` referenciava `corsHeaders` fora do seu escopo de closure.
- [x] **`src/hooks/useFeed.ts`** — `useFeedPosts`, `useFeedReactions` e `useFeedComments` sem filtro `tenant_id`. Corrigidas as três queries + cache keys de mutações passam a incluir `tenantId`.
- [x] **`src/hooks/useProjects.ts`** — 5 mutações invalidavam cache com `["projects"]` genérico (sem `tenantId`). `useProject` (detalhe) sem filtro `tenant_id`. Ambos corrigidos.
- [x] **`src/hooks/useEmployees.ts`** — `useEmployee` (hierarquia + detalhe) e `useEmployeeStatusHistory` sem filtro `tenant_id`. Corrigidos. `useEmployeeStatusHistory` passa a usar `useAuth()` para obter `tenantId`.
- [x] **`src/hooks/useAreas.ts`** — `useAreas`, `useSubareas` e `usePositions` sem filtro `tenant_id` nas queries SELECT. Cache invalidations usavam keys genéricas. Tudo corrigido.
- [x] **`supabase/functions/agent-gateway/index.ts`** — `create_task` não validava que `project_id` pertence ao tenant da API key. Corrigido com lookup de ownership antes do INSERT.
- [x] **`supabase/functions/manage-access/index.ts`** — URL de reset de senha hardcoded (`gt3.empirebusiness.com.br`). Substituída por `Deno.env.get("SITE_URL")`.
- [x] **Migration `20260422100000_fix_chat_polls_rls.sql`** — policy `chat_polls_update` permitia managers editarem qualquer poll do tenant sem verificar participação na conversa. Corrigido com check via `chat_my_conversation_ids()`.
- [x] **`MeetingRecorder.tsx`** — race condition: `soniox.transcript` lido antes do `await soniox.stop()`, podendo capturar transcrição incompleta. Leitura movida para após o stop.
- [x] **`GuestApprovalPanel.tsx`** — `supabase.removeChannel()` sem chamar `channel.unsubscribe()` primeiro, causando acumulação de canais no ciclo de vida do componente.
- [x] **`MeetingEditDialog.tsx`** — `meeting_mode` era aceito com `as any` sem validação; agora valida contra array de modos válidos antes de usar.

### v8.7.9 - 2ª rodada auditoria LiveKit (2026-04-22)
- [x] **`MeetingEditDialog.tsx`** — ao mudar modo para `livekit`, gera `livekit_room_name` se reunião não tinha. Antes o botão "Entrar" nunca aparecia nessas reuniões.
- [x] **`useMeetings.ts`** — `useMeetingsList` e `useMeetingDetail` passam a filtrar por `tenant_id` no client (CLAUDE.md: RLS + filtro explícito obrigatórios).
- [x] **`.env`** — adicionado `S3_PUBLIC_URL` (alias de `S3_PUBLIC_DEVELOPMENT_URL`) para `livekit-webhook` funcionar localmente sem gerar `"undefined/<arquivo>"` como URL de gravação.

### v8.7.8 - Auditoria completa e fixes críticos LiveKit (2026-04-22)
- [x] **`MeetRoom.tsx`** — `useMeetingByRoomName` agora usa `createIfMissing: isHost` (era `isHost && prefs.liveTranscriptionEnabled`). O registro de reunião nunca era criado com transcrição desligada (default `false`), causando 404 para todos os convidados.
- [x] **`livekit-guest-decision`** — substituído `getClaims(token)` por `getUser()`. Aprovação retornava 401 em todos os casos.
- [x] **`livekit-token`** — substituído `getClaims(token)` por `getUser()` (robustez; token para entrar na sala).
- [x] **`livekit-end-room`** — (1) `getClaims` → `getUser()`; (2) coluna `transcriptions` (inexistente) → `transcript_raw`; meeting-ai nunca era disparado do encerramento.
- [x] **`livekit-start-huddle`** — substituído `getClaims(token)` por `getUser()`; huddles retornavam 401.
- [x] **`MeetGuest.tsx`** — polling via `useGuestRequestStatus` parava ao obter token (`!lkToken`); `phase` muda para `"in-call"` ao confirmar PreJoin, zerando polling residual.

### v8.7.7 - Transcrição Soniox em tempo real DENTRO da call LiveKit (2026-04-22)
- [x] **Hook reutilizável `useSoniox`** (`src/hooks/useSoniox.ts`) — extrai todo o pipeline Soniox (temp key, AudioWorklet + fallback ScriptProcessor, downsample 16kHz, WS com reconexão exponencial, diarização) num único hook que aceita **mic local** (`captureFromMic: true`) **OU** **streams externas via ref** (`externalStreams`). Mixagem unificada num `MediaStreamAudioDestinationNode` compartilhado.
- [x] **Hook `useLiveKitTranscription`** (`src/hooks/useLiveKitTranscription.ts`) — coleta `MediaStreamTrack` de todos os mics da sala via `useTracks([Track.Source.Microphone], { onlySubscribed: true })`, reagrupa em ref e passa pro `useSoniox`. Auto-save em `meetings.transcript_raw` a cada 10s.
- [x] **Overlay `LiveKitTranscriptOverlay`** — painel flutuante (canto inferior-esquerdo, acima da ControlBar) com captions ao vivo, badge AO VIVO/Reconectando, toggle Captions ON/OFF colapsável. Cores por speaker via tokens semânticos.
- [x] **Toggle persistido** em `useMeetPreferences.liveTranscriptionEnabled` (default `false` — opt-in, custo Soniox).
- [x] **Hook `useMeetingByRoomName`** — vincula `livekit_room_name` ↔ `meetings.id`; cria registro sob demanda quando o host ativa a transcrição.
- [x] **Auto-disparo `meeting-ai`** ao encerrar via `useEndRoom` — se houver `transcript_raw`, dispara processamento IA em background (resumo + tarefas/projetos sugeridos no fluxo de aprovação).
- [x] **Refatoração `MeetingRecorder.tsx`** — removido código duplicado de WS/worklet/downsample (~400 linhas → ~330). System audio agora é exposto como external stream pro hook compartilhado.
- [x] **Documentação**: memória `mem://features/livekit-meetings` atualizada com nova capacidade de transcrição em tempo real durante a call.


- [x] **BUGFIX crítico de gravação** — webhook `livekit-webhook` extraía `roomName` apenas de `event.room?.name`, mas eventos `egress_started`/`egress_updated`/`egress_ended` chegam **sem `event.room`** (logs: `egress_ended room=undefined`). Resultado: `recording_url` nunca era salvo e todas as 5 gravações registradas ficaram em `recording_status='pending'` para sempre.
- [x] **Fix**: extrair `roomName` de `event.egressInfo?.roomName` como fallback + lookup secundário por `event.egressInfo?.egressId` → `meetings.egress_id`. Logs agora mostram `room` e `egress` em todo evento.
- [x] **Botão "Encerrar para todos" dentro da sala** — re-adicionado no `MeetRoom.tsx` posicionado no canto superior **ESQUERDO** (longe do "Convidar externo" no canto direito e da ControlBar do LiveKit no rodapé) com `AlertDialog` de **confirmação dupla** (clique abre dialog → segundo clique em "Sim, encerrar para todos" executa). Toast de sucesso/erro. Mantido o botão equivalente na aba Info de `/reunioes`.
- [x] **Documentação**: `docs/integrations/LIVEKIT.md` (gotcha do webhook + seção "Encerrar sala") atualizada.

### v8.7.0 - LiveKit: Convidados externos com aprovação manual + reorganização do botão Encerrar (2026-04-22)
- [x] **Nova tabela `meeting_guest_requests`** (id, meeting_id FK, livekit_room_name, guest_name, guest_token UUID único, status, requested_at, decided_at, decided_by, tenant_id) com RLS — host/admin podem `SELECT`/`UPDATE`; convidado lê via edge function pública usando `guest_token`. Realtime habilitado.
- [x] **4 edge functions novas** (todas `verify_jwt = false`, validação interna):
  - `livekit-guest-request` (público) — convidado solicita entrada; valida sala ativa.
  - `livekit-guest-status` (público) — convidado faz polling do próprio pedido via `guest_token`.
  - `livekit-guest-decision` (autenticada) — host aprova/recusa.
  - `livekit-guest-token` (público) — emite JWT LiveKit ao convidado aprovado, sem `roomAdmin`/`roomRecord`.
- [x] **Página pública `/meet/:roomId/guest`** (`src/pages/MeetGuest.tsx`) — fluxo: nome → solicitar → aguardar (spinner com polling 2.5s) → PreJoin → entrar; tela dedicada para "recusado".
- [x] **Componente `GuestApprovalPanel`** — painel flutuante para o host com lista de pedidos pendentes via realtime + toast ao receber novo pedido + botões Admitir/Recusar.
- [x] **Componente `CopyGuestLinkButton`** — botão reutilizável que copia `${VITE_SITE_URL}/meet/${roomName}/guest` (usado em `MeetingCard`, `MeetRoom` e aba Info de `Reunioes`).
- [x] **Hooks novos** em `useLiveKit.ts`: `getGuestMeetUrl`, `useGuestRequest`, `useGuestRequestStatus`, `useGuestToken`, `useGuestApprovalQueue`, `useDecideGuestRequest`.
- [x] **Reorganização UX**: removido o botão flutuante "Encerrar para todos" do `MeetRoom.tsx` (atrapalhava a barra do LiveKit); botão movido para a aba Info de `/reunioes` dentro do card "Controles do host" (visível apenas para o host quando a sala estiver ao vivo) com `AlertDialog` de confirmação.
- [x] **Rota pública `/meet/:roomId/guest`** declarada **fora** do `<ProtectedRoute>` em `src/App.tsx`.
- [x] **Segurança**: `guest_token` (UUID v4) separado do `request_id` evita enumeração; convidado não recebe `roomAdmin`/`roomRecord`; pedido só é aceito enquanto sala estiver `scheduled`/`recording`.
- [x] **Documentação**: `docs/integrations/LIVEKIT.md` (nova seção "Convidados externos com aprovação"), ROADMAP/MUDANCAS, memória `mem://features/livekit-meetings`.

### v8.6.1 - Hotfix: rota /meet/:roomId faltando no router (2026-04-22)
- [x] **Bug crítico**: a rota `/meet/:roomId` da videoconferência LiveKit nunca foi declarada em `src/App.tsx` — qualquer acesso (preview ou domínio) caía em `NotFound` via splat `*`
- [x] **Fix**: rota adicionada **dentro** de `<ProtectedRoute>` mas **fora** de `<AppLayout>` (videochamada precisa ser fullscreen, sem sidebar)
- [x] **Validação**: navegação ao preview confirma que `/meet/test-room` agora resolve (redireciona para login se não autenticado, em vez de NotFound)
- [x] **Próximo passo manual**: redeploy no Vercel para propagar o build novo a `gt3.omnx.pro`

### v8.6.0 - Videoconferência nativa LiveKit (substitui Google Meet) + Huddles no Chat (2026-04-22)
- [x] **Schema novo**: colunas em `meetings` (`meeting_mode`, `livekit_room_name UNIQUE`, `recording_url`, `recording_status`, `egress_id`, `live_participants`); tabelas `chat_huddles` (huddles efêmeros vinculados a conversas) e `meeting_recording_events` (auditoria do ciclo de gravação) — RLS por tenant + Realtime
- [x] **Edge functions** (4 novas): `livekit-token` (JWT por role host/guest/observer + auth check), `livekit-webhook` (lifecycle do Egress MP4 → R2 + auditoria), `livekit-end-room` (host encerra + auto-trigger `meeting-ai`), `livekit-start-huddle` (cria huddle + posta system message no chat)
- [x] **Página `/meet/:roomId`** (`src/pages/MeetRoom.tsx`): PreJoin + LiveKitRoom + VideoConference fullscreen; roles via querystring; observer pula PreJoin; botão "Encerrar para todos" exclusivo do host
- [x] **Hook `useLiveKit`** (`src/hooks/useLiveKit.ts`): `generateRoomName`, `getMeetUrl` (sempre via `VITE_SITE_URL`), `useMeetToken`, `useEndRoom`, `useStartHuddle`, `useActiveHuddle`
- [x] **Integração Reuniões**: `MeetingEditDialog` ganha seletor de modo (Sala Empire Manager / Link externo / Presencial); `MeetingCard` exibe badge "🔴 Ao vivo" + botão "Entrar" (host se for criador); `MeetingSummary` embeda player MP4 quando `recording_url` está pronto
- [x] **Integração Chat (huddles)**: botão `Video` no header de cada conversa inicia/entra em huddle; banner verde "Huddle ao vivo — Entrar" no topo da conversa via `HuddleBanner` (realtime); slash command `/huddle` no `SlashMenu`
- [x] **Storage**: gravações em Cloudflare R2 (zero egress fees), MP4 com `+faststart` (compatível iOS/Android)
- [x] **Documentação**: `docs/integrations/LIVEKIT.md` (setup completo, secrets, gotchas) + atualização ROADMAP/MUDANCAS + memória `mem://features/livekit-meetings`
- [x] **Compliance CLAUDE.md**: zero cores hardcoded, RLS server-side por tenant + participação no canal, tokens semânticos puros, dark mode validado

### v8.5.1 - Chat: Integração final (BookmarksBar, StatusPicker, ConversationContextMenu, UnreadDivider, atalhos) (2026-04-21)
- [x] **BookmarksBar** plugada no header do canal (areas/grupos/projetos) abaixo da PinnedBar
- [x] **StatusPicker** integrado no header da lista de conversas (ícone Smile, abre Popover com presets e DND)
- [x] **Botão Activity** no header → `/chat/activity`; atalho global **⌘⇧M**
- [x] **ConversationContextMenu** plugado em cada `ConvItem` (pin/mute/archive/marcar como não lida) — visível no hover
- [x] **UnreadDivider** renderizado acima da 1ª mensagem recebida após `last_read_at` (snapshot ao abrir o canal — não some ao marcar como lido)
- [x] **Lista reorganizada**: nova seção "Fixadas" no topo, conversas arquivadas ocultas atrás de toggle, badges 📌 / 🔕 inline, badge de não lidas em cor neutra quando silenciada
- [x] **Atalhos globais**: `⌘K` (Quick Switcher), `⌘⇧M` (Activity), `⌘.` (fechar thread), `↑` em compose vazio (editar última mensagem via CustomEvent)
- [x] **Hook `useMyParticipantStates`**: 1 query única para todos os estados pessoais (pinned/muted/archived/unread_override/last_read_at)

### v8.5.0 - Chat Fase 4: Status, DND, Activity Center, Polls, Lembretes, Bookmarks, Slash menu (2026-04-21)
- [x] **Schema novo**: tabelas `chat_reminders` (lembretes pessoais), `chat_polls` + `chat_poll_options` + `chat_poll_votes` (enquetes nativas), `chat_channel_bookmarks` (links fixos por canal); coluna `chat_conversations.canvas_doc_id` (FK lógica para `process_documents`); todas com RLS por tenant + canal e Realtime
- [x] **Status do usuário** (texto + emoji) e **Não perturbe (DND)**: novo `StatusPicker` com presets (Em reunião, Em foco…) e duração do DND (1h/4h/8h/24h); persistido em `chat_presence.status_emoji`, `status_text`, `dnd_until`
- [x] **Polls inline**: `PollMessage` renderiza enquete com barras animadas, suporte a múltipla escolha e estado encerrada; hooks `useChatPoll`, `useCreatePoll`, `useVotePoll`
- [x] **Lembretes**: hooks `useMyReminders`, `useCreateReminder`, `useDeleteReminder` + parser `parseReminderExpression` (`amanhã 9h`, `1h`, `30m`, `2d`)
- [x] **Channel bookmarks**: `BookmarksBar` (links fixos abaixo do header) com criação/exclusão admin/manager e abertura em nova aba
- [x] **Slash menu**: `SlashMenu` (`/lembrete`, `/poll`, `/me`, `/tarefa`, `/processo`) acima do compose
- [x] **Activity Center** (`/chat/activity`): caixa unificada com menções (`chat_mentions`), salvas (`chat_starred_messages`) e lembretes — clique navega direto para a conversa
- [x] **Hooks novos**: `useUserStatus` (`useMyPresence`, `useSetUserStatus`, `useSetDND`), `useChatBookmarks` (+ add/delete), `useChatPolls` (+ create/vote), `useChatReminders` (+ parser)
- [x] **Componentes novos**: `StatusPicker`, `BookmarksBar`, `PollMessage`, `SlashMenu` em `src/components/chat/`
- [x] **Página nova**: `src/pages/ChatActivity.tsx` (rota `/chat/activity`, lazy-loaded)
- [x] **Compliance CLAUDE.md**: zero cores hardcoded, RLS server-side por tenant + participação no canal, invalidações cirúrgicas, dark mode validado, permissões via `usePermissions`

### v8.4.0 - Chat Fase 3: Organização — labels, archive/mute/pin, Quick Switcher, drafts, divisor unread (2026-04-21)
- [x] **Schema novo**: tabelas `chat_conversation_labels` (cor + nome por tenant) e `chat_conversation_label_assignments` (junção); colunas `chat_participants.archived_at`, `muted_until`, `pinned_at`, `unread_override` — RLS por tenant + Realtime
- [x] **Hooks novos**: `useChatLabels` (CRUD + atribuição), `useChatParticipantState` (`useArchive/Mute/Pin/MarkUnread`), `useChatDraft` (localStorage por `tenant + user + conv`)
- [x] **Quick Switcher (Cmd/Ctrl+K)**: novo `QuickSwitcher` baseado em `CommandDialog` com fuzzy search de conversas/canais/DMs e ícones por tipo; atalho global registrado em `Chat.tsx`
- [x] **Conversation context menu**: novo `ConversationContextMenu` para fixar/desfixar, silenciar (1h/8h/24h/sempre), arquivar/desarquivar e marcar como não lida
- [x] **Unread divider**: novo `UnreadDivider` ("Novas mensagens") pronto para inserir acima da primeira mensagem não lida
- [x] **Rascunhos persistidos**: `useChatDraft` mantém texto digitado por conversa entre sessões (escopo por tenant + user)
- [x] **Compliance CLAUDE.md**: zero cores hardcoded, RLS server-side, invalidações cirúrgicas (`["chat", "conversations", tenantId]`), permissões via `usePermissions`, dark mode + tokens semânticos

### v8.3.0 - Chat Fase 2: Menções, Pinned, Galeria, Tópico do canal, Apagar p/ mim, Compressão de imagem (2026-04-21)
- [x] **Schema novo**: `chat_messages.pinned_at`, `pinned_by`, `deleted_for uuid[]`; `chat_conversations.topic`; tabela `chat_mentions` (`message_id`, `mentioned_employee_id`, `conversation_id`, `mention_type`, `read_at`) com RLS por `tenant_id` e Realtime
- [x] **@menções com autocomplete**: novo `MentionAutocomplete` (popover acima do compose), parser `extractMentionTokens` resolve handles → `employee_id`, persiste em `chat_mentions` ao enviar (hook `useCreateMentions`); `MentionRichText` desenha pílulas no balão (auto-destaque para "menção a mim")
- [x] **@here / @channel** em canais de área e grupos: `@here` notifica apenas online (resolvido via `useTenantPresence`); `@channel` notifica todos os participantes
- [x] **Mensagens fixadas (pinned)**: dropdown "Fixar mensagem" no menu da bolha (admin/manager via `usePermissions`), barra `PinnedBar` no topo do canal com contagem + sheet lateral com lista clicável (jump-to)
- [x] **Galeria de mídia**: novo `MediaGallerySheet` com tabs Imagens · Vídeos · Áudios · Arquivos, agrupado por mês via `useChatGallery`
- [x] **Compressão de imagem**: `maybeCompressImage` (`browser-image-compression`) reduz imagens > 2 MB para ≤ 1.5 MB / 1920px antes do upload
- [x] **Apagar para mim** vs. **apagar para todos**: nova ação no dropdown da bolha (`useDeleteMessageForMe` + `filterDeletedForMe`); apagar para todos continua via `useDeleteChatMessage`
- [x] **Link / video preview** dentro do chat: `extractVideoEmbeds` + `LinkEmbed` (YouTube/Vimeo) reusados do feed
- [x] **Tópico/descrição do canal** editáveis: `ChannelMetaDialog` (admin/manager), tópico exibido logo abaixo do nome no header, ícone Settings no header
- [x] **Hooks novos**: `useChatMentions`, `useChatPinned`, `useChatGallery`, `useChatChannelMeta`, `useChatDeleteForMe`
- [x] **Componentes novos**: `MentionAutocomplete`, `MentionRichText`, `PinnedBar`, `MediaGallerySheet`, `ChannelMetaDialog`
- [x] Zero cores hardcoded; tokens semânticos puros; dark mode validado; touch targets ≥ 36–44px; gates server-side via RLS + client via `usePermissions`

### v8.2.0 - Chat Corporativo World-Class Fase 1: Threads, Presença, Saved, Forward, Search (2026-04-21)
- [x] **Schema novo**: `chat_messages.thread_root_id` (FK self), tabela `chat_presence` (online/last seen/status/DND), tabela `chat_starred_messages` (mensagens salvas por usuário) — todas com RLS por `tenant_id` e `security_invoker`
- [x] **Realtime**: `chat_messages`, `chat_reactions`, `chat_presence` adicionadas à publication `supabase_realtime` — substitui o polling de 3s por updates push (latência <100ms)
- [x] **Threads estilo Slack**: novo painel lateral `ThreadPanel` com hook `useThreadMessages` + contador de respostas (`useThreadCounts`) por mensagem-raiz, badge clicável na bolha
- [x] **Presença global**: hook `useChatPresenceHeartbeat` integrado em `AppLayout` (heartbeat 30s) + `useTenantPresence` consultado pela página, `PresenceDot` no header de DMs com "Online"/"Visto há…"
- [x] **Mensagens salvas**: hooks `useChatStarredMessages`, `useToggleStarMessage`, `useStarredMessageIds` + componente `SavedMessagesSheet` acessível pela estrela na lista de conversas
- [x] **Encaminhar mensagem**: novo `ForwardDialog` permite reenviar a outra conversa preservando texto e anexos
- [x] **Busca local na conversa**: `ChatSearchBar` triggerada por `Cmd/Ctrl+F` com `jumpToMessage` (scroll suave + highlight temporário do alvo)
- [x] **Emoji picker real**: `ChatEmojiPicker` (emoji-mart) substitui as 5 reações fixas — qualquer emoji disponível
- [x] **AlertDialog**: substitui `confirm()` nativo em deletar mensagem e remover membro de grupo
- [x] **Acessibilidade & UX**: badge "x respostas" na bolha, indicador de salvo (⭐), estados Online/Last seen, atalhos `Esc` para fechar painéis e busca
- [x] Zero cores hardcoded — 100% tokens semânticos em `Chat.tsx` e em todos os componentes novos do chat

### v8.1.4 - AudioPlayer: contém overflow no chat + paleta WhatsApp + contraste dark mode (2026-04-21)
- [x] `BARS` reduzido de 48 → 32 e `gap-px` no waveform — economiza ~96px de largura mínima, evitando vazamento do player para fora do balão (`max-w-[70%]`) em viewports estreitas
- [x] Cada barra agora usa `min-w-[1px]` (em vez de `min-w-2`) e o waveform recebeu `min-w-0`, garantindo encolhimento real dentro de containers restritos
- [x] Botão play da variante `chat` reduzido para `w-10 h-10` (40px touch target mantido)
- [x] Paleta "minha mensagem" (chat + isMine) alinhada ao WhatsApp: container `bg-transparent` (herda o indigo do balão), barras restantes `bg-primary-foreground/45`, botão speed `bg-primary-foreground/25` com hover `/40`, botão transcrever vira pílula `bg-primary-foreground/15` sem borda translúcida frouxa
- [x] Botão de speed na variante `default` (Feed) trocou `bg-background` por `bg-card` (sólido em dark mode, sem alpha — alinhado a `mem://style/dark-mode-specification`)
- [x] Botão "Ver/Ocultar transcrição" com `truncate` para evitar clipping em larguras pequenas
- [x] Zero cores hardcoded — 100% tokens semânticos

### v8.1.3 - Player de áudio: dark mode + overflow no chat (2026-04-21)
- [x] `AudioPlayer` no Chat: removido `bg-white/10`/`bg-white` em mensagens minhas (efeito "vidro fosco" desbotado no dark mode) — agora usa tokens semânticos `bg-primary-foreground/15` e `bg-primary-foreground` que respeitam o tema
- [x] Removido `min-w-[220px]` / `min-w-[240px]` do container do player que causava overflow horizontal na bolha do chat (`max-w-[70%]`) quando a sidebar estava expandida
- [x] Container e wrapper externo agora usam `w-full min-w-0 max-w-full overflow-hidden` para encolher corretamente dentro de qualquer largura de bolha
- [x] Zero cores hardcoded — 100% tokens semânticos (consistente com `mem://style/color-tokens`)

### v8.1.2 - Transcrição automática de áudio (Feed + Chat) (2026-04-21)
- [x] `AudioPlayer` dispara transcrição automaticamente ao montar (em `requestIdleCallback`) quando o áudio ainda não tem cache em `feed_audio_transcriptions`
- [x] Transcrições já cacheadas aparecem expandidas por padrão — sem necessidade de clicar em "Ver transcrição"
- [x] Deduplicação global por URL via `Map` em memória — múltiplos players do mesmo áudio (ex.: lista de comentários) compartilham uma única chamada à edge function
- [x] Falhas na transcrição automática são silenciosas (apenas `console.warn`) — o botão manual "Transcrever áudio" continua disponível como fallback e exibe `toast.error` em falha
- [x] Vale para Feed (posts/comentários) e Chat (mensagens) — ambos usam o mesmo componente compartilhado

### v8.1.1 - Player de áudio estilo WhatsApp (Feed + Chat) (2026-04-21)
- [x] Novo componente compartilhado `src/components/shared/AudioPlayer.tsx` com play/pause circular, waveform dinâmico, controle de velocidade (1x → 1.5x → 2x), seek por clique e transcrição on-demand
- [x] Waveform real via Web Audio API (RMS por bucket, 48 picos) com fallback determinístico (hash da URL) para CORS, arquivos > 5 MB ou navegadores sem `AudioContext`; cache em memória por URL
- [x] Variantes `default` (posts), `dense` (comentários) e `chat` (com paleta `isMine` em branco para mensagens próprias)
- [x] `AttachmentRenderer` (Feed) passa a usar `AudioPlayer` e remove implementação duplicada de transcrição
- [x] `MsgAttachments` (Chat) substitui `<audio controls>` nativo pelo `AudioPlayer` com `variant="chat"` e `isMine` herdado da bolha
- [x] Transcrição compartilha cache entre Feed e Chat via tabela `feed_audio_transcriptions` (chaveada por `tenant_id` + `attachment_url`) — sem novas migrações nem novas edge functions
- [x] Acessibilidade: botões com `aria-label`, slider com `role="slider"` e navegação por teclado (← → para seek 5s, espaço/enter para play/pause), touch target ≥ 44px na variante padrão e chat

### v8.1.0 - Feed: quem reagiu + embeds + transcrição de áudio (2026-04-21)
- [x] Reações no feed mostram avatar, nome e cargo de cada pessoa que reagiu via `HoverCard` (desktop) e `Popover` (mobile)
- [x] Embeds nativos de YouTube (watch, shorts, youtu.be) e Vimeo no conteúdo do post (iframe responsivo 16:9, lazy)
- [x] Novo `src/lib/feed-embeds.ts` (parser de URLs) e `src/components/feed/LinkEmbed.tsx`
- [x] Novo `src/components/feed/ReactorList.tsx` reutilizável
- [x] Edge Function `feed-audio-transcribe` chama OpenRouter (modelos multimodais de áudio: Gemini 2.5/2.0 Flash + GPT-4o Audio Preview) com fallback em cascata
- [x] Tabela `feed_audio_transcriptions` (PK + UNIQUE em `tenant_id`+`attachment_url`) com RLS por tenant — cache de transcrições para evitar chamadas repetidas
- [x] Botão "Transcrever áudio" em cada attachment de áudio do feed, com cache hit silencioso ao montar
- [x] Botões de reação com `aria-label` para acessibilidade
- [x] Cores de reação migradas para `text-primary` (token semântico) — sem mais `text-blue-500`/`text-rose-500` no Feed
- [x] `FeedPostCard` aceita `EmployeeWithDetails[]` (corrige erro de tipo pré-existente)

### v8.0.0 - Chat Interno Fase 1 (2026-04-20)
- [x] Tabelas `chat_conversations`, `chat_participants`, `chat_messages`, `chat_reactions` com RLS completo
- [x] Tabela `push_subscriptions` para Web Push API
- [x] Bucket `chat-attachments` no Supabase Storage
- [x] Service Worker (`/public/sw.js`) para receber e exibir push notifications
- [x] Edge Function `send-chat-notification` (Web Push + fallback email via Resend)
- [x] Hook `useChat` completo (conversas, mensagens, envio, edição, exclusão, leitura, push)
- [x] Página `/chat` com lista de conversas + thread de mensagens + compose
- [x] Suporte a conversas diretas (1:1), grupos e canais de área
- [x] Mensagens de texto + anexos (imagem, vídeo, áudio, arquivo)
- [x] Gravação de áudio inline no chat
- [x] Responder mensagem (quote/reply)
- [x] Editar e deletar mensagem
- [x] Contador de não lidos por conversa + badge no sidebar
- [x] Banner para ativar Web Push na página do chat
- [x] Polling automático a cada 3s para novas mensagens
- [x] Layout responsivo (mobile: tela cheia / desktop: split)

### v7.9.11 - Visibilidade member de processos por área ou subárea (2026-04-16)
- [x] Helper `user_process_matches_position_or_area` passa a comparar `subarea_id` explicitamente além de `position_id` e `area_id`
- [x] `member` passa a visualizar processos quando sua área ou subárea estiver vinculada ao processo
- [x] Empty state de processos atualizado para refletir cargo, área e subárea

### v7.9.10 - Visibilidade member por membro direto de projeto (2026-04-16)
- [x] `projects_select` para `member` passa a considerar membership direto em `employee_projects`
- [x] Regra final de visibilidade de projeto para `member` combina membership direto com tarefa atribuída
- [x] Documentação atualizada para refletir a regra aplicada no banco

### v7.9.9 - Visibilidade member por multi-assignee de tarefa (2026-04-16)
- [x] Helper `user_has_project_assigned_task` passa a considerar `tasks.assignee_id` e `task_assignees`
- [x] `projects_select` para `member` mantém a regra de tarefa atribuída e inclui explicitamente o caso de usuário adicionado na tarefa
- [x] Documentação de arquitetura atualizada para refletir a regra final de visibilidade

### v7.9.8 - Alinhamento UI/RLS do manager (2026-04-13)
- [x] Manager nao ve mais acao de excluir projeto; RLS continua com delete de projetos somente para admin
- [x] Manager volta a gerir processos, pastas, tags, anexos, documento e diagrama via `canManageProcesses`
- [x] Exclusao de processo permanece disponivel somente para admin
- [x] Comunicados: manager cria comunicados, mas edita/exclui somente os proprios; admin edita/exclui todos
- [x] Busca global deixa de listar Configuracoes para usuarios sem role admin

### v7.9.7 - Fix menu flutuante do editor de documentos (2026-04-13)
- [x] Corrigido menu flutuante do `RichTextEditor` que perdia a seleção ao clicar em negrito, itálico, sublinhado e demais ações
- [x] Botões de formatação agora preservam o foco/seleção do Tiptap antes de executar comandos

### v7.9.6 - Visibilidade member por cargo ou área (2026-04-13)
- [x] RLS `projects_select` restringe `member` a projetos vinculados ao seu cargo OU área
- [x] Projetos herdados da diretoria da área ficam visíveis para subordinados da mesma área
- [x] RLS `processes_select`, `steps_select`, `process_positions_select` e `tenant_select_process_areas` passam a usar a mesma regra por cargo/área
- [x] Helpers `SECURITY DEFINER` centralizam leitura de projetos/processos e evitam recursão entre policies

### v7.9.5 - Ingestao de webhooks GHL (2026-04-13)
- [x] Tabela `ghl_webhook_sources` criada para configurar fontes do GoHighLevel por tenant com token em SHA-256
- [x] Tabela `ghl_webhook_events` criada para armazenar payload bruto, JSON parseado, headers sanitizados, query params e metadados inferidos
- [x] Helper SQL `hash_ghl_webhook_token(token)` criado para gerar o hash usado no cadastro da fonte
- [x] Edge Function `ghl-webhook` criada para receber POST publico do GHL, validar token e persistir o evento com `service_role`

### v7.9.4 — UX de comentários, imagens e etiquetas em tarefas (2026-04-09)
- [x] Comentários de tarefas agora aceitam múltiplas linhas com `Shift+Enter` e envio com `Enter`
- [x] Colar imagem com `Ctrl+V` na descrição da tarefa insere a imagem no conteúdo e mantém o arquivo nos anexos
- [x] Colar imagem com `Ctrl+V` no comentário insere a imagem no texto do comentário em vez de colar só caminho/URL
- [x] Etiquetas da tarefa não são mais removidas ao clicar no chip; remoção fica restrita ao botão `x`

### v7.9.3 — Fix RLS ao criar processo (2026-04-09)
- [x] Fix: INSERT em `processes` violava RLS — `created_by` ausente e `tenant_id` podia ser `undefined` em runtime apesar do `!` TypeScript
- [x] `useProcesses.createProcess`: adicionado `created_by: user.id`, guard explícito antes do INSERT, removido non-null assertion inseguro

### v7.9.1 — Editor de Documentos Notion-like (2026-03-30)
- [x] Menu de slash commands (`/`) — digitar `/` abre menu com blocos: títulos, listas, checklist, citação, código, tabela, imagem, separador
- [x] Bubble menu flutuante — toolbar aparece ao selecionar texto com formatação rápida (negrito, itálico, sublinhado, tachado, destaque, código, link, título)
- [x] Auto-save com debounce (2s) — salva automaticamente ao editar, com indicador visual de status (salvando/salvo/alterações não salvas)
- [x] Atalho Ctrl+S para salvar manualmente
- [x] Editor abre direto em modo edição (ao invés de visualização) para fluxo mais fluido
- [x] Clique no modo visualização entra automaticamente em edição
- [x] Tooltips com atalhos de teclado nos botões da toolbar
- [x] Melhorias visuais ProseMirror: tipografia, espaçamento, hierarquia de headings, caret colorido, seleção estilizada, hover em imagens, code blocks, task items checked com strikethrough
- [x] Placeholder melhorado: "Digite '/' para comandos..."
- [x] Upload de imagem direto pelo botão (file picker) ao invés de prompt URL

### v7.9.0 — Kanban Avançado + Notificações + Multi-Assignees (2026-03-19)
- [x] Fix: datas de vencimento exibiam 1 dia antes (timezone UTC-3) — novo utilitário `date-utils.ts` com `normalizeDateForSave`, `extractDateForInput`, `parseDateSafe`
- [x] Fix: drag-and-drop impreciso no Kanban — `batchUpdateSortOrder` recalcula sort_order de todas as tasks das colunas afetadas
- [x] Novo status `ajustes` (entre review e done) e `arquivado` (após done) — migration SQL + toggle "Mostrar Arquivados" no Kanban
- [x] Ordenação por prioridade e data de vencimento — dropdown no toolbar, drag desabilitado quando sort !== manual
- [x] Filtros por data (range) e status temporal (atrasado/em dia/sem data) — inputs de data + dropdown + botão limpar filtros
- [x] Seleção em lote — batch mode com checkbox nos cards + barra flutuante para mover status, prioridade, atribuir, excluir
- [x] Múltiplos responsáveis por tarefa — tabela `task_assignees` + avatar stack nos cards + multi-select no modal
- [x] Tarefas recorrentes — tabela `task_recurrence` + componente `RecurrenceConfig` no modal de detalhe
- [x] Sistema de notificações — tabela `notifications` + hook `useNotifications` com realtime + `NotificationsPopover` no header
- [x] Usabilidade mobile — filtros colapsáveis no Kanban, touch targets adequados

### v7.8.1 — Fix Editor de Documentos (2026-03-16)
- [x] `ProcessDocEditor`: sub-componentes inlinados como variáveis JSX — elimina perda de foco/tela sumindo ao digitar
- [x] Reset de conteúdo local via `prevDocIdRef` — impede sobrescrita após save + re-fetch do cache
- [x] TOC com `debouncedContent` (300ms) — sem recalculo a cada keystroke

### v7.8.0 — Documentos Anexos em Processos (2026-03-15)
- [x] Tabela `process_doc_folders` (pastas de anexos por processo) + RLS tenant isolation + acesso público via token
- [x] Tabela `process_documents` (documentos/arquivos por processo) + RLS tenant isolation + acesso público via token
- [x] Índices em `process_id`, `folder_id`, `tenant_id`, `public_token`
- [x] Hook `useProcessDocuments(processId)`: CRUD completo de pastas e documentos, upload de arquivos/imagens, reordenação, bulk toggle público
- [x] Componente `ProcessAttachments`: UI idêntica ao `ProjectDocuments`, usando `canManageStructure` para permissões
- [x] `ProcessoDetalhes.tsx`: aba "Anexos" (ícone Paperclip) adicionada como 3ª aba; TabsList expandida para `max-w-lg`
- [x] SQL Migration: `process_doc_folders` + `process_documents` + índices + RLS policies

### v7.7.3 — Fix RLS processes_select para criadores (2026-03-15)
- [x] `processes_select` agora inclui `created_by = auth.uid()` para que managers vejam processos recém-criados mesmo sem posições vinculadas
- [x] Migration `20260315000001_fix_processes_select_creator.sql`

### v7.7.2 — Fix RLS recursão projects↔tasks + Colaboradores error handling (2026-03-12)

### v7.7.1 — Permissão de Manager para Criar Processos (2026-03-11)
- [x] RLS `processes_insert_admin` e `processes_update_admin` estendidos para `manager`
- [x] RLS `steps_insert_admin` e `steps_update_admin` estendidos para `manager`
- [x] `PermissionGuard` no botão "Novo Processo com IA" atualizado para `["admin", "manager"]`
- [x] Migration `20260311000003_processes_manager_rls.sql`

### v7.7.0 — Pastas e Tags para Processos (2026-03-11)
- [x] Tabela `process_folders` com suporte a sub-pastas (parent_id recursivo) + RLS tenant isolation
- [x] Tabela `process_tags` (nome + cor) + RLS tenant isolation
- [x] Tabela `process_tag_assignments` (junction process ↔ tag) + RLS
- [x] Coluna `folder_id` em `processes` (FK → process_folders, nullable, on delete set null)
- [x] Hook `useProcessFolders`: CRUD de pastas (createFolder, renameFolder, deleteFolder, moveFolder)
- [x] Hook `useProcessTags`: CRUD de tags + assignments (assignTag, removeTag)
- [x] `useProcesses` atualizado: filtro folder_id, fetch tags por processo, mutation moveToFolder
- [x] Componente `ProcessFolderTree`: sidebar com árvore recursiva, collapse, criação inline, context menu
- [x] Componente `ProcessTagFilter`: barra de chips coloridos filtrável, modal de CRUD (admin)
- [x] `Processos.tsx`: layout 2 colunas com sidebar colapsável, filtro de tags, mover para pasta, tags nos cards

### v7.5.0 - Visibilidade de Tarefas, Projetos e Reuniões por Atribuição (2026-03-10)
- [x] RLS `tasks_select`: usuário vê apenas tarefas onde é assignee ou é dono do projeto pai; admins veem tudo
- [x] RLS `projects_select`: usuário vê apenas projetos onde criou ou possui tarefa atribuída; admins veem tudo
- [x] RLS `meetings_select`: usuário vê apenas reuniões onde criou ou é participante; admins veem tudo
- [x] RLS `meeting_attendees_select`: usuário vê apenas registros onde é o participante ou criou a reunião
- [x] Empty state contextualizado em `/tarefas`: "Nenhuma tarefa atribuída a você." para não-admins
- [x] Empty state contextualizado em `/projetos`: "Nenhum projeto com tarefas atribuídas a você." para não-admins
- [x] Empty state contextualizado em `/reunioes`: "Nenhuma reunião em que você é participante." para não-admins
- [x] Migration `20260310000002_task_project_meeting_rls.sql`

### v7.4.2 - Visibilidade de Processos por Cargo (2026-03-10)
- [x] RLS `processes_select` restrito a processos vinculados ao cargo do usuário via `process_positions`
- [x] RLS `steps_select` herda visibilidade do processo pai pela mesma cadeia
- [x] RLS `process_positions_select` restrito a posições do próprio usuário
- [x] Empty state contextualizado em `/processos` para não-admins sem cargo vinculado
- [x] Admins continuam vendo todos os processos do tenant

### v7.4.1 - Rename Empire Manager → GT3 (2026-03-10)

### v7.4.0 - Security & Stability Hardening (2026-03-09)
- [x] **C1** Removidos fallbacks hardcoded com credenciais Supabase em `usePublicDocument`
- [x] **C2** `useTasks()` chamado uma única vez no KanbanBoard (elimina estados divergentes)
- [x] **C3** Query `employee_projects` filtra por `tenant_id` para prevenir vazamento cross-tenant
- [x] **C4** Erro na trilha de auditoria (`employee_status_history`) agora propaga exceção
- [x] **A1** Race condition em `useAuth` corrigida: `setLoading(false)` aguarda `fetchProfile` no `INITIAL_SESSION`
- [x] **A2** Invalidação de cache em `useTasks` restrita a `[tenantId, projectId]`
- [x] **A5** Verificação de permissão `canModifyTask()` aplicada uniformemente no drag-and-drop
- [x] **A6** Invalidação de `useKanbanColumns` restrita a `[tenantId]`
- [x] **M2** `supabase/client.ts` lança erro explícito em vez de criar client com strings vazias
- [x] **M3** `canEdit` no KanbanBoard defaulta para `false` quando task não está carregada
- [x] **M5** Página Tarefas exibe erro visível ao usuário quando query falha
- [x] **M6** `.env.example` completo com todas as variáveis necessárias

### v7.3.0 - Design Premium Quick Wins (2026-03-09)
- [x] Tipografia: Plus Jakarta Sans (display) + JetBrains Mono (código)
- [x] Cores: Indigo aprimorado (hover, glow, muted), accent emerald
- [x] Sombras: shadow-primary e shadow-primary-lg com tom da brand
- [x] Hover: Cards com glow sutil + elevação + borda colorida
- [x] Botões: Primary com glow effect no hover
- [x] Animações: Stagger animations para listas (fade-in-up)
- [x] Dark mode: Bordas mais sutis, glow mais pronunciado
- [x] Skeleton: Shimmer effect premium

### v7.3.0 - Extração de Tarefas Aprimorada (2026-03-09)
- [x] Sistema de chunking para transcrições longas (>30k caracteres)
- [x] Arquitetura 2-estágios: análise por chunk + consolidação
- [x] Campos expandidos nas tarefas: steps, dependencies, acceptance_criteria
- [x] Níveis de risco e estimativa de esforço por tarefa
- [x] UI com collapsible details no MeetingApproval
- [x] Persistência de campos expandidos na descrição da tarefa

### v7.2.0 - Upload de Transcrição Manual (2026-03-09)
- [x] Hook useCreateMeetingWithTranscript para transcrições externas
- [x] Botão "Colar Transcrição" na página de Reuniões
- [x] Fix race condition no addSystemAudio

### v7.1.0 - Audio Pipeline (2026-03-08)
- [x] Resampling cross-browser (44.1/48kHz → 16kHz)
- [x] AudioWorklet + fallback ScriptProcessorNode
- [x] Captura de áudio do sistema via getDisplayMedia
- [x] Reconexão WebSocket com backoff exponencial
- [x] VU meter em tempo real

### v7.0.0 - Reuniões com Soniox (2026-03-08)
- [x] Transcrição em tempo real via WebSocket Soniox
- [x] Speaker diarization (PT/EN)
- [x] IA processa transcrição e sugere projetos/tarefas
- [x] Chat de correção IA inline
- [x] Aprovação com edição antes de criar itens

### v6.1.0 - Hierarquia Cargo-Cargo (2026-03-09)
- [x] Migração de `manager_id` (pessoa) para `reports_to_id` (cargo)
- [x] Suporte a cargos vagos no organograma
- [x] Seletor "Reporta para" no cadastro de cargos
- [x] Prevenção de ciclos via trigger no banco
- [x] View `position_hierarchy_view` para cargos com/sem ocupantes
- [x] Hook `usePositionHierarchy()` para árvore de cargos

### v6.0.0 - Sistema de Documentos (2026-02-28)
- [x] Pastas/subpastas hierárquicas
- [x] Editor Notion-like Markdown
- [x] Upload de imagens/arquivos inline
- [x] Importação em massa
- [x] Exportação MD/PDF/ZIP
- [x] Compartilhamento público via link

### v5.x - Polimento e UX
- [x] Áreas & Cargos como organograma visual
- [x] Modal de detalhes do cargo
- [x] Etapa de aprovação antes de criar processos com IA
- [x] Unificação visual dos cards

### v4.x - Animações e Acessibilidade
- [x] AnimatedList stagger
- [x] Dashboard responsive
- [x] Reduced motion
- [x] Print styles

### v3.x - Exportação e IA
- [x] Exportação de processos (PNG/JPEG/PDF/MD)
- [x] Edição de processos com IA
- [x] Sistema de APIs REST
- [x] Webhooks funcionais

---

## 🚧 Em Andamento

Nenhum módulo em andamento no momento.

---

## 📋 Planejado

### v6.2.0 - Sugestão Automática de Gestor
- [ ] Ao cadastrar colaborador, sugerir gestor baseado em `reports_to_id`
- [ ] Notificar gestor automaticamente
- [ ] Dashboard de equipe pendente

### v6.3.0 - Histórico de Ocupação
- [ ] Rastrear quem ocupou cada cargo ao longo do tempo
- [ ] Timeline de mudanças
- [ ] Relatórios de turnover

### v6.4.0 - Deprecação manager_id
- [ ] Remover coluna `manager_id` de employees
- [ ] Limpar código legacy
- [ ] Atualizar todas as queries

### v7.0.0 - Analytics Avançado
- [ ] Dashboard de KPIs por área
- [ ] Gráficos de produtividade
- [ ] Relatórios gerenciais
- [ ] Exportação de relatórios

---

## 💡 Ideias Futuras

### Integrações
- [ ] Slack integration
- [ ] Google Calendar sync
- [ ] Jira integration
- [ ] Notion import/export

### Mobile
- [ ] App nativo iOS
- [ ] App nativo Android
- [ ] PWA offline

### IA
- [ ] Assistente virtual
- [ ] Sugestão de melhorias em processos
- [ ] Análise de gargalos
- [ ] Predição de riscos

---

## Métricas de Sucesso

| Métrica | Meta v6.1 | Meta v7.0 |
|---------|-----------|-----------|
| Tempo para encontrar informação | < 2 min | < 1 min |
| Cobertura do organograma | 100% | 100% |
| Uso semanal | 3+ vezes | 5+ vezes |
| NPS | > 50 | > 60 |
| Cargos com hierarquia definida | 80% | 100% |
| Cargos vagos visíveis | 100% | 100% |

---

## Changelog

### 2026-05-06 (Infra — Reorganização de migrations + setup para clientes)
- docs: `docs/SETUP-DATABASE.md` criado — guia completo para clientes replicarem o banco via Lovable
- docs: `docs/MIGRATIONS.md` criado — documenta o estado das 134 migrations legadas (desatualizadas) e a nova fonte de verdade
- docs: `supabase/migrations/README.md` criado — instruções para novas migrations
- infra: `scripts/setup-database-complete.sql` criado — dump pg_dump oficial do banco de produção (112 tabelas, 603KB)
- infra: `supabase/migrations/00000000000000_init.sql` criado — baseline filtrado para novos projetos
- infra: 134 migrations legadas movidas para `supabase/migrations/archive/` — preservadas em git, mas fora do caminho ativo
- infra: `scripts/setup-edge-functions.sh` criado — deploy automático das 25 Edge Functions para novos projetos
- infra: `scripts/setup-database-post-dump.sql` criado — cria storage buckets e configura pós-dump (idempotente)
- docs: `.env.client-template` criado — template de variáveis para clientes duplicarem o projeto
- docs: `docs/PROCESSO-DUMP-BASELINE.md` criado — processo completo para gerar dumps pg_dump em outros projetos

### 2026-04-22 (v8.7.9 - 2ª rodada auditoria LiveKit)
- fix: `MeetingEditDialog` — gera `livekit_room_name` ao mudar modo para livekit
- fix: `useMeetings` — `useMeetingsList` e `useMeetingDetail` com filtro `tenant_id` explícito
- fix: `.env` — `S3_PUBLIC_URL` adicionado para webhook funcionar em dev local

### 2026-04-22 (v8.7.8 - Auditoria completa + fixes críticos LiveKit)
- fix: `livekit-token` — `getClaims` → `getUser()`; token de entrada na sala podia falhar
- fix: `livekit-end-room` — `getClaims` → `getUser()` + `transcriptions` → `transcript_raw`; meeting-ai nunca era disparado
- fix: `livekit-start-huddle` — `getClaims` → `getUser()`; huddles retornavam 401
- fix: `livekit-guest-decision` — `getClaims` → `getUser()`; aprovação sempre retornava 401
- fix: `MeetRoom.tsx` — `createIfMissing: isHost`; convidados recebiam "Sala não encontrada" com transcrição desligada
- fix: `MeetGuest.tsx` — polling para quando obtém token LiveKit; phase transita para "in-call" ao confirmar PreJoin

### 2026-04-13 (v7.9.7 - Fix editor de documentos)
- fix: botões do menu flutuante do `RichTextEditor` preservam a seleção do texto ao clicar, permitindo aplicar negrito, itálico, sublinhado, destaque, código, link e título

### 2026-04-13 (v7.9.6 - Visibilidade member por cargo ou área)
- security: migration `20260413000002_member_visibility_by_position_area.sql` restringe members a projetos/processos vinculados ao cargo ou área
- security: subordinados de diretor de área herdam visibilidade dos projetos/processos vinculados à mesma área
- security: helpers `user_can_read_project` e `user_can_read_process` centralizam RLS e evitam recursão
- fix: `process_areas` e `process_positions` passam a herdar leitura do processo pai

### 2026-04-13 (v7.9.5 - Ingestao GHL)
- feat: migration `20260413000001_create_ghl_webhook_ingestion.sql` cria `ghl_webhook_sources` e `ghl_webhook_events`
- feat: helper SQL `hash_ghl_webhook_token(token)` gera o SHA-256 do token de fonte GHL
- feat: Edge Function `ghl-webhook` recebe payloads do GoHighLevel e armazena corpo bruto, JSON parseado, headers sanitizados e metadados inferidos
- security: endpoint publico valida token por SHA-256 antes de inserir eventos com `service_role`

### 2026-04-09 (v7.9.4 - UX de tarefas)
- feat: comentários de tarefa agora aceitam quebra de linha com `Shift+Enter` e envio com `Enter`
- feat: colagem de imagem com `Ctrl+V` em descrição/comentário de tarefa passa a inserir imagem renderizável em vez de manter só caminho textual
- fix: etiquetas no modal da tarefa deixam de ser removidas por clique acidental; exclusão agora exige o botão `x`

### 2026-04-08 (v7.9.2 - Fix troca de papel)
- fix: tela `ConfiguraÃ§Ãµes` agora altera `user_roles` via Edge Function `manage-access`, evitando `upsert` client-side bloqueado por RLS
- fix: CORS da Edge Function `manage-access` atualizado para aceitar `https://gt3.empirebusiness.com.br`
- fix: promoÃ§Ã£o para `admin` e demais trocas de papel deixam de falhar com `new row violates row-level security policy`

### 2026-03-30 (v7.9.1 - Editor de Documentos Notion-like)
- feat: Menu de slash commands (`/`) para inserção rápida de blocos (títulos, listas, tabela, imagem, etc.)
- feat: Bubble menu flutuante ao selecionar texto — formatação rápida sem usar toolbar
- feat: Auto-save com debounce (2s) + indicador visual de status + Ctrl+S
- feat: Editor abre direto em modo edição + clique em view entra em edição
- feat: Tooltips com atalhos de teclado nos botões
- improve: Tipografia e espaçamento ProseMirror (headings, code, blockquotes, task lists, imagens)
- improve: Placeholder "Digite '/' para comandos..." + upload de imagem por file picker

### 2026-03-19 (v7.9.0 - Kanban Avançado + Notificações)
- fix: Datas de vencimento exibiam 1 dia antes por timezone UTC-3 — novo utilitário `date-utils.ts`
- fix: Drag-and-drop impreciso no Kanban — `batchUpdateSortOrder` recalcula sort_order completo
- feat: Novos status `ajustes` e `arquivado` com toggle "Mostrar Arquivados" no Kanban
- feat: Ordenação por prioridade e data de vencimento no toolbar do Kanban
- feat: Filtros por data (range) e status temporal (atrasado/em dia/sem data)
- feat: Seleção em lote com barra flutuante (mover status, prioridade, atribuir, excluir)
- feat: Múltiplos responsáveis por tarefa — tabela `task_assignees` + avatar stack + multi-select
- feat: Tarefas recorrentes — tabela `task_recurrence` + componente `RecurrenceConfig`
- feat: Sistema de notificações — tabela `notifications` + `useNotifications` realtime + `NotificationsPopover`
- feat: Usabilidade mobile — filtros colapsáveis, touch targets adequados

### 2026-03-09 (v7.4.0 - Security Hardening)
- fix: Removidas credenciais Supabase hardcoded em usePublicDocument (C1)
- fix: useTasks chamado uma vez no KanbanBoard, eliminando estados divergentes (C2)
- fix: Filtro tenant_id adicionado à query employee_projects (C3)
- fix: Erro de auditoria em updateStatus agora lança exceção em vez de console.error (C4)
- fix: Race condition useAuth — setLoading aguarda fetchProfile no INITIAL_SESSION (A1)
- fix: Invalidação de cache useTasks restrita a [tenantId, projectId] (A2)
- fix: canModifyTask() aplicado a todos os perfis no drag-and-drop (A5)
- fix: Invalidação de cache useKanbanColumns restrita a [tenantId] (A6)
- fix: supabase/client.ts lança erro explícito quando env vars ausentes (M2)
- fix: canEdit defaulta para false em KanbanBoard sem task carregada (M3)
- feat: Estado de erro visível na página Tarefas (M5)
- chore: .env.example atualizado com VITE_SITE_URL, SERVICE_ROLE_KEY, ACCESS_TOKEN (M6)

### 2026-03-09 (v7.3.0 - Design Premium)
- feat: Tipografia Plus Jakarta Sans + JetBrains Mono via Google Fonts
- feat: Indigo aprimorado com variações (hover, glow, muted)
- feat: Accent emerald para CTAs secundários
- feat: Sombras premium com tom da brand (shadow-primary, shadow-primary-lg)
- feat: Hover effects premium nos cards (glow + elevação + borda)
- feat: Botão primary com glow sutil no hover
- feat: Stagger animations para listas (fade-in-up com delay progressivo)
- feat: Dark mode refinado com bordas mais sutis
- feat: Skeleton premium com shimmer effect sofisticado

### 2026-03-09 (v7.3.0 - Tarefas)
- feat: Chunking de transcrições longas (30k chars, 3k overlap)
- feat: Sistema 2-estágios (análise + consolidação)
- feat: Campos expandidos: steps, dependencies, acceptance_criteria, risk_level, effort_estimate
- feat: UI com collapsible details e risk badges no MeetingApproval
- feat: Persistência de campos expandidos em Markdown na descrição da tarefa

### 2026-03-09 (v7.2.0)
- feat: Upload de transcrição manual (Zoom, Teams, etc.)
- fix: Race condition no addSystemAudio

### 2026-03-08 (v7.0.0 - v7.1.0)
- feat: Transcrição em tempo real via Soniox WebSocket
- feat: Speaker diarization (PT/EN)
- feat: Resampling cross-browser (44.1/48kHz → 16kHz)
- feat: AudioWorklet + fallback ScriptProcessorNode
- feat: Captura de áudio do sistema via getDisplayMedia
- feat: Reconexão WebSocket com backoff exponencial
- feat: VU meter em tempo real
- feat: Chat de correção IA inline

### 2026-03-09 (v6.1.0)
- feat: Hierarquia cargo-cargo com `reports_to_id`
- feat: Cargos vagos no organograma
- feat: Seletor "reporta para" com prevenção de ciclos
- feat: View `position_hierarchy_view`
- feat: Hook `usePositionHierarchy()`

### 2026-02-28
- feat: Sistema de documentos com pastas hierárquicas
- feat: Editor Markdown Notion-like
- feat: Upload e importação de arquivos
