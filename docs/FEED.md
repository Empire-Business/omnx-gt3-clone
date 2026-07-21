# Feed Social — Funcionamento e Permissões

## O que é o Feed

O Feed é um mural social interno da plataforma OMNX GT3. Qualquer colaborador ativo pode publicar mensagens, reagir e comentar. Diferente dos **Comunicados** (criados apenas por admin/manager), o Feed é aberto a todos os membros do tenant.

---

## Fluxo de uma Publicação

```
Colaborador abre o Feed
  → Escreve o conteúdo
  → (Opcional) Adiciona tags
  → Escolhe a visibilidade: Todos | Específico
      → Se Específico: seleciona um ou mais targets
          (Área / Subárea / Cargo / Membro)
  → Clica em "Publicar"
```

O post é salvo na tabela `feed_posts` com os campos:

| Campo                | Descrição |
|----------------------|-----------|
| `visibility_type`    | `'all'` ou `'specific'` |
| `visibility_targets` | Array JSON com os targets selecionados |
| `tags`               | Array de strings para categorização |
| `employee_id`        | Colaborador que publicou |
| `tenant_id`          | Tenant isolado por RLS |

---

## Tipos de Visibilidade

### `visibility_type = 'all'`
Post visível para todos os colaboradores do tenant.

### `visibility_type = 'specific'`
Post visível apenas para quem se encaixa nos targets. Cada target tem um `type` e um `id`:

| `type`       | Quem vê |
|--------------|---------|
| `employee`   | Apenas o colaborador com aquele `id` |
| `area`       | Todos cujo cargo pertence àquela área |
| `subarea`    | Todos cujo cargo pertence àquela subárea |
| `position`   | Todos que ocupam exatamente aquele cargo |

Um post pode ter múltiplos targets. Basta atender a **qualquer um** deles para ver o post.

---

## Permissões por Role

### Admin
- Vê **todos os posts** sem exceção, independente de `visibility_type` ou targets
- Pode deletar qualquer post ou comentário

### Manager
- Vê posts com `visibility_type = 'all'`
- Vê posts `'specific'` **somente se seu cargo pertence a um dos targets** (mesma área, subárea, cargo ou se é o membro alvo)
- Managers fora do target não veem o post
- Pode deletar qualquer post ou comentário

### Member
- Vê posts com `visibility_type = 'all'`
- Vê posts `'specific'` **somente se seu cargo pertence a um dos targets**
- Sempre vê os próprios posts (mesmo que `'specific'` e sem target compatível)
- Pode deletar apenas seus próprios posts e comentários

---

## Regra de Resolução de Área/Subárea

A vinculação entre um colaborador e uma área/subárea é feita via:

```
employees → employee_positions → positions.subarea_id → subareas
                                → positions.area_id    → company_areas
```

Para um post targetando uma **área**:
- Colaboradores cujo `positions.area_id` = id da área ✅
- Colaboradores cujo `positions.subarea_id → subareas.area_id` = id da área ✅

Para um post targetando uma **subárea**:
- Colaboradores cujo `positions.subarea_id` = id da subárea ✅
- Colaboradores cujo cargo é de nível de diretoria (só `area_id`) **não** veem ❌

---

## Interações

| Ação              | Quem pode |
|-------------------|-----------|
| Publicar post     | Qualquer colaborador ativo |
| Reagir (❤️)       | Qualquer colaborador que vê o post |
| Comentar          | Qualquer colaborador que vê o post |
| Deletar post      | Admin, Manager, ou o próprio autor |
| Deletar comentário | Admin, Manager, ou o próprio autor do comentário |

---

## Tabelas no Banco

| Tabela           | Descrição |
|------------------|-----------|
| `feed_posts`     | Posts com conteúdo, visibilidade e tags |
| `feed_reactions` | Reações (atualmente `'like'` e `'love'`) — UNIQUE por post + employee + tipo |
| `feed_comments`  | Comentários vinculados a um post |
| `feed_audio_transcriptions` | Cache de transcrições por (`tenant_id`, `attachment_url`) — gerado pela edge function `feed-audio-transcribe` |

Todas as tabelas têm RLS ativo e isolamento por `tenant_id`.

---

## Embeds de Vídeo (YouTube e Vimeo)

URLs no `content` do post são detectadas em runtime e renderizadas como iframes responsivos (16:9, `loading="lazy"`):

| Plataforma | Padrões reconhecidos |
|------------|----------------------|
| YouTube    | `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`, `youtube.com/embed/` |
| Vimeo      | `vimeo.com/{id}`, `vimeo.com/video/{id}`, `player.vimeo.com/video/{id}` |

Limite: até 3 embeds por post (deduplicados por id+plataforma). Implementado em `src/lib/feed-embeds.ts` + `src/components/feed/LinkEmbed.tsx`.

---

## Player de Áudio Compartilhado (`src/components/shared/AudioPlayer.tsx`)

Tanto o **Feed** (posts e comentários, via `AttachmentRenderer`) quanto o **Chat** (mensagens, via `MsgAttachments`) renderizam áudio com o mesmo componente `AudioPlayer`. Estilo WhatsApp: play/pause circular, waveform com **32 barras** (densidade ajustada para caber em balões estreitos do chat), controle de velocidade `1x → 1.5x → 2x`, seek por clique e botão de transcrição on-demand.

- **Waveform real:** `fetch` + `decodeAudioData` (RMS por bucket). Cache em memória por URL.
- **Fallback determinístico:** se CORS, `>5 MB` ou navegador sem `AudioContext`, gera barras a partir de hash da URL.
- **Variantes:** `default` (posts, play 44px), `dense` (comentários, play 36px), `chat` (play 40px; com `isMine=true` o container fica `bg-transparent` herdando o indigo do balão — paleta WhatsApp; barras restantes em `bg-primary-foreground/45`, botão speed `bg-primary-foreground/25`).
- **Tokens semânticos apenas:** zero cores hardcoded — segue regra do CLAUDE.md.

## Transcrição de Áudio (OpenRouter)

A transcrição roda **automaticamente** ao renderizar qualquer áudio (no Feed ou no Chat). O fluxo:

1. Frontend lê `feed_audio_transcriptions` no mount. **Se há cache**, mostra transcrição expandida imediatamente.
2. **Se não há cache**, dispara `supabase.functions.invoke("feed-audio-transcribe", { audio_url, mime })` em `requestIdleCallback` para não bloquear o render.
3. Múltiplos players do mesmo áudio (ex.: comentários listados) compartilham uma única chamada via `Map` em memória (`pendingAutoTranscribe`).
4. Edge function valida sessão + tenant, baixa o áudio em base64, e tenta os modelos em ordem:
   - `google/gemini-2.5-flash`
   - `google/gemini-2.0-flash-001`
   - `openai/gpt-4o-audio-preview`
5. Resposta é salva em `feed_audio_transcriptions(tenant_id, attachment_url)` (upsert) e renderizada expandida abaixo do player.
6. Falhas automáticas são silenciosas (apenas `console.warn`); o botão manual **"Transcrever áudio"** funciona como fallback e exibe `toast.error` se falhar.

Secret necessária: `OPENROUTER_API_KEY` (já configurada).

---

## Quem Reagiu (Hover/Tap)

Ao passar o mouse no botão da reação (👍 ou ❤️), abre `HoverCard` com avatar + nome + cargo de cada pessoa que reagiu. No mobile, o número da contagem abre o mesmo conteúdo via `Popover`. Componente reutilizável: `src/components/feed/ReactorList.tsx`.

---

## Espelhamento no Chat (Feed → Canal) — v8.14.0

Ao publicar no feed, o post é **espelhado como mensagem** no canal de chat correspondente (trigger `trg_feed_post_broadcast_to_channels`, `AFTER INSERT` em `feed_posts`):

- `visibility_type = 'all'` → canal **Geral** do tenant (`chat_channels.is_general`, criado/sincronizado por `ensure_general_channel`).
- alvo do tipo **`area`** (ou `subarea`, resolvendo a área-pai) → canal daquela área (`ensure_area_channel`, via `chat_channels.area_id`).
- Alvos `position`/`employee` não geram espelhamento (ficam só no feed).

A mensagem entra **em nome do autor do post**, com `📢 Novo no Feed` (negrito) + trecho, e um anexo `{ type:'feed_post', post_id, url:'/feed?post=<id>' }`. No chat isso vira o card **`FeedBroadcastCard`** ("Ver publicação →"), que abre o Feed e **rola/destaca** o post (deep-link `?post=<id>`).

- Dedupe: `feed_post_channel_broadcasts (feed_post_id, channel_id)` garante 1 mensagem por canal por post.
- Push: o mesmo trigger dispara Web Push (`app_dispatch_push` → `send-push`) aos membros do canal (exceto o autor).
- Os canais padrão pré-existentes (`geral`, `aquisicao`, `entrega`, `operacao`…) foram **reconciliados** por nome (sem acento) em vez de duplicados.

---

## Histórico de Correções

| Data       | Problema | Correção |
|------------|----------|----------|
| 2026-04-21 | Não dava para ver quem havia curtido sem clicar exatamente no número | HoverCard com avatares + nomes + cargo no botão da reação |
| 2026-04-21 | Áudios postados não tinham transcrição | Edge function `feed-audio-transcribe` via OpenRouter + cache em `feed_audio_transcriptions` |
| 2026-04-21 | URLs de YouTube/Vimeo eram só texto | Embeds nativos responsivos com lazy loading |
| 2026-04-14 | Manager global via `has_role('manager')` deixava todos os managers verem tudo | Removido — visibilidade agora é por posição |
| 2026-04-14 | Função RLS inline bloqueada por recursão | Substituída por função `SECURITY DEFINER` |
| 2026-04-14 | `visibility_targets` salvo como `[]` | Frontend auto-inclui seleção pendente ao publicar |
