/**
 * EventAnnounceDialog — escolha de onde o evento vai ser divulgado.
 *
 * Usado tanto por "Publicar" (rascunho → publicado) quanto por "Divulgar de
 * novo" (evento já publicado). O Feed e a notificação/push são sempre
 * enviados; o que muda aqui são os CANAIS DE CHAT adicionais.
 *
 * O canal geral (e os canais das áreas alvo) já recebem a mensagem pelo
 * espelhamento automático do Feed — por isso aparecem marcados e travados, com
 * a explicação: marcar de novo geraria mensagem duplicada.
 */
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Hash, Loader2, Megaphone, Send } from "lucide-react";
import { useChatChannels } from "@/hooks/useChat";
import type { InternalEvent } from "./events-api";

interface EventAnnounceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: InternalEvent;
  /** `publish` publica e divulga; `reannounce` só divulga de novo. */
  mode: "publish" | "reannounce";
  isPending: boolean;
  onConfirm: (channelIds: string[]) => void;
}

export function EventAnnounceDialog({
  open,
  onOpenChange,
  event,
  mode,
  isPending,
  onConfirm,
}: EventAnnounceDialogProps) {
  const { data: channels = [] } = useChatChannels();
  const [selected, setSelected] = useState<string[]>([]);

  /** Áreas que o evento alcança — os canais delas já vêm pelo Feed. */
  const targetAreaIds = useMemo(
    () =>
      (event.targets ?? [])
        .map((t) => t.area_id)
        .filter((id): id is string => !!id),
    [event.targets]
  );

  const groupChannels = useMemo(
    () => channels.filter((c) => !c.is_dm),
    [channels]
  );

  /** Canal que recebe a mensagem sozinho, pelo trigger do Feed. */
  const isMirrored = (channel: (typeof groupChannels)[number]): boolean => {
    // Visibilidade `all` (evento da empresa toda) → canal geral.
    if (event.scope === "company") return !!channel.is_general;
    // Visibilidade `specific` por área → canal daquela área.
    if (event.scope === "areas") {
      const areaId = (channel as { area_id?: string | null }).area_id ?? null;
      return !!areaId && targetAreaIds.includes(areaId);
    }
    return false;
  };

  // Reabrir o diálogo não deve carregar a seleção da vez anterior.
  useEffect(() => {
    if (open) setSelected([]);
  }, [open]);

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );

  const title = mode === "publish" ? "Publicar e divulgar o evento" : "Divulgar de novo";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {mode === "publish"
              ? "O evento fica visível para o público escolhido e o aviso vai para o Feed, para o canal geral e por notificação. Marque outros canais que também devem receber."
              : "O aviso vai de novo para o Feed, para o canal geral e por notificação. Marque outros canais que também devem receber."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 max-h-[45vh] overflow-y-auto pr-1">
          {groupChannels.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Você não participa de nenhum canal de equipe — o aviso vai só pelo Feed e por
              notificação.
            </p>
          )}

          {groupChannels.map((channel) => {
            const mirrored = isMirrored(channel);
            const id = `announce-channel-${channel.id}`;
            return (
              <div
                key={channel.id}
                className="flex items-start gap-2 rounded-md border border-border px-3 py-2"
              >
                <Checkbox
                  id={id}
                  checked={mirrored || selected.includes(channel.id)}
                  disabled={mirrored || isPending}
                  onCheckedChange={() => toggle(channel.id)}
                  className="mt-0.5"
                />
                <div className="min-w-0">
                  <Label
                    htmlFor={id}
                    className="flex items-center gap-1.5 text-sm font-medium text-foreground cursor-pointer"
                  >
                    <Hash className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
                    {channel.display_name || channel.name}
                  </Label>
                  {mirrored && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Já recebe o aviso pelo Feed — marcar de novo duplicaria a mensagem.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Voltar
          </Button>
          <Button onClick={() => onConfirm(selected)} disabled={isPending} className="gap-1.5">
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            ) : mode === "publish" ? (
              <Send className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Megaphone className="w-4 h-4" aria-hidden="true" />
            )}
            {mode === "publish" ? "Publicar e divulgar" : "Divulgar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
