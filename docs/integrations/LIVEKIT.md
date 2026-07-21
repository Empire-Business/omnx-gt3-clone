# LiveKit — Videoconferência nativa (v8.7.8)

Substitui Google Meet/Zoom com salas próprias, gravação automática (R2), auto-transcrição e **convidados externos com aprovação manual** (estilo Google Meet).

## Componentes

- **Frontend**: `/meet/:roomId` (`src/pages/MeetRoom.tsx`) + hook `src/hooks/useLiveKit.ts`.
- **Edge functions**:
  - `livekit-token` — emite JWT por role (host/guest/observer) com auth check.
  - `livekit-webhook` — escuta `participant_joined` (inicia Egress MP4 → R2), `egress_ended` (salva URL), `room_finished` (encerra). Audita tudo em `meeting_recording_events`.
  - `livekit-end-room` — host encerra a sala (DeleteRoom + auto-trigger `meeting-ai`).
  - `livekit-start-huddle` — cria huddle efêmero numa conversa do chat.
- **DB**: novas colunas em `meetings` (`meeting_mode`, `livekit_room_name`, `recording_url`, `recording_status`, `egress_id`, `live_participants`) + tabelas `chat_huddles` e `meeting_recording_events`.

## Setup obrigatório (manual)

1. **LiveKit Cloud** — criar projeto e copiar URL/API Key/Secret.
2. **Cloudflare R2** — bucket `meeting-recordings` público, gerar API Token.
3. Configurar webhook no dashboard LiveKit → `https://opbdoulspzlabxzevffc.supabase.co/functions/v1/livekit-webhook` (eventos: `participant_joined`, `participant_left`, `egress_started`, `egress_updated`, `egress_ended`, `room_started`, `room_finished`).
4. Definir `VITE_SITE_URL` no `.env` (link do app em produção — é usado em `getMeetUrl`).

## Secrets (já configurados)

`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_PUBLIC_URL`.

## Gotchas críticos

- Egress dispara em `participant_joined` (sala vazia trava em `EGRESS_STARTING`).
- R2 obrigatório (Supabase Storage multipart 6MB quebra MP4s grandes; R2 = zero egress fees).
- Observer = `hidden:true` + `canPublish:false`.
- `getMeetUrl` deve usar `VITE_SITE_URL` em prod (nunca `window.location.origin`).
- **`useMeetingByRoomName` (v8.7.8):** `createIfMissing` deve ser `isHost` — NÃO `isHost && liveTranscriptionEnabled`. O registro de reunião é pré-requisito para `livekit-guest-request`; sem ele, o convidado recebe 404 silencioso.
- **`getClaims` vs `getUser` (v8.7.8):** Em todas as edge functions autenticadas use `userClient.auth.getUser()` para validar o JWT — NÃO `auth.getClaims(token)`. `getClaims` falha em clients Deno sem sessão armazenada, retornando 401 silenciosamente. Afetava `livekit-token`, `livekit-end-room`, `livekit-start-huddle`, `livekit-guest-decision`.
- **`transcript_raw` (v8.7.8):** A coluna de transcrição chama-se `transcript_raw` — não `transcriptions`. `livekit-end-room` usava o nome errado, fazendo o trigger de `meeting-ai` nunca disparar.
- MP4 precisa `+faststart` para tocar em iOS.
- **Webhook (v8.7.5):** eventos `egress_started`/`egress_updated`/`egress_ended` chegam SEM `event.room` — extrair `roomName` de `event.egressInfo.roomName`. Fallback adicional via `event.egressInfo.egressId` → `meetings.egress_id`. Sem isso, todas as gravações ficam presas em `pending` e o `recording_url` nunca é salvo.

## Encerrar sala (host)

- **Dentro da sala** (`MeetRoom.tsx`): botão "Encerrar para todos" no canto superior **esquerdo** (longe de "Convidar externo" no canto direito e da ControlBar do LiveKit no rodapé). Confirmação dupla via `AlertDialog` para evitar cliques acidentais.
- **Fora da sala** (`/reunioes` aba Info): botão equivalente no `MeetingCard` para o criador.
- Ambos chamam `livekit-end-room` → `RoomService.deleteRoom()` → dispara `room_finished` no webhook → finaliza egress e atualiza `recording_url`.

## Integrações já entregues

- **Reuniões**: dialog de edição ganha seletor de modo (`Sala Empire Manager` / `Link externo` / `Presencial`); `MeetingCard` mostra "Ao vivo" + botão "Entrar" (host se for criador).
- **Chat**: `livekit-start-huddle` cria huddle e posta system message (`type='huddle_started'`); hook `useActiveHuddle` lista huddle ativo de uma conversa via realtime.

## Convidados externos com aprovação (v8.7.0)

**Fluxo (igual Google Meet):**

1. Host clica em **"Copiar link de convidado"** no `MeetingCard`, dentro da `MeetRoom` ou na aba Info de `/reunioes`. O link gerado é `${VITE_SITE_URL}/meet/<roomName>/guest`.
2. Convidado abre o link sem precisar de login no GT3, digita o nome e clica **Solicitar entrada**.
3. Pedido cai em `meeting_guest_requests` (`status='pending'`). O host vê pop-up **"Fulano pediu para entrar"** + painel `GuestApprovalPanel` no canto da sala (realtime via Postgres Changes).
4. Host clica **Admitir** ou **Recusar**. Convidado, fazendo polling a cada 2.5s, é redirecionado direto para PreJoin → sala.
5. Convidado recebe JWT com permissões mínimas (sem `roomAdmin`, sem `roomRecord`).

**Tabela `meeting_guest_requests`** — RLS: host/admin podem ver e atualizar; convidado lê via edge function pública (service role) usando `guest_token` (UUID v4 separado do `request_id` para evitar enumeração).

**Edge functions:**
- `livekit-guest-request` — público, cria o pedido (só aceita se a sala estiver `scheduled` ou `recording`).
- `livekit-guest-status` — público, retorna apenas `{status}`.
- `livekit-guest-decision` — autenticada, host aprova/recusa.
- `livekit-guest-token` — público, emite JWT LiveKit após aprovação.

## Áudio aprimorado + Fundo virtual (v8.7.6)

### Captura de áudio focada na voz

`MeetRoom.tsx` passa `options.audioCaptureDefaults` ao `LiveKitRoom` com:
- `echoCancellation: true` — remove eco do alto-falante voltando pelo mic.
- `noiseSuppression: true` — supressão nativa do navegador (teclado, ventilador, AC).
- `autoGainControl: true` — normaliza volume.
- `channelCount: 1` (mono) + `sampleRate: 48000` — ideal para voz.

Publicação (`options.publishDefaults`):
- `audioPreset: AudioPresets.speech` (livekit-client) — bitrate baixo otimizado para fala.
- `dtx: true` — não transmite pacotes em silêncio.
- `red: true` — redundância contra perda de pacote.

Toggle `audioEnhanced` em `useMeetPreferences` (default `true`) permite desligar caso o usuário precise transmitir música ou instrumento.

> **Próximo passo opcional (pago):** `@livekit/krisp-noise-filter` adiciona supressão Krisp/RNNoise (cancela latido de cachorro, choro de bebê). Requer plano LiveKit Cloud pago — não instalado.

### Fundo virtual (blur / imagem)

Usa `@livekit/track-processors` (gratuito, MediaPipe + WebGL no cliente). Componente `VirtualBackgroundControl` (`src/components/meetings/VirtualBackgroundControl.tsx`) renderiza um botão `Fundo` dentro da `ControlBar`. Opções:
- **Sem fundo** — `track.stopProcessor()`.
- **Desfoque leve** (`blurRadius: 8`) e **forte** (`blurRadius: 15`).
- **Imagem de fundo** — 4 presets neutros + upload local (FileReader → data URL).

API usada: `BackgroundProcessor({ mode, blurRadius/imagePath })` + `localVideoTrack.setProcessor(processor)`. Trocas subsequentes usam `processor.switchTo({...})` para evitar recriar o pipeline (sem flicker). Preferência salva em `localStorage` (`empire.meet.preferences.v1`) e reaplicada automaticamente quando a câmera volta a estar disponível.

Aviso de performance exibido quando `navigator.hardwareConcurrency < 4` (devices fracos podem perder FPS).

### Composição manual de `MeetRoom`

Para encaixar o botão de fundo virtual, `<VideoConference />` foi substituído por composição manual:

```tsx
<MeetStage />            {/* useTracks + GridLayout + ParticipantTile */}
<RoomAudioRenderer />
<ControlBar variation="verbose" controls={{ chat, screenShare, leave }}>
  <VirtualBackgroundControl />
</ControlBar>
<Chat />
```

Os botões "Encerrar para todos" (canto superior esquerdo, dupla confirmação), "Convidar externo" (canto superior direito) e o `GuestApprovalPanel` continuam intactos.

## Pendente (próximas iterações)

- Botão "📞 Huddle" no header do chat + banner ao vivo + slash command `/huddle`.
- Player MP4 embed em `MeetingSummary` quando `recording_url` estiver pronto.
- Soniox sobre tracks LiveKit (auto-transcrição em huddles).
- PIN numérico opcional para link de convidado.
