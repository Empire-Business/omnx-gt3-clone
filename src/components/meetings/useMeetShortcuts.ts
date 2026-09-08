/**
 * useMeetShortcuts — v8.36.0
 * Atalhos de teclado da sala de reunião:
 *   M → alterna o microfone
 *   V → alterna a câmera
 *
 * IMPORTANTE — guard de foco:
 * O listener vive em `window`, então ele recebe QUALQUER tecla digitada na
 * página, inclusive as digitadas dentro do chat da reunião. Sem o guard,
 * escrever "movimento" no campo de mensagem mutaria o microfone (o "m") e
 * desligaria a câmera (o "v") no meio da fala do usuário. Por isso ignoramos
 * o evento quando o alvo é input/textarea/select ou qualquer elemento
 * contentEditable. Também ignoramos combinações com Ctrl/Meta/Alt, que
 * pertencem a atalhos do navegador/SO (ex.: Ctrl+M, Cmd+V) e nunca devem ser
 * sequestradas por nós.
 */
import { useEffect } from "react";
import { useLocalParticipant } from "@livekit/components-react";
import { toast } from "sonner";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select";
}

export function useMeetShortcuts(): void {
  const { localParticipant } = useLocalParticipant();

  useEffect(() => {
    if (!localParticipant) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.repeat) return;
      if (isTypingTarget(event.target)) return;

      const key = event.key.toLowerCase();
      if (key !== "m" && key !== "v") return;

      event.preventDefault();

      void (async () => {
        try {
          if (key === "m") {
            const next = !localParticipant.isMicrophoneEnabled;
            await localParticipant.setMicrophoneEnabled(next);
            toast.success(next ? "Microfone ligado" : "Microfone desligado");
          } else {
            const next = !localParticipant.isCameraEnabled;
            await localParticipant.setCameraEnabled(next);
            toast.success(next ? "Câmera ligada" : "Câmera desligada");
          }
        } catch (err) {
          console.error("[useMeetShortcuts] falha ao alternar dispositivo:", err);
          toast.error(
            key === "m"
              ? "Não foi possível alternar o microfone."
              : "Não foi possível alternar a câmera.",
          );
        }
      })();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [localParticipant]);
}
