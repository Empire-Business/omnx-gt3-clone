# Integração Soniox — Módulo de Reuniões (v7.1)

> Documentação completa da integração de transcrição em tempo real com Soniox, processamento IA e ciclo de vida de reuniões.
> **Versão:** 7.1.0 | **Última atualização:** 2026-03-08

---

## Sumário

1. [Visão Geral](#1-visão-geral)
2. [Diagrama de Fluxo](#2-diagrama-de-fluxo)
3. [Arquitetura de Componentes](#3-arquitetura-de-componentes)
4. [Edge Functions](#4-edge-functions)
5. [Schema do Banco de Dados](#5-schema-do-banco-de-dados)
6. [Audio Pipeline v7.1](#6-audio-pipeline-v71)
7. [Captura de Áudio do Sistema](#7-captura-de-áudio-do-sistema)
8. [Protocolo WebSocket Soniox](#8-protocolo-websocket-soniox)
9. [Processamento IA (OpenRouter)](#9-processamento-ia-openrouter)
10. [Fluxo do Usuário](#10-fluxo-do-usuário)
11. [Compatibilidade de Browsers](#11-compatibilidade-de-browsers)
12. [Configuração](#12-configuração)
13. [Troubleshooting](#13-troubleshooting)
14. [Limites e Custos](#14-limites-e-custos)
15. [Referências](#15-referências)

---

## 1. Visão Geral

O módulo de Reuniões permite transcrição em tempo real de reuniões via Soniox Speech-to-Text, com processamento posterior por IA (via OpenRouter) para gerar resumos, pontos-chave, itens de ação, e sugestões de projetos/tarefas que podem ser aprovados e criados automaticamente no sistema.

**Características principais:**
- Transcrição ao vivo com speaker diarization (diferenciação de falantes)
- Captura de áudio do microfone **e** do sistema (aba do navegador)
- Resampling manual cross-browser para 16kHz PCM
- AudioWorklet com fallback para ScriptProcessorNode
- Reconexão automática do WebSocket com backoff exponencial
- VU meter em tempo real para feedback visual do microfone
- Processamento IA com function calling (Claude/Gemini via OpenRouter)
- Chat de correção IA para ajustar sugestões antes de aprovar
- Criação automática de projetos e tarefas após aprovação

---

## 2. Diagrama de Fluxo

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BROWSER (Frontend)                             │
│                                                                             │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ Microfone │───→│ AudioContext  │───→│ AudioWorklet │───→│  WebSocket   │  │
│  │ (getUserMedia) │ (native rate)│    │ (downsample  │    │  (binary     │  │
│  └──────────┘    │              │    │  → 16kHz PCM)│    │   frames)    │  │
│                  │              │    └──────────────┘    └──────┬───────┘  │
│  ┌──────────┐    │  ChannelMerger│                              │          │
│  │ System   │───→│  + GainNode  │    ┌──────────────┐          │          │
│  │ Audio    │    └──────────────┘    │ Transcrição   │←─────────┘          │
│  │(getDisplay│                       │ ao Vivo (UI)  │   (tokens JSON)     │
│  │ Media)   │                       └──────────────┘                      │
│  └──────────┘                                                              │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │ transcript_final
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SUPABASE EDGE FUNCTIONS                              │
│                                                                             │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │ soniox-temp-key   │  │ meeting-ai       │  │ meeting-approve          │  │
│  │                   │  │                  │  │                          │  │
│  │ Auth → Soniox API │  │ Mode: process    │  │ Cria projetos e tarefas  │  │
│  │ → temp API key    │  │  → summary, KPs  │  │ no banco via service     │  │
│  │                   │  │  → projects/tasks│  │ role key                 │  │
│  │ Secret:           │  │ Mode: correction │  │                          │  │
│  │ SONIOX_API_KEY    │  │  → chat ajuste   │  │ Registra em              │  │
│  │                   │  │                  │  │ meeting_approved_items    │  │
│  │                   │  │ Secret:          │  │                          │  │
│  │                   │  │ OPENROUTER_API_KEY│  │                          │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────────────┘  │
└────────────────────────────────┬────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SUPABASE DATABASE                                   │
│                                                                             │
│  ┌─────────────────────────────┐  ┌─────────────────────────────────────┐  │
│  │ meetings                    │  │ meeting_approved_items              │  │
│  │ - transcript_raw/final      │  │ - meeting_id → meetings            │  │
│  │ - summary_markdown          │  │ - item_type (project/task)         │  │
│  │ - key_points, action_items  │  │ - item_id → projects/tasks         │  │
│  │ - generated_projects/tasks  │  │ - original_suggestion (JSON)       │  │
│  │ - approval_status           │  │                                    │  │
│  └─────────────────────────────┘  └─────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────┐  ┌──────────────┐                                        │
│  │ projects     │  │ tasks        │  ← criados após aprovação              │
│  └──────────────┘  └──────────────┘                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Arquitetura de Componentes

| Arquivo | Tipo | Responsabilidade | Dependências |
|---------|------|-----------------|--------------|
| `src/pages/Reunioes.tsx` | Página | Listagem, criação de reuniões, roteamento por status (scheduled→recording→completed→approved) | `useMeetings`, `MeetingRecorder`, `MeetingSummary`, `MeetingApproval` |
| `src/components/meetings/MeetingRecorder.tsx` | Componente | Captura de áudio (mic + sistema), WebSocket Soniox, transcrição ao vivo, VU meter, reconexão, downsampling | `useSonioxTempKey`, `useUpdateMeeting`, `useProcessTranscript` |
| `src/components/meetings/MeetingSummary.tsx` | Componente | Exibição do resumo Markdown, pontos-chave, pontos de atenção, itens de ação | MarkdownViewer |
| `src/components/meetings/MeetingApproval.tsx` | Componente | Seleção de projetos/tarefas sugeridos, chat IA para correção, aprovação final | `useApproveItems`, `meeting-ai` (mode: correction) |
| `src/hooks/useMeetings.ts` | Hook | Queries e mutations: listagem, detalhe, criação, atualização, temp key, processamento, aprovação | `@tanstack/react-query`, `supabase` |

### Detalhes de cada componente

#### `MeetingRecorder.tsx` (805 linhas)
- **Estado principal**: `isRecording`, `isPaused`, `isConnecting`, `isReconnecting`, `systemAudioActive`, `audioLevel`
- **Refs**: `wsRef`, `audioContextRef`, `sourceRef`, `analyserRef`, `streamRef`, `systemStreamRef`, `mergerRef`, `mixGainRef`
- **Funções core**:
  - `startRecording()` — solicita mic, cria AudioContext, AudioWorklet, conecta WebSocket
  - `stopRecording()` — envia EOF, fecha conexão, salva transcrição, invoca `meeting-ai`
  - `addSystemAudio()` — solicita `getDisplayMedia`, cria merger, mixa com mic
  - `removeSystemAudio()` — desconecta tracks do sistema
  - `connectWebSocket()` — conecta ao Soniox com config inicial
  - `attemptReconnect()` — backoff exponencial (1s, 2s, 4s, 8s, 16s)
  - `downsampleBuffer()` — interpolação linear para 16kHz

#### `MeetingSummary.tsx`
- Renderiza `summary_markdown` via `MarkdownViewer`
- Exibe `key_points` como badges/chips
- Exibe `attention_points` com cores por severidade (low/medium/high)
- Exibe `action_items` como lista com responsável

#### `MeetingApproval.tsx`
- Lista `generated_projects` e `generated_tasks` com checkboxes
- Campo `selected` (boolean) para cada item
- Chat de correção: envia mensagem → `meeting-ai` (mode: correction) → recebe JSON atualizado
- Botão "Aprovar Selecionados" → `meeting-approve` edge function

### Hook `useMeetings.ts` (175 linhas)

| Export | Tipo | Descrição |
|--------|------|-----------|
| `Meeting` | Interface | Tipo completo da reunião |
| `useMeetingsList()` | Query | Lista todas as reuniões do tenant, ordenadas por data |
| `useMeetingDetail(id)` | Query | Detalhe de uma reunião específica |
| `useCreateMeeting()` | Mutation | Cria reunião com título, descrição, tenant_id, created_by |
| `useUpdateMeeting()` | Mutation | Atualiza campos da reunião (status, transcript, etc.) |
| `useProcessTranscript()` | Mutation | Invoca `meeting-ai` para processar transcrição |
| `useApproveItems()` | Mutation | Invoca `meeting-approve` para criar projetos/tarefas |
| `useSonioxTempKey()` | Mutation | Invoca `soniox-temp-key` para gerar chave temporária |

---

## 4. Edge Functions

### 4.1 `soniox-temp-key`

**Arquivo:** `supabase/functions/soniox-temp-key/index.ts` (66 linhas)

| Campo | Valor |
|-------|-------|
| **Método** | POST |
| **Auth** | JWT do usuário (Authorization header) |
| **Secret** | `SONIOX_API_KEY` |
| **Função** | Valida JWT → chama Soniox REST API → retorna temp key |

**Request**: Não requer body (a edge function envia os parâmetros fixos)

**Response**:
```json
{
  "api_key": "temp:abc123...",
  "expires_at": "2026-03-08T12:00:00Z"
}
```

**Erros**:
- `401` — JWT inválido ou ausente
- `503` — `SONIOX_API_KEY` não configurada (mensagem clara no body)

**Chamada para o Soniox**:
```
POST https://api.soniox.com/v1/auth/temporary-api-key
Authorization: Bearer <SONIOX_API_KEY>
Body: { "usage_type": "transcribe_websocket", "expires_in_seconds": 3600 }
```

> ⚠️ O campo de resposta é `api_key`, **NÃO** `key`.

---

### 4.2 `meeting-ai`

**Arquivo:** `supabase/functions/meeting-ai/index.ts` (240 linhas)

| Campo | Valor |
|-------|-------|
| **Método** | POST |
| **Auth** | JWT do usuário |
| **Secret** | `OPENROUTER_API_KEY` |
| **Modelos** | Claude Sonnet 4 → Gemini 2.0 Flash → Claude 3 Haiku (fallback) |
| **Modos** | `process` (default) e `correction` |

#### Modo `process` (default)

Processa a transcrição completa e extrai dados estruturados via function calling.

**Request**:
```json
{
  "meeting_id": "uuid",
  "transcript": "Falante 0: Olá pessoal..."
}
```

**Fluxo interno**:
1. Atualiza meeting status para `processing`
2. Envia transcrição ao LLM com tool `extract_meeting_data`
3. LLM retorna: `summary_markdown`, `key_points`, `attention_points`, `action_items`, `generated_projects`, `generated_tasks`
4. Atualiza meeting no banco com todos os campos
5. Atualiza status para `completed`

**Schema da tool `extract_meeting_data`**:
```json
{
  "summary_markdown": "string — Resumo Markdown completo",
  "key_points": [{ "text": "string" }],
  "attention_points": [{ "text": "string", "severity": "low|medium|high" }],
  "action_items": [{ "text": "string", "responsible": "string?" }],
  "generated_projects": [{ "name": "string", "description": "string", "priority": "low|medium|high" }],
  "generated_tasks": [{ "title": "string", "description": "string", "priority": "low|medium|high|urgent", "suggested_assignee": "string?" }]
}
```

#### Modo `correction`

Chat de ajuste para corrigir sugestões antes da aprovação.

**Request**:
```json
{
  "mode": "correction",
  "context": "{ projects: [...], tasks: [...] }",
  "user_message": "Mude a prioridade do projeto X para alta"
}
```

**Response**:
```json
{
  "updated_projects": [...] | null,
  "updated_tasks": [...] | null,
  "message": "Alterei a prioridade do projeto X para alta"
}
```

---

### 4.3 `meeting-approve`

**Arquivo:** `supabase/functions/meeting-approve/index.ts` (132 linhas)

| Campo | Valor |
|-------|-------|
| **Método** | POST |
| **Auth** | JWT do usuário |
| **Usa** | `SUPABASE_SERVICE_ROLE_KEY` (para criar em nome do tenant) |

**Request**:
```json
{
  "meeting_id": "uuid",
  "approved_projects": [
    { "name": "...", "description": "...", "priority": "medium" }
  ],
  "approved_tasks": [
    { "title": "...", "description": "...", "priority": "high", "project_id": "uuid?" }
  ]
}
```

**Fluxo interno**:
1. Busca `tenant_id` da meeting
2. Para cada projeto aprovado: insere em `projects` (status: `planning`) + registra em `meeting_approved_items`
3. Para cada tarefa aprovada: insere em `tasks` (status: `todo`) + registra em `meeting_approved_items`
4. Atualiza meeting: `approval_status = 'approved'`, `approved_by`, `approved_at`

**Response**:
```json
{
  "success": true,
  "created_items": [
    { "type": "project", "id": "uuid" },
    { "type": "task", "id": "uuid" }
  ]
}
```

---

## 5. Schema do Banco de Dados

### Tabela `meetings`

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| `id` | uuid | `gen_random_uuid()` | PK |
| `tenant_id` | uuid | — | FK → tenants |
| `title` | text | — | Título da reunião |
| `description` | text | null | Descrição opcional |
| `status` | text | `'scheduled'` | `scheduled` → `recording` → `processing` → `completed` |
| `started_at` | timestamptz | null | Quando a gravação iniciou |
| `ended_at` | timestamptz | null | Quando a gravação encerrou |
| `duration_seconds` | int | null | Duração total |
| `created_by` | uuid | null | ID do usuário criador |
| `transcript_raw` | text | null | Transcrição bruta do Soniox |
| `transcript_final` | text | null | Transcrição editada/final |
| `summary_markdown` | text | null | Resumo gerado pela IA |
| `key_points` | jsonb | `'[]'` | Pontos-chave |
| `attention_points` | jsonb | `'[]'` | Pontos de atenção com severidade |
| `action_items` | jsonb | `'[]'` | Itens de ação |
| `participants` | jsonb | `'[]'` | Participantes detectados |
| `generated_projects` | jsonb | `'[]'` | Projetos sugeridos pela IA |
| `generated_tasks` | jsonb | `'[]'` | Tarefas sugeridas pela IA |
| `approval_status` | text | `'pending'` | `pending` → `approved` |
| `approved_by` | uuid | null | Quem aprovou |
| `approved_at` | timestamptz | null | Quando aprovou |
| `soniox_session_id` | text | null | ID da sessão Soniox |
| `metadata` | jsonb | `'{}'` | Dados extras |
| `created_at` | timestamptz | `now()` | — |
| `updated_at` | timestamptz | `now()` | — |

**RLS Policies**:
- `meetings_select`: tenant_id = get_user_tenant_id()
- `meetings_insert`: tenant_id match + admin ou manager
- `meetings_update`: tenant_id match + admin ou manager
- `meetings_delete`: tenant_id match + admin

### Tabela `meeting_approved_items`

| Coluna | Tipo | Default | Descrição |
|--------|------|---------|-----------|
| `id` | uuid | `gen_random_uuid()` | PK |
| `meeting_id` | uuid | — | FK → meetings |
| `tenant_id` | uuid | — | FK → tenants |
| `item_type` | text | — | `'project'` ou `'task'` |
| `item_id` | uuid | null | FK → projects ou tasks |
| `original_suggestion` | jsonb | null | JSON original da sugestão IA |
| `approved_at` | timestamptz | `now()` | — |

**RLS Policies**:
- `mai_select`: tenant_id match
- `mai_insert`: tenant_id match + admin ou manager
- `mai_delete`: tenant_id match + admin

---

## 6. Audio Pipeline v7.1

### O Problema do Resampling

A maioria dos navegadores **ignora** a constraint `sampleRate` no `getUserMedia`. O microfone captura na taxa nativa do hardware (44100 Hz ou 48000 Hz). Criar `AudioContext({ sampleRate: 16000 })` só funciona em Chrome — Safari e Firefox frequentemente ignoram ou lançam erro.

Se o áudio for enviado ao Soniox dizendo ser 16kHz mas na verdade estiver a 44-48kHz, a transcrição será **lixo completo** (som acelerado/metalizado).

### Solução Implementada

```
Microfone (44100/48000 Hz)
    │
    ▼
AudioContext (taxa NATIVA — sem forçar)
    │
    ▼
MediaStreamAudioSourceNode
    │
    ├──→ AnalyserNode ──→ VU Meter (visual)
    │
    ▼
AudioWorklet / ScriptProcessorNode
    │
    ├── Recebe Float32Array na taxa nativa
    ├── Downsample via interpolação linear → 16000 Hz
    ├── Converte para Int16Array (PCM 16-bit signed LE)
    └── Envia via port.postMessage
            │
            ▼
        WebSocket.send(Int16Array.buffer)
            │
            ▼
        Soniox RT (pcm_s16le, 16000 Hz, 1 canal)
```

### Função de Downsampling

```typescript
function downsampleBuffer(buffer: Float32Array, inputRate: number, outputRate: number): Int16Array {
  if (inputRate === outputRate) {
    // Conversão direta Float32 → Int16
    const result = new Int16Array(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
      const s = Math.max(-1, Math.min(1, buffer[i]));
      result[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return result;
  }
  
  const ratio = inputRate / outputRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Int16Array(newLength);
  
  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const srcIndexFloor = Math.floor(srcIndex);
    const srcIndexCeil = Math.min(srcIndexFloor + 1, buffer.length - 1);
    const frac = srcIndex - srcIndexFloor;
    
    // Interpolação linear
    const sample = buffer[srcIndexFloor] * (1 - frac) + buffer[srcIndexCeil] * frac;
    const s = Math.max(-1, Math.min(1, sample));
    result[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  
  return result;
}
```

### AudioWorklet vs ScriptProcessorNode

| Aspecto | AudioWorklet | ScriptProcessorNode |
|---------|-------------|-------------------|
| **Thread** | Separada (AudioWorkletGlobalScope) | Main thread |
| **Performance** | Excelente — não bloqueia UI | Pode causar jank |
| **Status** | Padrão atual | Deprecated |
| **Suporte** | Chrome 66+, Firefox 76+, Safari 14.1+ | Universal |
| **Implementação** | Via Blob URL inline | Direto no componente |

**Estratégia**: Tenta AudioWorklet primeiro. Se falhar (`audioContext.audioWorklet` não existe), usa ScriptProcessorNode como fallback.

O AudioWorklet é criado via **Blob URL** para evitar problemas de path em deploy:
```typescript
const workletCode = `
class DownsampleProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0]?.[0];
    if (input) this.port.postMessage(input);
    return true;
  }
}
registerProcessor('downsample-processor', DownsampleProcessor);
`;
const blob = new Blob([workletCode], { type: 'application/javascript' });
const url = URL.createObjectURL(blob);
await audioContext.audioWorklet.addModule(url);
```

### Safari/iOS

- `AudioContext` pode iniciar em estado `suspended` — necessário chamar `audioContext.resume()` após interação do usuário
- O botão "Iniciar Gravação" serve como essa interação
- Após `resume()`, o pipeline funciona normalmente

### VU Meter

- Usa `AnalyserNode` para capturar dados de frequência
- Calcula RMS (Root Mean Square) do buffer
- Converte para porcentagem (0-100) para exibir via `<Progress />`
- Atualizado a cada ~100ms via `requestAnimationFrame`
- Feedback visual confirma que o microfone está captando som

### Reconexão WebSocket

Se a conexão cair durante a gravação:
1. Detecta `onclose` ou `onerror`
2. Incrementa tentativa (máx 5)
3. Calcula delay: `Math.min(1000 * 2^attempt, 16000)` — 1s, 2s, 4s, 8s, 16s
4. Exibe indicador visual "Reconectando..." com ícone `<WifiOff />`
5. Re-solicita temp key → reconecta → reenvia config
6. Áudio já transcrito é **preservado** (estado local não é resetado)
7. Após 5 falhas, exibe erro e para a gravação

---

## 7. Captura de Áudio do Sistema

### Como Funciona

Usa `navigator.mediaDevices.getDisplayMedia({ audio: true, video: true })` para capturar o áudio de uma aba do navegador (ex: Google Meet, Zoom Web).

> O `video: true` é necessário pois alguns browsers exigem. A track de vídeo é **descartada imediatamente** — apenas o áudio é usado.

### Pipeline de Mixing

```
Microfone ──→ MediaStreamAudioSourceNode ──→ ChannelMerger(2) ──→ GainNode(0.5) ──→ AudioWorklet
                                               ↑
System Audio ──→ MediaStreamAudioSourceNode ───┘
```

- `ChannelMergerNode(2)` combina mic (canal 0) e sistema (canal 1)
- `GainNode` com valor `0.5` previne clipping na mixagem
- O resultado mono é enviado ao AudioWorklet para downsampling

### Ciclo de Vida

1. Usuário clica "Áudio do Sistema" (botão `<Monitor />`)
2. Browser exibe picker de compartilhamento (escolher aba)
3. Track de vídeo é removida (`track.stop()`)
4. Track de áudio é conectada ao merger
5. Se o usuário para o compartilhamento via UI nativa do browser → `onended` é disparado → cleanup automático
6. Ao encerrar gravação → todas as tracks do sistema são paradas

### Limitações

- **Requer interação do usuário** (não pode iniciar automaticamente)
- **Apenas áudio de aba** — não captura áudio do sistema inteiro
- **Chrome/Edge**: Suporte completo
- **Firefox**: Suporte parcial (pode não oferecer opção de áudio)
- **Safari**: **Não suportado** (`getDisplayMedia` não inclui áudio)
- Se o usuário usa **fone de ouvido**: o microfone capta apenas a voz do usuário, então o áudio do sistema é essencial para capturar os outros participantes

---

## 8. Protocolo WebSocket Soniox

### Conexão

**URL**: `wss://stt-rt.soniox.com/transcribe-websocket`

### Config Inicial (enviado como JSON após conexão)

```json
{
  "api_key": "<temp_key>",
  "model": "stt-rt-preview",
  "audio_format": "pcm_s16le",
  "sample_rate": 16000,
  "num_channels": 1,
  "enable_speaker_diarization": true,
  "language_hints": ["pt", "en"]
}
```

### Envio de Áudio

- Buffers `Int16Array` via WebSocket binary frames
- Já resampleado para 16kHz pelo AudioWorklet/ScriptProcessorNode
- Envio contínuo enquanto a gravação está ativa

### Encerramento

Enviar um **frame vazio** (`ws.send("")`). **NÃO** enviar `{ eof: true }`.

### Response Format (tokens)

```json
{
  "tokens": [
    { "text": "Olá ", "speaker": "0", "start_ms": 1200, "end_ms": 1500, "is_final": true },
    { "text": "pessoal", "speaker": "0", "start_ms": 1500, "end_ms": 1900, "is_final": false }
  ],
  "total_audio_proc_ms": 5000
}
```

> ⚠️ **Importante**: 
> - `is_final` é por **token individual**, não por mensagem
> - Cada resposta pode conter tokens finais e não-finais misturados
> - O campo `speaker` é uma **string**, não número
> - Tokens não-finais são exibidos em itálico/muted e substituídos quando se tornam finais

---

## 9. Processamento IA (OpenRouter)

### Modelos (fallback em cadeia)

1. `anthropic/claude-sonnet-4` (primário)
2. `google/gemini-2.0-flash-001` (fallback)
3. `anthropic/claude-3-haiku` (último recurso)

Se um modelo falhar (timeout, rate limit, indisponível), tenta o próximo automaticamente.

### Function Calling

O processamento usa **tool_choice forced** para garantir resposta estruturada:
```json
{
  "tool_choice": { "type": "function", "function": { "name": "extract_meeting_data" } }
}
```

Isso garante que o LLM sempre retorne os dados no formato esperado via function calling, em vez de texto livre.

### Temperatura

`temperature: 0.3` — baixa para consistência na extração de dados estruturados.

---

## 10. Fluxo do Usuário

### Passo a passo completo

1. **Acessar**: Navegue para **Reuniões** no menu lateral
2. **Criar**: Clique "Nova Reunião" → preencha título e descrição → "Criar"
3. **Iniciar gravação**: Clique "Iniciar Gravação"
   - Browser solicita permissão de microfone (uma única vez)
   - AudioContext é criado, pipeline é montado
   - WebSocket conecta ao Soniox
   - VU meter aparece confirmando captação
4. **Áudio do sistema** (opcional): Clique "Áudio do Sistema"
   - Browser exibe picker de compartilhamento
   - Selecione a aba do Meet/Zoom/Teams
   - Áudio da aba é mixado com o microfone
5. **Durante a reunião**: Transcrição aparece ao vivo
   - Tokens finais em texto normal, não-finais em itálico
   - Cores diferentes por falante
   - Cronômetro mostra duração
6. **Pausar/Retomar**: Botão de pausa interrompe envio de áudio sem fechar conexão
7. **Encerrar**: Clique "Encerrar Reunião"
   - EOF é enviado ao Soniox
   - Transcrição é salva no banco
   - IA processa automaticamente (status: `processing`)
8. **Revisar**: Após processamento (15-60s), o resumo aparece
   - Resumo Markdown, pontos-chave, atenção, ações
   - Projetos e tarefas sugeridos
9. **Corrigir** (opcional): Use o chat de correção
   - "Mude a prioridade do projeto X para alta"
   - "Adicione uma tarefa para revisar o contrato"
   - IA ajusta os itens em tempo real
10. **Aprovar**: Selecione os itens desejados → "Aprovar Selecionados"
    - Projetos são criados com status `planning`
    - Tarefas são criadas com status `todo`
    - Meeting status muda para `approved`

---

## 11. Compatibilidade de Browsers

### Microfone + Transcrição

| Navegador | Desktop | Mobile | Método de Áudio | Observação |
|-----------|---------|--------|-----------------|------------|
| Chrome 66+ | ✅ Completo | ✅ Completo | AudioWorklet | Melhor suporte geral |
| Edge 79+ | ✅ Completo | ✅ Completo | AudioWorklet | Baseado em Chromium |
| Firefox 76+ | ✅ Completo | ✅ Completo | AudioWorklet | AudioWorklet desde v76 |
| Safari 14.1+ | ✅ Completo | ⚠️ Parcial | AudioWorklet | iOS requer interação para ativar AudioContext |
| Safari < 14.1 | ✅ Fallback | ⚠️ Fallback | ScriptProcessorNode | Funciona com fallback |
| Samsung Internet | — | ✅ Completo | AudioWorklet | Baseado em Chromium |

### Áudio do Sistema (getDisplayMedia)

| Navegador | Desktop | Mobile | Observação |
|-----------|---------|--------|------------|
| Chrome 74+ | ✅ | ❌ | Melhor suporte, oferece opção "Compartilhar áudio da aba" |
| Edge 79+ | ✅ | ❌ | Baseado em Chromium |
| Firefox 66+ | ⚠️ Parcial | ❌ | Pode não oferecer opção de áudio em todas as plataformas |
| Safari | ❌ | ❌ | `getDisplayMedia` não suporta `audio: true` |

### Requisitos Gerais

- **HTTPS obrigatório** — `getUserMedia` não funciona em HTTP (exceto `localhost`)
- **Permissão de microfone** — solicitada automaticamente na primeira vez
- **Contexto seguro** — verificado antes de iniciar (mostra erro se não for HTTPS)

---

## 12. Configuração

### Secrets Necessários

| Secret | Onde configurar | Onde obter | Usado por |
|--------|----------------|------------|-----------|
| `SONIOX_API_KEY` | Supabase Edge Function Secrets | https://soniox.com → Dashboard → API Keys | `soniox-temp-key` |
| `OPENROUTER_API_KEY` | Supabase Edge Function Secrets | https://openrouter.ai → Settings → API Keys | `meeting-ai` |

### Como configurar

1. Acesse o [painel de secrets do Supabase](https://supabase.com/dashboard/project/opbdoulspzlabxzevffc/settings/functions)
2. Adicione `SONIOX_API_KEY` com sua chave do Soniox
3. Adicione `OPENROUTER_API_KEY` com sua chave do OpenRouter
4. As edge functions já estão configuradas para ler essas secrets via `Deno.env.get()`

### Verificação

- Se `SONIOX_API_KEY` não estiver configurada: a edge function retorna **503** com mensagem `"SONIOX_API_KEY not configured. Please add your Soniox API key in Supabase secrets."`
- Se `OPENROUTER_API_KEY` não estiver configurada: a edge function retorna **500** com mensagem `"OPENROUTER_API_KEY not configured"`

---

## 13. Troubleshooting

### Problema: Transcrição retorna lixo / som metalizado
**Causa**: Áudio sendo enviado na taxa errada (44kHz dizendo ser 16kHz)
**Solução**: Verificar que o downsampling está funcionando. O `AudioContext` deve ser criado **sem** forçar `sampleRate`. O downsampling é feito manualmente no AudioWorklet.

### Problema: Microfone não captando som (VU meter zerado)
**Causa**: Microfone errado selecionado ou permissão negada
**Solução**: Verificar permissões do browser. Testar com outro microfone. Verificar se o site está em HTTPS.

### Problema: "Seu navegador não suporta gravação de áudio"
**Causa**: Browser antigo ou contexto não-seguro (HTTP)
**Solução**: Usar Chrome/Firefox/Edge atualizado. Garantir HTTPS.

### Problema: WebSocket desconecta durante gravação
**Causa**: Rede instável ou temp key expirada
**Solução**: O sistema reconecta automaticamente (até 5 tentativas). Se persistir, verificar estabilidade da rede.

### Problema: "SONIOX_API_KEY not configured"
**Causa**: Secret não adicionada no Supabase
**Solução**: Adicionar a secret em Supabase → Settings → Edge Functions → Secrets

### Problema: IA não processa transcrição / "All LLM models failed"
**Causa**: `OPENROUTER_API_KEY` inválida ou créditos esgotados
**Solução**: Verificar key no OpenRouter. Verificar saldo/créditos.

### Problema: Áudio do sistema não disponível
**Causa**: Safari ou mobile (não suportados)
**Solução**: Usar Chrome/Edge desktop. Em mobile, o microfone capta o áudio do alto-falante se não estiver usando fone.

### Problema: Botão "Áudio do Sistema" não aparece
**Causa**: Browser não suporta `getDisplayMedia` com áudio
**Solução**: Usar Chrome ou Edge desktop.

---

## 14. Limites e Custos

### Soniox

| Limite | Valor |
|--------|-------|
| Máximo por stream | 300 minutos |
| Temp key expiração | 3600 segundos (1h) |
| WebSocket | Fecha automaticamente após EOF ou timeout |
| Modelo | `stt-rt-preview` (tempo real) |

**Custos**: Consultar https://soniox.com/pricing — modelo pay-per-use baseado em minutos de áudio.

### OpenRouter

| Limite | Valor |
|--------|-------|
| Rate limit | Varia por modelo e plano |
| Custo Claude Sonnet 4 | ~$3/1M input tokens, ~$15/1M output tokens |
| Custo Gemini 2.0 Flash | ~$0.10/1M input tokens, ~$0.40/1M output tokens |
| Custo Claude 3 Haiku | ~$0.25/1M input tokens, ~$1.25/1M output tokens |

Uma transcrição de reunião de 1h gera ~5-15k tokens de input. O processamento IA custa centavos por reunião.

### Error Codes Soniox

| Status | Significado |
|--------|-------------|
| 400 | Configuração inválida |
| 401 | API key inválida ou expirada |
| 402 | Créditos insuficientes |
| 429 | Rate limit excedido |

---

## 15. Referências

- **Soniox Docs**: https://soniox.com/docs
- **Soniox API Reference**: https://soniox.com/docs/api
- **OpenRouter Docs**: https://openrouter.ai/docs
- **Web Audio API**: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- **AudioWorklet**: https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet
- **getDisplayMedia**: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia
- **Supabase Edge Functions**: https://supabase.com/docs/guides/functions
