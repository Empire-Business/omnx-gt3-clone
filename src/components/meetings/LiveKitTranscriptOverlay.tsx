/**
 * LiveKitTranscriptOverlay — v8.36.1
 * Indicador de transcrição do host + painel opcional de legendas ao vivo.
 *
 * IMPORTANTE — separação entre PIPELINE e UI (v8.36.1):
 *  - O PIPELINE (captura Soniox + auto-save em `meetings.transcript_raw`, que
 *    alimenta a meeting-ai) roda para o host SEMPRE que há `meetingId` — exatamente
 *    como fazia o antigo `TranscriptionStatus` do MeetRoom, antes da v8.36.0.
 *  - A PREFERÊNCIA `liveTranscriptionEnabled` controla apenas a EXIBIÇÃO das
 *    legendas, e nasce DESLIGADA. Nada de feature nova ligada por padrão na sala.
 *
 * Este é o ÚNICO consumidor de `useLiveKitTranscription` na página — nunca pode
 * existir um segundo, sob pena de duas sessões Soniox (custo dobrado + duas
 * escritas concorrentes em `meetings.transcript_raw`).
 *
 * Performance (v8.36.1):
 *  - lista com teto de MAX_VISIBLE_SEGMENTS e `key` estável (`t.id`, nunca índice);
 *  - lista isolada em subcomponente `React.memo` — parciais (`liveText`) não
 *    remontam o histórico;
 *  - auto-scroll instantâneo (sem `smooth`) e com throttle.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Captions, CaptionsOff, ChevronDown, ChevronUp, Loader2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMeetPreferences } from "@/hooks/useMeetPreferences";
import { useLiveKitTranscription } from "@/hooks/useLiveKitTranscription";
import type { SonioxToken } from "@/hooks/useSoniox";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  meetingId: string | null;
  isHost: boolean;
}

/**
 * Teto de segmentos renderizados no painel.
 * O painel tem 192px (h-48) e mostra ~10-14 linhas; 40 dá ~3 telas de scroll-back,
 * que é tudo que alguém lê ao vivo, e trava o custo de reconciliação num teto
 * CONSTANTE — antes uma reunião de 1h renderizava centenas de segmentos a cada
 * atualização, o que fazia a sala piorar quanto mais longa a reunião.
 * Nada se perde: `transcript` inteiro continua sendo salvo em `transcript_raw`.
 */
const MAX_VISIBLE_SEGMENTS = 40;

/** Intervalo mínimo entre auto-scrolls (ms). */
const SCROLL_THROTTLE_MS = 300;

const SPEAKER_BG = [
  "bg-area-acquisition/15 text-area-acquisition",
  "bg-success/15 text-success",
  "bg-primary/15 text-primary",
  "bg-warning/15 text-warning",
  "bg-danger/15 text-danger",
  "bg-info/15 text-info",
];

function speakerColor(label: string) {
  const hash = label.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return SPEAKER_BG[hash % SPEAKER_BG.length];
}

/**
 * Lista de legendas isolada e memoizada: só re-renderiza quando o array de
 * segmentos visíveis ou o texto parcial realmente mudam.
 */
const TranscriptList = memo(function TranscriptList({
  items,
  liveText,
  liveSpeaker,
  bottomRef,
}: {
  items: SonioxToken[];
  liveText: string;
  liveSpeaker: string | null;
  bottomRef: React.RefObject<HTMLDivElement>;
}) {
  return (
    <ScrollArea className="h-48">
      <div className="space-y-1 text-xs pr-2">
        {items.length === 0 && !liveText && (
          <p className="text-muted-foreground italic p-2">Aguardando fala…</p>
        )}
        {items.map((t) => (
          <div key={t.id} className={cn("rounded px-2 py-1 leading-snug", speakerColor(t.speaker))}>
            <span className="font-semibold mr-1.5">{t.speaker}:</span>
            <span className="text-foreground">{t.text}</span>
          </div>
        ))}
        {liveText && (
          <div
            className={cn(
              "rounded px-2 py-1 leading-snug opacity-60 italic",
              liveSpeaker ? speakerColor(liveSpeaker) : "bg-muted",
            )}
          >
            {liveSpeaker && <span className="font-semibold mr-1.5">{liveSpeaker}:</span>}
            <span className="text-muted-foreground">{liveText}</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
});

/**
 * Header (status + toggle) memoizado em props PRIMITIVAS. Com as legendas
 * desligadas, o hook ainda produz ~5 setState/s (tokens parciais); memoizar aqui
 * faz esse re-render custar apenas bailouts, sem reconciliar ícones/badges.
 */
const OverlayHeader = memo(function OverlayHeader({
  showCaptions,
  collapsed,
  pipelineEnabled,
  isReady,
  isReconnecting,
  hasError,
  participantsCaptured,
  onToggleCaptions,
  onToggleCollapsed,
}: {
  showCaptions: boolean;
  collapsed: boolean;
  pipelineEnabled: boolean;
  isReady: boolean;
  isReconnecting: boolean;
  hasError: boolean;
  participantsCaptured: number;
  onToggleCaptions: () => void;
  onToggleCollapsed: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
      <div className="flex items-center gap-2 min-w-0">
        <Button
          variant={showCaptions ? "default" : "ghost"}
          size="sm"
          className="h-7 px-2 gap-1.5"
          onClick={onToggleCaptions}
          title={showCaptions ? "Ocultar legendas ao vivo" : "Mostrar legendas ao vivo"}
        >
          {showCaptions ? <Captions className="w-3.5 h-3.5" /> : <CaptionsOff className="w-3.5 h-3.5" />}
          <span className="text-xs font-medium">Legendas</span>
        </Button>
        {pipelineEnabled && hasError && (
          <Badge variant="destructive" className="h-5 text-[10px] px-1.5 gap-1">
            <AlertCircle className="w-3 h-3" />
            Erro
          </Badge>
        )}
        {pipelineEnabled && !hasError && isReconnecting && (
          <Badge variant="outline" className="h-5 text-[10px] px-1.5 gap-1 text-warning border-warning/40">
            <WifiOff className="w-3 h-3" />
            Reconectando…
          </Badge>
        )}
        {pipelineEnabled && !hasError && !isReconnecting && !isReady && (
          <Badge variant="outline" className="h-5 text-[10px] px-1.5 gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Conectando…
          </Badge>
        )}
        {pipelineEnabled && !hasError && !isReconnecting && isReady && (
          <Badge variant="outline" className="h-5 text-[10px] px-1.5 gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            {participantsCaptured} mic(s)
          </Badge>
        )}
      </div>
      {showCaptions && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onToggleCollapsed}
          title={collapsed ? "Expandir" : "Recolher"}
        >
          {collapsed ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </Button>
      )}
    </div>
  );
});

export function LiveKitTranscriptOverlay({ meetingId, isHost }: Props) {
  const { prefs, update } = useMeetPreferences();
  const [collapsed, setCollapsed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Pipeline: host + reunião existente. Independe da preferência de legendas —
  // é o comportamento que já existia antes da v8.36.0 (TranscriptionStatus).
  const pipelineEnabled = isHost && !!meetingId;
  // UI de legendas: opt-in explícito do usuário.
  const showCaptions = prefs.liveTranscriptionEnabled;

  const { transcript, liveText, liveSpeaker, isReady, isReconnecting, error, participantsCaptured } =
    useLiveKitTranscription(meetingId, pipelineEnabled);

  // Só os últimos N segmentos vão para o DOM. `transcript` só muda em token final,
  // então a identidade deste array é estável entre parciais (memo do filho segura).
  const visibleSegments = useMemo(
    () => (transcript.length > MAX_VISIBLE_SEGMENTS ? transcript.slice(-MAX_VISIBLE_SEGMENTS) : transcript),
    [transcript],
  );

  // Auto-scroll com throttle e SEM `smooth` — o scroll suave reiniciava uma
  // animação do compositor várias vezes por segundo.
  const lastScrollRef = useRef(0);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!showCaptions || collapsed) return;
    const run = () => {
      scrollTimerRef.current = null;
      lastScrollRef.current = Date.now();
      scrollRef.current?.scrollIntoView({ block: "end" });
    };
    const since = Date.now() - lastScrollRef.current;
    if (since >= SCROLL_THROTTLE_MS) run();
    else if (scrollTimerRef.current === null) {
      scrollTimerRef.current = setTimeout(run, SCROLL_THROTTLE_MS - since);
    }
  }, [visibleSegments, liveText, showCaptions, collapsed]);

  // Limpa o timer pendente apenas no unmount (limpar a cada efeito anularia o throttle).
  useEffect(() => () => {
    if (scrollTimerRef.current !== null) clearTimeout(scrollTimerRef.current);
  }, []);

  // Paridade com o antigo TranscriptionStatus: falha de transcrição vira toast,
  // porque o host pode estar com o painel fechado e não ver o badge de erro.
  const errShownRef = useRef<string | null>(null);
  useEffect(() => {
    if (error && errShownRef.current !== error) {
      errShownRef.current = error;
      toast.error(`Transcrição: ${error}`);
    }
    if (!error) errShownRef.current = null;
  }, [error]);

  const toggleCaptions = useCallback(
    () => update({ liveTranscriptionEnabled: !showCaptions }),
    [update, showCaptions],
  );
  const toggleCollapsed = useCallback(() => setCollapsed((c) => !c), []);

  if (!isHost) return null;

  return (
    <div className="absolute bottom-20 left-4 z-40 w-80 max-w-[calc(100vw-2rem)]">
      <div className="rounded-lg border border-border bg-background/95 backdrop-blur-md shadow-xl overflow-hidden">
        <OverlayHeader
          showCaptions={showCaptions}
          collapsed={collapsed}
          pipelineEnabled={pipelineEnabled}
          isReady={isReady}
          isReconnecting={isReconnecting}
          hasError={!!error}
          participantsCaptured={participantsCaptured}
          onToggleCaptions={toggleCaptions}
          onToggleCollapsed={toggleCollapsed}
        />

        {/* Legendas — só existem no DOM quando o usuário liga explicitamente. */}
        {showCaptions && !collapsed && (
          <div className="p-2">
            {error ? (
              <p className="text-xs text-destructive p-3">{error}</p>
            ) : (
              <>
                <TranscriptList
                  items={visibleSegments}
                  liveText={liveText}
                  liveSpeaker={liveSpeaker}
                  bottomRef={scrollRef}
                />
                <div className="flex items-center justify-between mt-2 px-1 text-[10px] text-muted-foreground">
                  <span>{participantsCaptured} mic(s) capturado(s)</span>
                  <span>{transcript.length} segmentos</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
