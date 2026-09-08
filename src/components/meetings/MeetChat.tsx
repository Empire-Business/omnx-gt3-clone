/**
 * MeetChat — v8.35.1
 * Chat custom em PT-BR para a reunião LiveKit.
 *
 * v8.10.4 — Histórico preservado ao fechar/reabrir o painel.
 *   useChat() vive em MeetChatProvider (montado sempre dentro do LiveKitRoom);
 *   este componente apenas consome o store via useMeetChatStore().
 *
 * v8.35.1 — Correções de usabilidade/confiabilidade:
 *   - Falha de envio deixou de ser silenciosa: toast de erro + texto preservado
 *     na caixa para reenviar (antes só um console.error, a mensagem sumia).
 *   - Auto-scroll consertado: o ref estava no <div> de conteúdo, não no
 *     viewport do ScrollArea (Radix) — `scrollTop` não tinha efeito nenhum.
 *     Agora o container rolável é nativo e a rolagem funciona.
 *   - Auto-scroll respeita quem subiu para ler: só desce se já estava no fim
 *     (ou se a mensagem é sua); caso contrário mostra "Novas mensagens ↓".
 *   - Foco no campo ao abrir (apenas em ponteiro fino — no celular abrir o
 *     teclado sozinho atrapalha).
 *   - Nome do remetente nunca mostra identity crua (`guest-ab12…`).
 *   - Aviso honesto de que o histórico não é persistido.
 *   - a11y: role="log" + aria-live, labels.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalParticipant } from "@livekit/components-react";
import { useMeetChatStore } from "./MeetChatStore";
import { Send, Loader2, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** Distância do fim (px) ainda considerada "no fim" para o auto-scroll. */
const BOTTOM_THRESHOLD = 48;

function formatTime(ts: number) {
  try {
    return new Date(ts).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

/**
 * Identities do LiveKit são técnicas (`guest-ab12cd`, uuid do usuário).
 * Se o token não trouxe `name`, é melhor um rótulo humano genérico do que
 * despejar o id cru na tela.
 */
function isMachineIdentity(identity?: string) {
  if (!identity) return true;
  return (
    /^guest-/i.test(identity) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identity)
  );
}

function displayName(name?: string, identity?: string) {
  const clean = name?.trim();
  if (clean) return clean;
  if (identity && !isMachineIdentity(identity)) return identity;
  if (identity && /^guest-/i.test(identity)) return "Convidado";
  return "Participante";
}

export function MeetChat() {
  const { send, chatMessages, isSending, markAsRead } = useMeetChatStore();
  const { localParticipant } = useLocalParticipant();
  const [text, setText] = useState("");
  const [hasNewBelow, setHasNewBelow] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const atBottomRef = useRef(true);
  const lastCountRef = useRef(chatMessages.length);
  const localIdentity = localParticipant?.identity;

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    atBottomRef.current = true;
    setHasNewBelow(false);
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottomRef.current = distance <= BOTTOM_THRESHOLD;
    if (atBottomRef.current) setHasNewBelow(false);
  }, []);

  // Painel visível = conversa lida. O provider já zera pelo `isOpen`; aqui é
  // a garantia de que o badge some assim que o painel realmente aparece.
  useEffect(() => {
    markAsRead();
  }, [markAsRead, chatMessages.length]);

  // Ao abrir o painel: já começa no fim e com foco no campo.
  // Foco automático só em ponteiro fino — no celular abriria o teclado
  // virtual por cima da conversa sem o usuário pedir.
  useEffect(() => {
    scrollToBottom("auto");
    if (typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches) {
      inputRef.current?.focus();
    }
  }, [scrollToBottom]);

  // Auto-scroll só quando o usuário está acompanhando o fim da conversa
  // (ou quando a mensagem nova é dele). Se ele subiu para ler algo antigo,
  // avisamos com o botão "Novas mensagens" em vez de arrancar a tela.
  useEffect(() => {
    if (chatMessages.length === lastCountRef.current) return;
    const grew = chatMessages.length > lastCountRef.current;
    lastCountRef.current = chatMessages.length;
    if (!grew) return;

    const last = chatMessages[chatMessages.length - 1];
    const isMine = !!localIdentity && last?.from?.identity === localIdentity;

    if (atBottomRef.current || isMine) {
      requestAnimationFrame(() => scrollToBottom("smooth"));
    } else {
      setHasNewBelow(true);
    }
  }, [chatMessages, localIdentity, scrollToBottom]);

  const handleSend = async () => {
    const value = text.trim();
    if (!value || isSending) return;
    try {
      await send(value);
      setText("");
      scrollToBottom("smooth");
    } catch (err) {
      console.error("[MeetChat] erro ao enviar:", err);
      // O texto NÃO é limpo: o usuário reenvia sem redigitar.
      toast.error("Não foi possível enviar a mensagem.", {
        description: "Verifique sua conexão e tente novamente.",
      });
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const items = useMemo(
    () =>
      chatMessages.map((m, i) => ({
        id: m.id ?? `${m.timestamp}-${m.from?.identity ?? "anon"}-${i}`,
        from: displayName(m.from?.name, m.from?.identity),
        message: m.message,
        timestamp: m.timestamp,
        isLocal: !!localIdentity && m.from?.identity === localIdentity,
      })),
    [chatMessages, localIdentity],
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="relative flex-1 min-h-0">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-label="Mensagens da conversa"
          className="h-full overflow-y-auto overscroll-contain p-4 space-y-3"
        >
          {items.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8 space-y-2">
              <p>Nenhuma mensagem ainda. Diga olá! 👋</p>
              <p className="text-xs">
                A conversa vale só durante a reunião: nada fica salvo e mensagens
                enviadas antes de você entrar não aparecem aqui.
              </p>
            </div>
          ) : (
            items.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "flex flex-col gap-1 max-w-[85%]",
                  m.isLocal ? "ml-auto items-end" : "items-start",
                )}
              >
                <div className="flex items-baseline gap-2 text-xs text-muted-foreground px-1">
                  <span className="font-medium text-foreground/80">
                    {m.isLocal ? "Você" : m.from}
                  </span>
                  <span>{formatTime(m.timestamp)}</span>
                </div>
                <div
                  className={cn(
                    "rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap break-words",
                    m.isLocal
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm",
                  )}
                >
                  {m.message}
                </div>
              </div>
            ))
          )}
        </div>

        {hasNewBelow && (
          <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="pointer-events-auto shadow-md gap-1.5"
              onClick={() => scrollToBottom("smooth")}
            >
              <ArrowDown className="w-3.5 h-3.5" />
              Novas mensagens
            </Button>
          </div>
        )}
      </div>

      <div className="border-t border-border p-3 flex items-end gap-2 bg-card">
        <Textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
          // No celular o teclado virtual encolhe a viewport e cobre o campo;
          // rolar para o fim depois que ele abre mantém a conversa visível.
          onFocus={() => window.setTimeout(() => scrollToBottom("auto"), 300)}
          placeholder="Escreva uma mensagem…"
          aria-label="Escreva uma mensagem"
          rows={1}
          className="resize-none min-h-[40px] max-h-32"
        />
        <Button
          type="button"
          size="icon"
          onClick={handleSend}
          disabled={!text.trim() || isSending}
          aria-label="Enviar mensagem"
        >
          {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
    </div>
  );
}
