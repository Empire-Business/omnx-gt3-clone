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
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

export function MeetControlBar({
  isHost,
  roomName,
  showChat,
  onToggleChat,
  onEndForAll,
  endingForAll,
  isFullscreen,
  onToggleFullscreen,
}: MeetControlBarProps) {
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);

  return (
    <TooltipProvider delayDuration={300}>
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
          {/* Screen share esconde em mobile (raramente usado em telefone) */}
          <span className="hidden sm:inline-flex"><ScreenShareToggle /></span>

          <div className="mx-1 h-8 w-px bg-border/60 hidden sm:block" aria-hidden />

          <CircleAction
            label={showChat ? "Fechar conversa" : "Abrir conversa"}
            onClick={onToggleChat}
            active={showChat}
          >
            <MessageSquare className="w-5 h-5" />
          </CircleAction>

          {/* Controles secundários — escalonados por breakpoint pra evitar
              overflow da barra. Volume entra cedo (sm+) porque é ajuste comum
              mid-call. Background/Devices ficam pra lg+ (config raro). */}
          <span className="hidden sm:inline-flex"><RemoteVolumeControl /></span>
          <span className="hidden md:inline-flex"><AudioNoiseFilterControl /></span>
          <span className="hidden lg:inline-flex"><VirtualBackgroundControl /></span>
          <span className="hidden lg:inline-flex"><DeviceSelector /></span>

          <span className="hidden md:inline-flex">
            <CircleAction
              label={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
              onClick={onToggleFullscreen}
            >
              {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
            </CircleAction>
          </span>

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
              <DropdownMenuLabel>Atalhos</DropdownMenuLabel>
              <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                M — silenciar microfone
              </DropdownMenuItem>
              <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                V — desligar câmera
              </DropdownMenuItem>
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
}

function CircleAction({ label, onClick, active, danger, disabled, children, className }: CircleProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
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
            className,
          )}
        >
          {children}
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

function ScreenShareToggle() {
  const { buttonProps, enabled, pending } = useTrackToggle({ source: Track.Source.ScreenShare });
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
