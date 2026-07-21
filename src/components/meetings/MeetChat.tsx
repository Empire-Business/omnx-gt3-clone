/**
 * MeetChat — v8.10.4
 * Chat custom em PT-BR para a reunião LiveKit.
 *
 * v8.10.4 — Histórico preservado ao fechar/reabrir o painel.
 *   useChat() vive em MeetChatProvider (montado sempre dentro do LiveKitRoom);
 *   este componente apenas consome o store via useMeetChatStore().
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocalParticipant } from "@livekit/components-react";
import { useMeetChatStore } from "./MeetChatStore";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

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

export function MeetChat() {
  const { send, chatMessages, isSending } = useMeetChatStore();
  const { localParticipant } = useLocalParticipant();
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const localIdentity = localParticipant?.identity;

  // Auto-scroll quando chega nova mensagem
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [chatMessages.length]);

  const handleSend = async () => {
    const value = text.trim();
    if (!value || isSending) return;
    try {
      await send(value);
      setText("");
    } catch (err) {
      console.error("[MeetChat] erro ao enviar:", err);
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
      chatMessages.map((m) => ({
        id: `${m.timestamp}-${m.from?.identity ?? "anon"}`,
        from: m.from?.name || m.from?.identity || "Participante",
        identity: m.from?.identity,
        message: m.message,
        timestamp: m.timestamp,
        isLocal: m.from?.identity === localIdentity,
      })),
    [chatMessages, localIdentity],
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <ScrollArea className="flex-1 min-h-0">
        <div ref={scrollRef} className="p-4 space-y-3">
          {items.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">
              Nenhuma mensagem ainda. Diga olá! 👋
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
      </ScrollArea>

      <div className="border-t border-border p-3 flex items-end gap-2 bg-card">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Escreva uma mensagem…"
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
