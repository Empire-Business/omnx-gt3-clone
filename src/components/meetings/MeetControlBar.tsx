/**
 * MeetControlBar — v8.11.0 (Google Meet-style)
 * Barra flutuante centralizada com botões circulares (44×44).
 * - Icon-only com tooltips PT-BR
 * - Mic / Cam toggle: cinza quando ativo, vermelho quando muted
 * - Hangup destacado em destructive (vermelho)
 * - "Mais" agrega Devices, Noise filter, Background, Convidar, Encerrar p/ todos
 * - 100% tokens do design system
 */
import { useTrackToggle, useDisconnectButton } from "@livekit/components-react";
import { Track } from "livekit-client";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  ScreenShare,
  ScreenShareOff,
  MessageSquare,
  PhoneOff,
  Loader2,
  MoreVertical,
  Maximize2,
  Minimize2,
  Users,
  Circle,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { AudioNoiseFilterControl } from "./AudioNoiseFilterControl";
import { VirtualBackgroundControl } from "./VirtualBackgroundControl";
import { DeviceSelector } from "./DeviceSelector";
import { RemoteVolumeControl } from "./RemoteVolumeControl";
import { CopyGuestLinkButton } from "./CopyGuestLinkButton";

interface MeetControlBarProps {
  isHost: boolean;
  roomName: string;
  showChat: boolean;
  onToggleChat: () => void;
  onEndForAll: () => void;
  endingForAll: boolean;
  /**
   * Fullscreen é OPCIONAL: a página do convidado (MeetGuest) não passa esses
   * props. Enquanto eram obrigatórios o botão renderizava com onClick
   * `undefined` — botão morto em runtime (o `npm run build` não pega porque
   * roda vite sem tsc). Sem `onToggleFullscreen`, não renderizamos o botão.
   */
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  showParticipants?: boolean;
  onToggleParticipants?: () => void;
  participantCount?: number;
  isRecording?: boolean;
  /** Mensagens de conversa recebidas com o painel fechado (badge do botão). */
  unreadChatCount?: number;
}

export function MeetControlBar({
  isHost,
  roomName,
  showChat,
  onToggleChat,
  onEndForAll,
  endingForAll,
  isFullscreen = false,
  onToggleFullscreen,
  showParticipants = false,
  onToggleParticipants,
  participantCount,
  isRecording = false,
  unreadChatCount = 0,
}: MeetControlBarProps) {
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);

  return (
    <TooltipProvider delayDuration={300}>
      {/* bg-black é intencional (superfície de mídia): a barra continua o
          palco de vídeo preto do MeetRoom/MeetGuest, não a superfície do tema.
          Todo o resto usa tokens semânticos. */}
      <div className="w-full flex justify-center px-2 sm:px-4 py-2 sm:py-3 bg-black">
        <div
          className={cn(
            "flex items-center gap-1 sm:gap-1.5 lg:gap-2 px-2 sm:px-3 py-2",
            "rounded-full bg-card/70 backdrop-blur-md border border-border/40",
            "max-w-full",
          )}
        >
          <MicToggle />
          <CamToggle />
          {/* Antes o botão era `hidden sm:inline-flex` e simplesmente sumia no
              celular, sem explicação — mas há mobile que compartilha tela
              (Chrome/Android) e quem não tem suporte (iOS Safari, sem
              getDisplayMedia) merecia um motivo, não um botão fantasma.
              O próprio ScreenShareToggle detecta o suporte e se desabilita. */}
          <ScreenShareToggle />

          <div className="mx-1 h-8 w-px bg-border/60 hidden sm:block" aria-hidden />

          {/* O badge é só visual (aria-hidden) — quem usa leitor de tela
              precisa da contagem no próprio nome do botão. */}
          <CircleAction
            label={
              showChat
                ? "Fechar conversa"
                : unreadChatCount > 0
                  ? `Abrir conversa, ${unreadChatCount} ${
                      unreadChatCount === 1 ? "mensagem não lida" : "mensagens não lidas"
                    }`
                  : "Abrir conversa"
            }
            onClick={onToggleChat}
            active={showChat}
            badge={showChat ? undefined : unreadChatCount}
          >
            <MessageSquare className="w-5 h-5" />
          </CircleAction>

          {/* Participantes — SEM `hidden sm:inline-flex`: saber quem está na
              call é essencial justamente no celular, onde o palco mostra
              poucos tiles. */}
          {onToggleParticipants && (
            <CircleAction
              label={
                showParticipants
                  ? "Fechar lista de participantes"
                  : `Participantes${participantCount ? ` (${participantCount})` : ""}`
              }
              onClick={onToggleParticipants}
              active={showParticipants}
              badge={participantCount}
            >
              <Users className="w-5 h-5" />
            </CircleAction>
          )}

          {/* Controles secundários — escalonados por breakpoint pra evitar
              overflow da barra. Volume entra cedo (sm+) porque é ajuste comum
              mid-call. Background/Devices ficam pra lg+ (config raro). */}
          <span className="hidden sm:inline-flex"><RemoteVolumeControl /></span>
          <span className="hidden md:inline-flex"><AudioNoiseFilterControl /></span>
          <span className="hidden lg:inline-flex"><VirtualBackgroundControl /></span>
          <span className="hidden lg:inline-flex"><DeviceSelector /></span>

          {/* Só renderiza se o pai realmente souber alternar tela cheia. */}
          {onToggleFullscreen && (
            <span className="hidden md:inline-flex">
              <CircleAction
                label={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
                onClick={onToggleFullscreen}
              >
                {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
              </CircleAction>
            </span>
          )}

          {/* Indicador de gravação — texto + ícone (nunca só cor). */}
          {isRecording && (
            <span
              role="status"
              aria-label="Reunião sendo gravada"
              className={cn(
                "hidden sm:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full",
                "bg-destructive/15 text-destructive text-xs font-medium",
              )}
            >
              <Circle className="w-2.5 h-2.5 fill-current animate-pulse" aria-hidden />
              Gravando
            </span>
          )}

          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "h-11 w-11 rounded-full flex items-center justify-center",
                      "bg-muted/40 hover:bg-muted/70 text-foreground transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    )}
                    aria-label="Mais opções"
                  >
                    <MoreVertical className="w-5 h-5" />
                  </button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="top">Mais opções</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" side="top" className="w-56">
              {isHost && (
                <>
                  <DropdownMenuLabel>Host</DropdownMenuLabel>
                  <DropdownMenuItem
                    asChild
                    onSelect={(e) => e.preventDefault()}
                  >
                    <CopyGuestLinkButton
                      roomName={roomName}
                      variant="ghost"
                      size="sm"
                      label="Convidar externo"
                      className="w-full justify-start font-normal"
                    />
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault();
                      setEndConfirmOpen(true);
                    }}
                    className="text-destructive focus:text-destructive"
                  >
                    <PhoneOff className="w-4 h-4 mr-2" />
                    Encerrar para todos
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {/* Rodapé informativo (não é item clicável). Os atalhos são
                  reais — implementados em useMeetShortcuts.ts. */}
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Atalhos: <kbd className="font-sans font-medium text-foreground">M</kbd> silencia,{" "}
                <kbd className="font-sans font-medium text-foreground">V</kbd> desliga a câmera
              </DropdownMenuLabel>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="mx-1 h-8 w-px bg-border/60" aria-hidden />

          <LeaveButton />
        </div>
      </div>

      {/* Confirmação de encerrar p/ todos */}
      <AlertDialog open={endConfirmOpen} onOpenChange={setEndConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar reunião para todos?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos serão desconectados imediatamente. A gravação (se ativa) será
              finalizada e o vídeo ficará disponível em alguns minutos. Esta ação
              não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={endingForAll}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                onEndForAll();
                setEndConfirmOpen(false);
              }}
              disabled={endingForAll}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {endingForAll ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Encerrando…
                </>
              ) : (
                <>
                  <PhoneOff className="w-4 h-4 mr-2" />
                  Sim, encerrar
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}

/* ============================================================
   Botão circular base (44×44, Meet-style)
   ============================================================ */

interface CircleProps {
  label: string;
  onClick?: (e: React.MouseEvent) => void;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
  /** Contador exibido como badge (ex.: nº de participantes). */
  badge?: number;
}

function CircleAction({ label, onClick, active, danger, disabled, children, className, badge }: CircleProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          className={cn(
            "relative h-11 w-11 rounded-full flex items-center justify-center transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            danger
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              : active
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted/40 hover:bg-muted/70 text-foreground",
            className,
          )}
        >
          {children}
          {typeof badge === "number" && badge >= 1 && (
            <span
              aria-hidden
              className={cn(
                "absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full",
                "flex items-center justify-center text-[10px] font-semibold leading-none",
                // Quando o botão está ativo ele já é bg-primary — inverte o
                // badge pra não sumir dentro do próprio botão.
                active
                  ? "bg-primary-foreground text-primary"
                  : "bg-primary text-primary-foreground",
              )}
            >
              {badge > 99 ? "99+" : badge}
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

/* ============================================================
   Toggles (mic/cam/share) — usam hooks oficiais do LiveKit
   ============================================================ */

/**
 * Botão circular que recebe buttonProps do useTrackToggle direto, preservando
 * todos os atributos internos (aria-pressed, data-lk-source, etc).
 * Crítico pra screen share: o click HANDLER do LiveKit precisa ser invocado
 * num "user gesture" sem wrappers async, senão getDisplayMedia rejeita.
 */
function TrackCircle({
  buttonProps,
  pending,
  label,
  active,
  danger,
  children,
}: {
  buttonProps: React.ButtonHTMLAttributes<HTMLButtonElement>;
  pending: boolean;
  label: string;
  active?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          {...buttonProps}
          disabled={pending || buttonProps.disabled}
          aria-label={label}
          className={cn(
            "h-11 w-11 rounded-full flex items-center justify-center transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            danger
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              : active
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted/40 hover:bg-muted/70 text-foreground",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

function MicToggle() {
  const { buttonProps, enabled, pending } = useTrackToggle({ source: Track.Source.Microphone });
  return (
    <TrackCircle
      buttonProps={buttonProps as React.ButtonHTMLAttributes<HTMLButtonElement>}
      pending={pending}
      label={enabled ? "Silenciar microfone" : "Ativar microfone"}
      danger={!enabled}
    >
      {enabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
    </TrackCircle>
  );
}

function CamToggle() {
  const { buttonProps, enabled, pending } = useTrackToggle({ source: Track.Source.Camera });
  return (
    <TrackCircle
      buttonProps={buttonProps as React.ButtonHTMLAttributes<HTMLButtonElement>}
      pending={pending}
      label={enabled ? "Desligar câmera" : "Ligar câmera"}
      danger={!enabled}
    >
      {enabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
    </TrackCircle>
  );
}

/**
 * iOS Safari não implementa getDisplayMedia — clicar só produziria um erro
 * silencioso. Mesmo teste usado em MeetingRecorder.tsx (áudio do sistema).
 */
const SCREEN_SHARE_UNSUPPORTED =
  "Compartilhar tela: seu navegador não permite (getDisplayMedia indisponível — comum no Safari do iPhone/iPad)";

function ScreenShareToggle() {
  const supported = typeof navigator?.mediaDevices?.getDisplayMedia === "function";
  // `captureOptions` NÃO é opcional na prática: sem ele o LiveKit chama
  // getDisplayMedia({ audio: false }) e o Chrome nem EXIBE a caixa
  // "Compartilhar áudio da guia" — a track ScreenShareAudio jamais é criada e
  // o vídeo compartilhado chega mudo para todo mundo.
  const { buttonProps, enabled, pending } = useTrackToggle({
    source: Track.Source.ScreenShare,
    captureOptions: {
      audio: true,
      // Permite escolher a própria guia (é onde o Chrome oferece áudio) e
      // deixa o áudio da guia continuar saindo nos alto-falantes locais.
      selfBrowserSurface: "include",
      systemAudio: "include",
      surfaceSwitching: "include",
      suppressLocalAudioPlayback: false,
    },
  });

  if (!supported) {
    return (
      <TrackCircle
        buttonProps={{ type: "button", disabled: true, title: SCREEN_SHARE_UNSUPPORTED }}
        pending={false}
        label={SCREEN_SHARE_UNSUPPORTED}
      >
        <ScreenShareOff className="w-5 h-5" />
      </TrackCircle>
    );
  }

  return (
    <TrackCircle
      buttonProps={buttonProps as React.ButtonHTMLAttributes<HTMLButtonElement>}
      pending={pending}
      label={enabled ? "Parar compartilhamento" : "Compartilhar tela"}
      active={enabled}
    >
      {enabled ? <ScreenShareOff className="w-5 h-5" /> : <ScreenShare className="w-5 h-5" />}
    </TrackCircle>
  );
}

function LeaveButton() {
  const { buttonProps } = useDisconnectButton({});
  const { onClick, disabled } = buttonProps;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label="Sair da reunião"
          className={cn(
            "h-11 px-5 rounded-full flex items-center justify-center gap-2",
            "bg-destructive text-destructive-foreground hover:bg-destructive/90",
            "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:opacity-50",
          )}
        >
          <PhoneOff className="w-5 h-5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">Sair da reunião</TooltipContent>
    </Tooltip>
  );
}
