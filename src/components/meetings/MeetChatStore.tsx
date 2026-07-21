/**
 * MeetChatStore — v8.10.4
 * Mantém o histórico do chat da reunião LiveKit montado durante toda a sessão,
 * mesmo quando o Sheet do chat é fechado.
 *
 * Por quê: useChat() do LiveKit guarda mensagens em estado local do componente
 * — ao desmontar (fechar Sheet) o histórico é perdido. Aqui, o provider chama
 * useChat() em um nível estável (filho do LiveKitRoom, sempre montado) e expõe
 * `chatMessages` + `send` via Context para o painel renderizado dentro do Sheet.
 */
import { createContext, useContext, type ReactNode } from "react";
import { useChat } from "@livekit/components-react";

type UseChatReturn = ReturnType<typeof useChat>;

interface MeetChatContextValue {
  chatMessages: UseChatReturn["chatMessages"];
  send: (message: string) => Promise<unknown>;
  isSending: boolean;
}

const MeetChatContext = createContext<MeetChatContextValue | null>(null);

export function MeetChatProvider({ children }: { children: ReactNode }) {
  const chat = useChat();
  return (
    <MeetChatContext.Provider
      value={{
        chatMessages: chat.chatMessages,
        send: chat.send ?? (async () => undefined),
        isSending: chat.isSending,
      }}
    >
      {children}
    </MeetChatContext.Provider>
  );
}

export function useMeetChatStore(): MeetChatContextValue {
  const ctx = useContext(MeetChatContext);
  if (!ctx) {
    throw new Error("useMeetChatStore deve ser usado dentro de MeetChatProvider");
  }
  return ctx;
}
