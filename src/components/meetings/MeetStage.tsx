/**
 * MeetStage — v8.37.0 (Google Meet style, redesign Liquid Glass dark)
 *
 * Layout:
 *  - Desktop (≥768px): split horizontal — área principal ~70% + sidebar grid à direita.
 *  - Mobile (<768px): stack vertical — área principal 60% em cima, carrossel
 *    horizontal com scroll snap embaixo.
 *  - Sem screen share + ≤2 participantes: grid simétrico (sem sidebar) para não
 *    desperdiçar espaço.
 *
 * Foco automático:
 *  - Screen share sempre ganha o foco quando presente.
 *  - Pin manual (clique no tile) sobrescreve a heurística.
 *  - Caso contrário, último active speaker (via `useSpeakingParticipants`).
 *  - Fallback: primeiro participante remoto, depois local.
 *
 * Gerencia o `pinnedSid` localmente — não persiste, é um override de sessão.
 *
 * v8.36.0 — removidos os props `isFullscreen`/`onToggleFullscreen`: eram
 * declarados e nunca usados (o botão de fullscreen vive na MeetControlBar).
 * Cores hardcoded trocadas por tokens semânticos (bg-background / bg-card).
 *
 * v8.37.0 — OTIMIZAÇÃO DA SALA, portada do produto irmão `omnx-meet`
 * (`src/apps/meeting-room/room/RoomStage.tsx`). Duas peças novas:
 *
 *  1. ORÇAMENTO GLOBAL DE VÍDEO (`video-budget.tsx`). Até aqui, todo
 *     participante com câmera virava um `<video>` decodificando — e o painel de
 *     participantes montava OUTRA leva por cima. Cada stream tem custo fixo de
 *     CPU/GPU independente do tamanho do tile: numa call de 6 em notebook
 *     fraco, isso derruba o framerate de todo mundo, inclusive de quem está
 *     falando. Agora existe um teto por máquina, repartido por zonas de
 *     prioridade, e quem fica de fora aparece como avatar (custo zero).
 *
 *  2. GUARDA DE REDE (`useNetworkGuard.ts`). Sob rede ruim o WebRTC insiste em
 *     mandar vídeo, a fila cresce e o ÁUDIO picota junto — o pior resultado
 *     possível. A guarda corta o vídeo local em degraus, protegendo a voz.
 *
 * Nada disso muda o que se vê numa sala de 2 a 4 pessoas: o teto mínimo (4
 * vídeos, máquina fraca) só aperta em sala grande ou em máquina fraca.
 */
import { useEffect, useMemo, useState } from "react";
import {
  useTracks,
  useSpeakingParticipants,
  useLocalParticipant,
  isTrackReference,
  type TrackReference,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import { MeetTile } from "./MeetTile";
import { cn } from "@/lib/utils";
import {
  OrcamentoDeVideoProvider,
  chaveDaTrack,
  contarVideosAoVivo,
  selecionarComVideo,
  temVideoAoVivo,
  useVagasDeVideo,
} from "./video-budget";
import { useNetworkGuard, type EstadoDaRede } from "./useNetworkGuard";
import { podeUsarVidroSobreVideo } from "./device-capabilities";

/**
 * Teto de tiles no grid simétrico. Acima disso, o excedente vira contador.
 *
 * O número não é estético: é o ponto em que o tile fica menor que um rosto
 * reconhecível numa tela de notebook. Passar disso não mostra mais gente —
 * mostra mais retângulos escuros, e ainda cobra o custo de layout de cada um.
 * Hoje o grid simétrico só aceita ≤2 câmeras, então o teto é uma rede de
 * segurança para quando essa regra mudar, não uma restrição ativa.
 */
const MAX_TILES_NA_GRADE = 12;

/*
  SOURCES E OPTIONS DO `useTracks` — CONSTANTES DE MÓDULO, NÃO LITERAIS INLINE.

  Lido no bundle do `@livekit/components-react` (`hooks-*.mjs`, corpo do
  `useTracks`): o efeito de subscrição usa `JSON.stringify(sources)` nas deps —
  estável —, mas o `useMemo` FINAL, que monta o array devolvido, tem as deps
  `[trackReferences, participants, sources]`, com `sources` CRU. Passar um
  literal inline dá identidade nova a cada render, o memo nunca acerta, e o hook
  devolve um Array novo (com objetos placeholder novos dentro) toda vez.

  Aqui isso custava caro: `tracksRaw` alimenta nove `useMemo` encadeados abaixo,
  todos invalidados a cada render da sala — que re-renderiza a cada participante
  que fala. Hoistar é uma linha e devolve o memo interno do LiveKit.

  Sem `as const`: a assinatura do hook é genérica sobre `SourcesArray`, e
  congelar em readonly/literal não casa com ela.
*/
const STAGE_SOURCES = [
  { source: Track.Source.Camera, withPlaceholder: true },
  { source: Track.Source.ScreenShare, withPlaceholder: false },
];
const STAGE_TRACK_OPTIONS = { onlySubscribed: false };

/**
 * Chave de reconciliação de um tile: IDENTIDADE + FONTE — nunca `trackSid`.
 *
 * O `<video>` real só é derrubado por unmount/remount: no `livekit-client`
 * (`src/room/track/Track.ts`) o attach/detach vive num efeito com deps
 * `[track, element]`, e `detachTrack` faz `element.srcObject = null` sem parar
 * a track — que é exatamente o sintoma "piscada preta". Re-render normal não
 * derruba nada; só a troca de `key` derruba.
 *
 * Por isso `trackSid` NÃO pode entrar na chave: quando alguém LIGA a câmera o
 * id salta de placeholder para `TR_xxx`, e numa republicação (troca de
 * dispositivo, fundo virtual aplicado ou removido) ele muda de novo. Nos dois
 * casos é o MESMO participante no MESMO lugar da tela — o nó tem de sobreviver.
 *
 * `identity` (e não `sid`) porque o `sid` do participante muda numa reconexão;
 * a identidade é a mesma pessoa do começo ao fim da sala.
 */
function chaveDoTile(t: TrackReference): string {
  return `${t.participant.identity}:${t.source}`;
}

/**
 * Miniaturas na sidebar/carrossel. Acima disso, viram um contador "+N".
 *
 * A referência usa 4 porque a tirinha dela NÃO rola: o quinto rosto sairia da
 * tela sem aviso. A do GT3 rola (`overflow-y-auto`), então cortar em 4 tiraria
 * gente que hoje o usuário alcança rolando — por isso 6, que é o menor número
 * que deixa a call de até 6 pessoas com screen share exatamente como está hoje.
 * Acima dele o custo de montar tile deixa de compensar: são rostos que ninguém
 * está olhando enquanto acompanha a apresentação.
 */
const MAX_MINIATURAS = 6;

/** Texto do aviso de rede — um por degrau da guarda. */
const AVISO_DE_REDE: Record<Exclude<EstadoDaRede, "ok">, string> = {
  instavel: "Conexão instável",
  video_reduzido: "Sua câmera foi desligada para manter o áudio estável",
  somente_audio: "Conexão perdida — mantendo somente áudio",
};

export function MeetStage() {
  /*
    O provider do orçamento mora na RAIZ do palco: é ele que segura o único
    contador de vídeos da sala. O palco inteiro (e, por baixo dele, o painel de
    participantes) consulta o mesmo teto, em vez de cada um achar que é o único
    na tela — que era exatamente o bug de performance que esta mudança desfaz.
  */
  return (
    <OrcamentoDeVideoProvider>
      <MeetStageInterno />
    </OrcamentoDeVideoProvider>
  );
}

function MeetStageInterno() {
  const tracksRaw = useTracks(STAGE_SOURCES, STAGE_TRACK_OPTIONS);

  // Mantemos só TrackReferences "reais" (descartando placeholders sem participant válido).
  const tracks = useMemo(
    () => tracksRaw.filter((t): t is TrackReference => isTrackReference(t)),
    [tracksRaw],
  );

  const screenShare = useMemo(
    () => tracks.find((t) => t.source === Track.Source.ScreenShare),
    [tracks],
  );

  const cameraTracks = useMemo(
    () => tracks.filter((t) => t.source === Track.Source.Camera),
    [tracks],
  );

  const speakers = useSpeakingParticipants();
  const { localParticipant } = useLocalParticipant();

  /*
    GUARDA DE REDE — chamada aqui porque o MeetStage já vive dentro do
    `<LiveKitRoom>`, então `useRoomContext`/`useLocalParticipant` funcionam.
    Ativa só quando existe participante local publicando: num espectador sem
    câmera não há vídeo local para cortar, e o timer seria puro desperdício.
  */
  const estadoDaRede = useNetworkGuard(Boolean(localParticipant));

  const [pinnedSid, setPinnedSid] = useState<string | null>(null);
  // Active speaker estável: lembra o último que falou (anti-flicker em silêncios curtos)
  const [lastSpeakerSid, setLastSpeakerSid] = useState<string | null>(null);
  useEffect(() => {
    const top = speakers.find((p) => !p.isLocal) ?? speakers[0];
    if (top?.sid) setLastSpeakerSid(top.sid);
  }, [speakers]);

  // Resolve a track de foco (screen share > pin > active speaker > primeiro remoto > local)
  const focusTrack: TrackReference | undefined = useMemo(() => {
    if (screenShare) return screenShare;

    if (pinnedSid) {
      const pinned = cameraTracks.find((t) => t.participant.sid === pinnedSid);
      if (pinned) return pinned;
    }

    if (lastSpeakerSid) {
      const speaking = cameraTracks.find((t) => t.participant.sid === lastSpeakerSid);
      if (speaking) return speaking;
    }

    const firstRemote = cameraTracks.find((t) => !t.participant.isLocal);
    if (firstRemote) return firstRemote;

    return cameraTracks.find((t) => t.participant.sid === localParticipant?.sid);
  }, [screenShare, pinnedSid, lastSpeakerSid, cameraTracks, localParticipant?.sid]);

  // Tiles que vão para a sidebar / carrossel (todos menos o foco — exceto se o
  // foco for screen share, aí o publicador também aparece como tile separado).
  const sideTracks: TrackReference[] = useMemo(() => {
    if (screenShare) return cameraTracks;
    if (!focusTrack) return cameraTracks;
    return cameraTracks.filter(
      (t) => t.participant.sid !== focusTrack.participant.sid,
    );
  }, [cameraTracks, screenShare, focusTrack]);

  // Caso degenerado: 1 ou 2 câmeras e sem screen share → grid simétrico bonito,
  // sem sidebar (evita layout enviesado em call de poucas pessoas).
  const useSymmetricGrid = !screenShare && cameraTracks.length <= 2;

  /*
    QUEM ENTRA EM CADA FILA — calculado ANTES de qualquer `return`.

    Os hooks do orçamento precisam rodar em TODA renderização (regra dos hooks),
    e dependem de quantos vídeos cada fila quer montar. Então as fatias são
    decididas aqui, uma vez, e o JSX mais abaixo só as desenha.
  */
  const naGrade = useMemo(
    () => (useSymmetricGrid ? cameraTracks.slice(0, MAX_TILES_NA_GRADE) : []),
    [useSymmetricGrid, cameraTracks],
  );
  const miniaturas = useMemo(
    () => (useSymmetricGrid ? [] : sideTracks.slice(0, MAX_MINIATURAS)),
    [useSymmetricGrid, sideTracks],
  );
  const excedenteDeMiniaturas = useSymmetricGrid
    ? 0
    : Math.max(0, sideTracks.length - MAX_MINIATURAS);

  /*
    REPARTIÇÃO DO ORÇAMENTO (ordem de prioridade em `video-budget.tsx`):

      destaque  → o quadro grande. É o conteúdo da reunião naquele instante
                  (tela compartilhada ou quem está falando); se algo tem de
                  virar avatar, não é ele.
      grade     → os tiles do grid simétrico (sala de 1-2 câmeras).
      miniatura → a sidebar (desktop) / carrossel (mobile).
      painel    → sobra para o `MeetParticipantsPanel`, que é rolável e estreito:
                  é o lugar onde um avatar no lugar do vídeo menos custa.

    Só quem tem imagem AO VIVO declara demanda: câmera desligada já vem como
    placeholder e não custa decodificação nenhuma — contá-la desperdiçaria vaga
    e faria alguém com vídeo virar avatar sem necessidade.
  */
  const vagasDoDestaque = useVagasDeVideo(
    "destaque",
    !useSymmetricGrid && focusTrack && temVideoAoVivo(focusTrack) ? 1 : 0,
  );
  const vagasDaGrade = useVagasDeVideo("grade", contarVideosAoVivo(naGrade));
  const vagasDasMiniaturas = useVagasDeVideo("miniatura", contarVideosAoVivo(miniaturas));

  const comVideoNaGrade = useMemo(
    () => selecionarComVideo(naGrade, vagasDaGrade),
    [naGrade, vagasDaGrade],
  );
  const comVideoNasMiniaturas = useMemo(
    () => selecionarComVideo(miniaturas, vagasDasMiniaturas),
    [miniaturas, vagasDasMiniaturas],
  );

  const aviso = estadoDaRede === "ok" ? null : AVISO_DE_REDE[estadoDaRede];

  if (useSymmetricGrid) {
    return (
      <div className="relative h-full w-full bg-background p-2 sm:p-4">
        <AvisoDeRede aviso={aviso} />
        <div
          className={cn(
            "grid gap-2 sm:gap-3 h-full w-full",
            naGrade.length === 1 ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2",
          )}
        >
          {naGrade.map((t) => (
            <MeetTile
              key={chaveDoTile(t)}
              trackRef={t}
              size="focus"
              pinned={pinnedSid === t.participant.sid}
              onTogglePin={() =>
                setPinnedSid((cur) => (cur === t.participant.sid ? null : t.participant.sid))
              }
              showPinButton={false}
              permitirVideo={comVideoNaGrade.has(chaveDaTrack(t))}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-background">
      <AvisoDeRede aviso={aviso} />
      {/* Desktop: split horizontal (lg+). Mobile: stack vertical. */}
      <div className="h-full w-full flex flex-col md:flex-row gap-1.5 sm:gap-3 p-1.5 sm:p-4">
        {/* Área de foco */}
        <div
          className={cn(
            "relative min-h-0",
            "flex-[5] md:flex-[7]",
            "h-[65%] md:h-auto",
          )}
        >
          {focusTrack ? (
            <MeetTile
              /* Sem prefixo `focus:` e sem `trackSid` — ver `chaveDoTile`. O
                 prefixo garantia que o MESMO vídeo trocasse de chave ao ser
                 pinado; ligar/desligar a câmera de quem está em destaque
                 também derrubava o nó por causa do `trackSid`. Agora o quadro
                 grande só remonta quando de fato passa a mostrar OUTRA pessoa
                 (ou outra fonte), que é o único caso em que remontar é
                 inevitável. */
              key={chaveDoTile(focusTrack)}
              trackRef={focusTrack}
              size="focus"
              pinned={pinnedSid === focusTrack.participant.sid}
              onTogglePin={() =>
                setPinnedSid((cur) =>
                  cur === focusTrack.participant.sid ? null : focusTrack.participant.sid,
                )
              }
              showPinButton={!screenShare}
              /* Primeira zona do orçamento: só cai para avatar numa máquina que
                 não aguenta um único vídeo — e aí o problema é outro. */
              permitirVideo={vagasDoDestaque > 0}
            />
          ) : (
            <div className="h-full w-full rounded-2xl bg-card flex items-center justify-center text-muted-foreground text-sm">
              Aguardando participantes…
            </div>
          )}
        </div>

        {/* Sidebar (desktop) / Carrossel (mobile) */}
        {miniaturas.length > 0 && (
          <div
            className={cn(
              "min-h-0",
              "flex-[2] md:flex-[3] md:max-w-[360px]",
              "flex flex-row md:flex-col gap-2 sm:gap-3",
              "overflow-x-auto md:overflow-y-auto md:overflow-x-hidden",
              "snap-x snap-mandatory md:snap-none",
              "scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10",
              "pb-1 md:pb-0",
            )}
          >
            {/* Mobile: tiles ocupam ~45% da largura, lado a lado com scroll */}
            {/* Desktop: grid 1-col (max ~360px) com scroll vertical */}
            {miniaturas.map((t) => (
              <div
                key={chaveDoTile(t)}
                className={cn(
                  "shrink-0 snap-start md:snap-align-none",
                  "w-[44%] sm:w-[36%] md:w-full",
                )}
              >
                <MeetTile
                  trackRef={t}
                  size="thumb"
                  pinned={pinnedSid === t.participant.sid}
                  onTogglePin={() =>
                    setPinnedSid((cur) =>
                      cur === t.participant.sid ? null : t.participant.sid,
                    )
                  }
                  /* Miniatura sem vaga vira avatar: numa apresentação o que
                     importa é o quadro grande, que vem antes desta fila. */
                  permitirVideo={comVideoNasMiniaturas.has(chaveDaTrack(t))}
                />
              </div>
            ))}
            {excedenteDeMiniaturas > 0 && (
              /* Excedente vira CONTADOR, não mais um tile: acima do teto, cada
                 rosto a mais custa layout e decodificação sem ninguém olhar. */
              <div
                className={cn(
                  "shrink-0 snap-start md:snap-align-none",
                  "w-[44%] sm:w-[36%] md:w-full",
                  "aspect-video rounded-2xl bg-card",
                  "flex items-center justify-center",
                  "text-muted-foreground text-sm font-medium",
                )}
                aria-label={`Mais ${excedenteDeMiniaturas} participantes`}
              >
                +{excedenteDeMiniaturas}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Aviso da guarda de rede.
 *
 * Não é enfeite: a guarda desliga a câmera do usuário sozinha, e desligar a
 * câmera de alguém sem dizer por quê é o tipo de coisa que faz a pessoa achar
 * que o produto quebrou. Some sozinho quando a rede volta.
 */
function AvisoDeRede({ aviso }: { aviso: string | null }) {
  if (!aviso) return null;
  /* Este aviso aparece justamente quando a máquina/rede está sofrendo — é o
     último lugar da tela que pode se dar ao luxo de um `backdrop-filter`
     recomposto sobre vídeo. Sem vidro, o fundo fica opaco e o texto continua
     legível, que era o único serviço prestado pelo desfoque. */
  const comVidro = podeUsarVidroSobreVideo();
  return (
    <div
      role="status"
      className={cn(
        "pointer-events-none absolute top-3 left-1/2 z-20 -translate-x-1/2",
        "rounded-full text-destructive-foreground",
        comVidro ? "bg-destructive/90 backdrop-blur-md" : "bg-destructive",
        "px-3 py-1 text-xs font-medium shadow-lg",
      )}
    >
      {aviso}
    </div>
  );
}
