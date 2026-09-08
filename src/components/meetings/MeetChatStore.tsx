/**
 * MeetChatStore — v8.35.2
 * Mantém o histórico do chat da reunião LiveKit montado durante toda a sessão,
 * mesmo quando o Sheet do chat é fechado.
 *
 * Por quê: useChat() do LiveKit guarda mensagens em estado local do componente
 * — ao desmontar (fechar Sheet) o histórico é perdido. Aqui, o provider chama
 * useChat() em um nível estável (filho do LiveKitRoom, sempre montado) e expõe
 * `chatMessages` + `send` via Context para o painel renderizado dentro do Sheet.
 *
 * v8.35.2 — Contador de mensagens NÃO LIDAS.
 *   Como este provider é o único ponto sempre montado, é também o único lugar
 *   capaz de perceber mensagens que chegam com o painel FECHADO. Regras:
 *   - só conta mensagem de OUTRO participante (a sua nunca é "não lida");
 *   - só conta com o painel fechado — aberto, a mensagem já nasce lida;
 *   - abrir o painel zera o contador.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useChat, useLocalParticipant } from "@livekit/components-react";

type UseChatReturn = ReturnType<typeof useChat>;

interface MeetChatContextValue {
  chatMessages: UseChatReturn["chatMessages"];
  send: (message: string) => Promise<unknown>;
  isSending: boolean;
  /** Mensagens de outros participantes recebidas com o painel fechado. */
  unreadCount: number;
  /** Zera o contador (chamado ao abrir o painel). */
  markAsRead: () => void;
}

const MeetChatContext = createContext<MeetChatContextValue | null>(null);

export function MeetChatProvider({
  children,
  /** Painel de conversa aberto? Com ele aberto nada é contado como não lido. */
  isOpen = false,
}: {
  children: ReactNode;
  isOpen?: boolean;
}) {
  const chat = useChat();
  const { localParticipant } = useLocalParticipant();
  const localIdentity = localParticipant?.identity;

  const [unreadCount, setUnreadCount] = useState(0);
  /** Quantas mensagens já foram contabilizadas (lidas ou não). */
  const processedRef = useRef(0);
  const messagesRef = useRef(chat.chatMessages);
  messagesRef.current = chat.chatMessages;

  const markAsRead = useCallback(() => {
    processedRef.current = messagesRef.current.length;
    setUnreadCount(0);
  }, []);

  useEffect(() => {
    const messages = chat.chatMessages;

    // Painel aberto: tudo que existe (e tudo que chegar) já nasce lido.
    // Decisão consciente de simplicidade: não tentamos adivinhar se o usuário
    // rolou para cima — o MeetChat já avisa com o botão "Novas mensagens ↓".
    if (isOpen) {
      processedRef.current = messages.length;
      setUnreadCount(0);
      return;
    }

    // Reset defensivo: se a lista encolheu (remontagem/reconexão), recomeça.
    if (messages.length < processedRef.current) {
      processedRef.current = messages.length;
      setUnreadCount(0);
      return;
    }

    const novas = messages.slice(processedRef.current);
    processedRef.current = messages.length;
    if (novas.length === 0) return;

    // A própria mensagem do usuário nunca conta como não lida.
    const deOutros = novas.filter(
      (m) => !localIdentity || m.from?.identity !== localIdentity,
    ).length;
    if (deOutros > 0) setUnreadCount((c) => c + deOutros);
  }, [chat.chatMessages, isOpen, localIdentity]);

  /*
    VALUE MEMOIZADO — não é preciosismo.

    Este provider consome `useLocalParticipant()`, que re-renderiza a cada
    mute/unmute, câmera ligada/desligada e início/fim de screenshare do usuário
    local. Com o `value` montado como objeto literal no JSX, cada um desses
    eventos dava identidade nova ao contexto e re-renderizava TODOS os
    consumidores — inclusive a lista inteira de mensagens do chat, que não tem
    nada a ver com o microfone de ninguém.

    `chat.send` continua com o `throw` explícito: um fallback silencioso fingia
    sucesso e a mensagem sumia da caixa sem ninguém receber. Ele é reconstruído
    só quando `chat.send` de fato troca.
  */
  const send = useMemo<MeetChatContextValue["send"]>(
    () =>
      chat.send ??
      (async () => {
        throw new Error("Chat indisponível: a sala ainda não está conectada.");
      }),
    [chat.send],
  );

  const value = useMemo<MeetChatContextValue>(
    () => ({
      chatMessages: chat.chatMessages,
      send,
      isSending: chat.isSending,
      unreadCount,
      markAsRead,
    }),
    [chat.chatMessages, send, chat.isSending, unreadCount, markAsRead],
  );

  return (
    <MeetChatContext.Provider value={value}>
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
