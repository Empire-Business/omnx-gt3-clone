import { useState } from "react";
import {
  Bell,
  BellOff,
  Volume2,
  Smartphone,
  CheckSquare,
  MessageSquare,
  Megaphone,
  Play,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import {
  useNotificationMutes,
  formatMuteDuration,
  type NotifMuteKind,
} from "@/hooks/useNotifications";
import {
  isNotificationSoundEnabled,
  setNotificationSoundEnabled,
  playNotificationSound,
} from "@/lib/notification-sound";

/**
 * Central de Notificações — aba "Notificações" em /configuracoes.
 *
 * Acessível a TODOS os usuários (não é área de admin) e com o mesmo conteúdo no
 * mobile e no desktop. Antes os controles estavam divididos por breakpoint
 * (`md:hidden` / `hidden md:block`): no celular não dava para mexer no som e no
 * desktop não dava para ativar o push — cada um só via metade das opções.
 *
 * Três blocos:
 *  1. Push neste aparelho (por dispositivo)
 *  2. Som do alerta (por dispositivo) + teste
 *  3. Silenciar por tipo, com duração (sincronizado na conta, via notification_mutes)
 */

/** Durações oferecidas ao silenciar. `null` = até o usuário reativar. */
const MUTE_DURATIONS: { value: string; label: string; hours: number | null }[] = [
  { value: "1", label: "Por 1 hora", hours: 1 },
  { value: "8", label: "Por 8 horas", hours: 8 },
  { value: "24", label: "Por 24 horas", hours: 24 },
  { value: "168", label: "Por 7 dias", hours: 24 * 7 },
  { value: "forever", label: "Até eu reativar", hours: null },
];

const MUTE_ROWS: {
  kind: Exclude<NotifMuteKind, "all">;
  icon: typeof CheckSquare;
  label: string;
  hint: string;
}[] = [
  { kind: "task", icon: CheckSquare, label: "Tarefas", hint: "Novas atribuições e prazos" },
  { kind: "chat", icon: MessageSquare, label: "Mensagens", hint: "Chat, DMs e reações" },
  { kind: "feed", icon: Megaphone, label: "Feed", hint: "Novas publicações e comunicados" },
];

export function NotificationPreferences() {
  const {
    supported,
    needsIOSInstall,
    unsupportedReason,
    permission,
    isSubscribed,
    isBusy,
    enable,
    disable,
  } = usePushNotifications();
  const { isMuted, mutedUntil, setMute, clearMute } = useNotificationMutes();

  const [soundOn, setSoundOn] = useState(() => isNotificationSoundEnabled());
  const [duration, setDuration] = useState<string>("forever");

  const pushOn = permission === "granted" && isSubscribed;
  const muteBusy = setMute.isPending || clearMute.isPending;
  const allMuted = isMuted("all");
  const selectedHours = MUTE_DURATIONS.find((d) => d.value === duration)?.hours ?? null;

  const togglePush = async (on: boolean) => {
    if (on) {
      const ok = await enable();
      if (ok) toast.success("Notificações ativadas neste aparelho!");
    } else {
      const ok = await disable();
      if (ok) toast.success("Notificações desativadas neste aparelho.");
    }
  };

  const toggleSound = (on: boolean) => {
    setNotificationSoundEnabled(on);
    setSoundOn(on);
    if (on) {
      // Toca junto: além de confirmar, o clique é o gesto que destrava o
      // AudioContext do navegador.
      void playNotificationSound("chat", { force: true });
      toast.success("Som de notificação ativado.");
    } else {
      toast.success("Som de notificação desativado.");
    }
  };

  const toggleMute = (kind: NotifMuteKind, muted: boolean) => {
    if (muted) setMute.mutate({ kind, durationHours: selectedHours });
    else clearMute.mutate(kind);
  };

  /** "Silenciado até 12/08 14:30" ou "até você reativar". */
  const untilLabel = (kind: NotifMuteKind) => {
    if (!isMuted(kind)) return null;
    const until = mutedUntil(kind);
    if (!until) return "até você reativar";
    return `até ${new Date(until).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  };

  return (
    <div className="space-y-4">
      {/* ── 1. Push neste aparelho ────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-primary" /> Notificações neste aparelho
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <Label className="text-sm font-medium">Notificações push</Label>
              <p className="text-xs text-muted-foreground">
                Avisos de mensagens, tarefas e feed mesmo com o app fechado.
              </p>
            </div>
            <Switch
              checked={pushOn}
              disabled={!supported || isBusy}
              onCheckedChange={togglePush}
              aria-label="Notificações push neste aparelho"
            />
          </div>

          {!supported && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <p className="text-xs text-muted-foreground">
                {needsIOSInstall ? (
                  <>
                    <span className="font-medium text-foreground">
                      No iPhone é preciso instalar o app.
                    </span>{" "}
                    Toque em Compartilhar (⬆️) → &quot;Adicionar à Tela de Início&quot;, abra o GT3
                    por lá e ative aqui de novo.
                  </>
                ) : (
                  unsupportedReason
                )}
              </p>
            </div>
          )}

          {supported && permission === "denied" && (
            <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Permissão bloqueada.</span> Reative as
                notificações nas configurações do navegador (ou do celular) e volte aqui.
              </p>
            </div>
          )}

          <p className="text-2xs text-muted-foreground">
            Esta opção vale só para este aparelho. Ative em cada celular ou computador que você usar.
          </p>
        </CardContent>
      </Card>

      {/* ── 2. Som ────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-primary" /> Som do alerta
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <Label className="text-sm font-medium">Tocar som</Label>
              <p className="text-xs text-muted-foreground">
                Um toque curto ao chegar mensagem ou tarefa com o app aberto.
              </p>
            </div>
            <Switch
              checked={soundOn}
              onCheckedChange={toggleSound}
              aria-label="Som de notificação"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => void playNotificationSound("chat", { force: true })}
          >
            <Play className="h-3.5 w-3.5" /> Testar som
          </Button>
          <p className="text-2xs text-muted-foreground">
            Não ouviu nada? Confira o volume e, no iPhone, a chavinha lateral de silencioso.
          </p>
        </CardContent>
      </Card>

      {/* ── 3. Silenciar por tipo ─────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BellOff className="w-4 h-4 text-primary" /> Silenciar notificações
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Por quanto tempo (vale para o que você silenciar abaixo)
            </Label>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MUTE_DURATIONS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Silenciar tudo — atalho principal */}
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 p-3">
            <div className="min-w-0">
              <Label className="flex items-center gap-1.5 text-sm font-medium">
                <Bell className="h-3.5 w-3.5" /> Silenciar tudo
              </Label>
              <p className="text-xs text-muted-foreground">
                {allMuted
                  ? `Tudo silenciado ${untilLabel("all")}.`
                  : "Desliga todos os alertas de uma vez."}
              </p>
            </div>
            <Switch
              checked={allMuted}
              disabled={muteBusy}
              onCheckedChange={(on) => toggleMute("all", on)}
              aria-label="Silenciar todas as notificações"
            />
          </div>

          {/* Por tipo */}
          <div className="divide-y divide-border rounded-lg border border-border">
            {MUTE_ROWS.map(({ kind, icon: Icon, label, hint }) => {
              const muted = isMuted(kind);
              return (
                <div key={kind} className="flex items-center justify-between gap-4 p-3">
                  <div className="min-w-0">
                    <Label className="flex items-center gap-1.5 text-sm font-medium">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" /> {label}
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {muted ? `Silenciado ${untilLabel(kind)}.` : hint}
                    </p>
                  </div>
                  <Switch
                    checked={muted}
                    // Com "tudo" silenciado, os tipos ficam travados em ON —
                    // desligar um deles isoladamente não faria efeito algum.
                    disabled={muteBusy || allMuted}
                    onCheckedChange={(on) => toggleMute(kind, on)}
                    aria-label={`Silenciar notificações de ${label.toLowerCase()}`}
                  />
                </div>
              );
            })}
          </div>

          <p className="text-2xs text-muted-foreground">
            Silenciar vale para a sua conta em todos os aparelhos e some com o alerta ativo (toast,
            som e push). O histórico continua no sino.
            {selectedHours ? ` Duração escolhida: ${formatMuteDuration(selectedHours)}.` : ""}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
