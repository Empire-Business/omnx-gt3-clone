import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// ── Tipos ─────────────────────────────────────────────────────
export type CamiAction =
  | { kind: "create_task"; payload: Record<string, any> }
  | { kind: "create_meeting"; payload: Record<string, any> }
  | { kind: "open"; payload: { label: string; path: string } };

export interface CamiMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: CamiAction[];
  pending?: boolean;
}

export interface CamiContext {
  type: "suggest_reply";
  message_text: string;
  author_name?: string;
}

export interface ExecuteResult {
  ok: boolean;
  error?: string;
  result?: any;
  navigate?: { label: string; path: string };
}

const uid = () => Math.random().toString(36).slice(2);

/**
 * Estado e comunicação com a Edge Function `cami`.
 * - send(): manda mensagem (modo chat), opcionalmente com contexto (sugerir resposta).
 * - executeAction(): executa uma ação proposta após o usuário confirmar.
 */
export function useCami() {
  const [messages, setMessages] = useState<CamiMessage[]>([]);
  const [sending, setSending] = useState(false);
  // Histórico cru (role/content) para mandar à function como contexto conversacional.
  const historyRef = useRef<{ role: "user" | "assistant"; content: string }[]>([]);

  const reset = useCallback(() => {
    setMessages([]);
    historyRef.current = [];
  }, []);

  const send = useCallback(async (text: string, opts?: { context?: CamiContext; channelId?: string | null }) => {
    const context = opts?.context;
    const channelId = opts?.channelId;
    const trimmed = text.trim();
    if (!trimmed && !context) return;
    setSending(true);

    const userMsg: CamiMessage = { id: uid(), role: "user", content: trimmed || "Me ajude a responder esta mensagem." };
    const typingId = uid();
    setMessages((prev) => [...prev, userMsg, { id: typingId, role: "assistant", content: "", pending: true }]);

    try {
      const { data, error } = await supabase.functions.invoke("cami", {
        body: {
          message: trimmed || "Me dê sugestões de resposta.",
          history: historyRef.current.slice(-12),
          context,
          channel_id: channelId || undefined,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const reply = (data as any)?.reply || "Pronto.";
      const actions = ((data as any)?.actions || []) as CamiAction[];

      historyRef.current.push({ role: "user", content: userMsg.content });
      historyRef.current.push({ role: "assistant", content: reply });

      setMessages((prev) =>
        prev.map((m) => (m.id === typingId ? { id: typingId, role: "assistant", content: reply, actions } : m)),
      );
    } catch (e: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === typingId
            ? { id: typingId, role: "assistant", content: `Tive um problema: ${e?.message || "erro desconhecido"}` }
            : m,
        ),
      );
    } finally {
      setSending(false);
    }
  }, []);

  const executeAction = useCallback(async (action: CamiAction): Promise<ExecuteResult> => {
    if (action.kind === "open") {
      return { ok: true, navigate: action.payload };
    }
    try {
      const { data, error } = await supabase.functions.invoke("cami", {
        body: { execute: { type: action.kind, args: action.payload } },
      });
      if (error) throw error;
      if ((data as any)?.error) return { ok: false, error: (data as any).error };
      return data as ExecuteResult;
    } catch (e: any) {
      return { ok: false, error: e?.message || "Falha ao executar" };
    }
  }, []);

  return { messages, sending, send, executeAction, reset };
}
