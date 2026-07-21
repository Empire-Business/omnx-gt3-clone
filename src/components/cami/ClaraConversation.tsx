import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckSquare, Video, ExternalLink, Send, Loader2, Check, Calendar, Flag, User, Search, Clock, Sparkles, FileText, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CamiAvatar } from "@/components/shared/CamiAvatar";
import { useMarkdown } from "@/hooks/useMarkdown";
import { cn } from "@/lib/utils";
import { useCami, type CamiAction, type CamiContext, type CamiMessage } from "@/hooks/useCami";

/**
 * Superfície de conversa da Clara (assistente de IA), reutilizável em dois lugares:
 * - variant="panel": dentro da Sheet lateral (atalho rápido / sugerir resposta).
 * - variant="page":  como uma "conversa" fixa no painel central do chat.
 * Toda a lógica de mensagens/ações vive aqui; quem usa só escolhe o layout.
 */
export interface ClaraConversationProps {
  /** Canal atual — a Clara lê as mensagens recentes dele como contexto. */
  channelId?: string | null;
  /** Quando vem de uma mensagem, dispara o modo "sugerir resposta". */
  context?: CamiContext | null;
  /** "panel" (gaveta) ou "page" (painel central). */
  variant?: "panel" | "page";
  /** Dispara ANTES de navegar (ex.: fechar a gaveta). */
  onBeforeNavigate?: () => void;
  /** Reseta a conversa quando este valor muda para true (ex.: gaveta reabriu do zero). */
  resetSignal?: boolean;
}

const PRIORITY_LABEL: Record<string, string> = { low: "Baixa", medium: "Média", high: "Alta", urgent: "Urgente" };

type QuickAction = { label: string; icon: typeof CheckSquare; prompt: string };

// Ações principais — sempre disponíveis (barra fixa acima do compositor).
const CORE_ACTIONS: QuickAction[] = [
  { label: "Criar tarefa", icon: CheckSquare, prompt: "Quero criar uma tarefa. Me ajude a montar (título, responsável, prazo, prioridade) e proponha pra eu confirmar." },
  { label: "Agendar reunião", icon: Video, prompt: "Quero agendar uma reunião. Pergunte o que faltar (título, quando, participantes) e proponha pra eu confirmar." },
  { label: "Procurar", icon: Search, prompt: "Quero encontrar um processo, documento ou projeto. Vou te dizer o que estou procurando." },
  { label: "Por onde começar?", icon: Sparkles, prompt: "Olhando minhas tarefas em aberto, qual é a mais fácil/rápida de concluir e qual a melhor ordem para eu executá-las? Justifique rápido." },
  { label: "Tarefas atrasadas", icon: Clock, prompt: "Quais tarefas eu tenho atrasadas?" },
  { label: "Próximas reuniões", icon: Calendar, prompt: "Quais são minhas próximas reuniões?" },
];

// Ações que dependem do contexto da conversa do canal (só quando há channelId).
const CONTEXT_ACTIONS: QuickAction[] = [
  { label: "Resumir conversa", icon: FileText, prompt: "Resuma esta conversa em poucos tópicos curtos, destacando decisões e pendências." },
  { label: "Sugerir resposta", icon: MessageSquare, prompt: "Com base na conversa, sugira 2–3 respostas curtas e adequadas para a última mensagem." },
];

export function ClaraConversation({
  channelId,
  context,
  variant = "panel",
  onBeforeNavigate,
  resetSignal,
}: ClaraConversationProps) {
  const navigate = useNavigate();
  const { messages, sending, send, executeAction, reset } = useCami();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastContextRef = useRef<string | null>(null);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Contexto "sugerir resposta": ao receber um contexto novo, reseta e dispara.
  useEffect(() => {
    if (!context) return;
    const key = `${context.message_text}::${context.author_name || ""}`;
    if (key !== lastContextRef.current) {
      lastContextRef.current = key;
      reset();
      send("", { context, channelId });
    }
  }, [context, channelId, send, reset]);

  // Reset externo (gaveta reabriu sem contexto).
  useEffect(() => {
    if (resetSignal) {
      reset();
      setDraft("");
      lastContextRef.current = null;
    }
  }, [resetSignal, reset]);

  const goTo = (path: string) => {
    onBeforeNavigate?.();
    navigate(path);
  };

  const submit = () => {
    if (!draft.trim() || sending) return;
    send(draft, { channelId });
    setDraft("");
  };

  const isPage = variant === "page";
  // Ações rápidas: as principais sempre; as de contexto só quando há canal.
  const quickActions = channelId ? [...CORE_ACTIONS, ...CONTEXT_ACTIONS] : CORE_ACTIONS;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Mensagens */}
      <div
        ref={scrollRef}
        className={cn(
          "flex-1 overflow-y-auto space-y-4",
          isPage ? "px-4 md:px-6 py-5 max-w-3xl w-full mx-auto" : "px-4 py-4",
        )}
      >
        {messages.length === 0 && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
              <CamiAvatar className="w-4 h-4" />
            </div>
            <div className="rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2.5 text-sm text-foreground">
              Oi! 👋 Eu sou a Clara. Posso tirar dúvidas sobre a plataforma, achar processos/documentos/projetos,
              te ajudar a priorizar e executar suas tarefas, criar tarefas e agendar reuniões. Use os{" "}
              <strong className="font-semibold text-foreground">atalhos de Ações rápidas abaixo</strong> ou me escreva. Como posso ajudar?
            </div>
          </div>
        )}

        {messages.map((m) => (
          <MessageItem key={m.id} message={m} onExecute={executeAction} onNavigate={goTo} />
        ))}
      </div>

      {/* Ações rápidas (fixas) + Compositor */}
      <div className="border-t border-border">
        <div className={cn("px-3 pt-2.5", isPage && "max-w-3xl w-full mx-auto")}>
          <div className="flex items-center gap-1.5 mb-2 text-2xs font-medium text-muted-foreground uppercase tracking-wide">
            <Sparkles className="w-3 h-3 text-primary" />
            Ações rápidas
          </div>
          <div className="flex flex-wrap gap-1.5 pb-2">
            {quickActions.map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={() => send(a.prompt, { channelId })}
                disabled={sending}
                className={cn(
                  "group inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium",
                  "px-3 py-1.5 rounded-full border border-border/70 bg-card text-foreground shadow-sm",
                  "transition-all duration-150 hover:border-primary/40 hover:bg-primary/5 hover:text-primary hover:shadow",
                  "active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none",
                )}
              >
                <a.icon className="w-3.5 h-3.5 text-primary transition-transform duration-150 group-hover:scale-110" />
                {a.label}
              </button>
            ))}
          </div>
        </div>
        <div className={cn("flex items-end gap-2 p-3 pt-2", isPage && "max-w-3xl w-full mx-auto")}>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
            }}
            placeholder="Pergunte ou peça algo à Clara…"
            rows={1}
            className="min-h-[40px] max-h-32 resize-none text-sm"
          />
          <Button size="icon" className="h-10 w-10 flex-shrink-0 rounded-full" onClick={submit} disabled={!draft.trim() || sending}>
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Item de mensagem ──────────────────────────────────────────
function MessageItem({
  message,
  onExecute,
  onNavigate,
}: {
  message: CamiMessage;
  onExecute: (a: CamiAction) => Promise<{ ok: boolean; error?: string; navigate?: { label: string; path: string } }>;
  onNavigate: (path: string) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-3.5 py-2.5 text-sm max-w-[85%] whitespace-pre-wrap break-words">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2.5">
      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
        <CamiAvatar className="w-4 h-4" />
      </div>
      <div className="space-y-2 max-w-[85%]">
        <div className="rounded-2xl rounded-tl-sm bg-muted px-3.5 py-2.5 text-sm text-foreground break-words overflow-hidden">
          {message.pending ? <TypingDots /> : <ClaraMarkdown content={message.content} />}
        </div>
        {message.actions?.map((a, i) => (
          <ActionCard key={i} action={a} onExecute={onExecute} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
}

// Renderiza markdown (negrito, listas, código) nas respostas da Clara, compacto.
function ClaraMarkdown({ content }: { content: string }) {
  const { Component } = useMarkdown(content, { enableGFM: true, enableTOC: false });
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed prose-p:my-1.5 prose-headings:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-pre:my-2 prose-pre:bg-background prose-code:text-foreground prose-a:text-primary">
      <Component />
    </div>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1 py-1">
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:-0.3s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:-0.15s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" />
    </span>
  );
}

// ── Cartão de ação (propor e confirmar) ───────────────────────
function ActionCard({
  action,
  onExecute,
  onNavigate,
}: {
  action: CamiAction;
  onExecute: (a: CamiAction) => Promise<{ ok: boolean; error?: string; navigate?: { label: string; path: string } }>;
  onNavigate: (path: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [navTo, setNavTo] = useState<{ label: string; path: string } | null>(null);

  // Botão de navegação direta
  if (action.kind === "open") {
    return (
      <button
        onClick={() => onNavigate(action.payload.path)}
        className="flex items-center gap-2 w-full text-left rounded-xl border border-border bg-card px-3 py-2.5 hover:bg-muted transition-colors"
      >
        <ExternalLink className="w-4 h-4 text-primary flex-shrink-0" />
        <span className="text-sm font-medium text-foreground truncate">{action.payload.label}</span>
      </button>
    );
  }

  const isTask = action.kind === "create_task";
  const p = action.payload;
  const Icon = isTask ? CheckSquare : Video;
  const cta = isTask ? "Criar tarefa" : (p.scheduled_at ? "Agendar reunião" : "Iniciar reunião");

  const run = async () => {
    setBusy(true);
    setErr(null);
    const r = await onExecute(action);
    setBusy(false);
    if (r.ok) {
      setDone(true);
      if (r.navigate) setNavTo(r.navigate);
    } else {
      setErr(r.error || "Falha ao executar");
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
          <Icon className="w-4 h-4" />
        </div>
        <p className="text-sm font-semibold text-foreground truncate">{p.title || (isTask ? "Nova tarefa" : "Nova reunião")}</p>
      </div>

      {(p.description || p.assignee_name || p.due_date || p.priority || p.scheduled_at || (p.attendee_names?.length)) && (
        <div className="flex flex-wrap gap-1.5">
          {p.assignee_name && <Chip icon={User}>{p.assignee_name}</Chip>}
          {p.due_date && <Chip icon={Calendar}>{p.due_date}</Chip>}
          {p.priority && <Chip icon={Flag}>{PRIORITY_LABEL[p.priority] || p.priority}</Chip>}
          {p.scheduled_at && <Chip icon={Calendar}>{formatWhen(p.scheduled_at)}</Chip>}
          {!isTask && !p.scheduled_at && <Chip icon={Calendar}>Agora</Chip>}
          {Array.isArray(p.attendee_names) && p.attendee_names.map((n: string) => <Chip key={n} icon={User}>{n}</Chip>)}
        </div>
      )}
      {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}

      {err && <p className="text-xs text-destructive">{err}</p>}

      {done ? (
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-medium text-success">
            <Check className="w-3.5 h-3.5" /> {isTask ? "Tarefa criada" : "Reunião criada"}
          </span>
          {navTo && (
            <Button size="sm" variant="outline" className="h-7 text-xs ml-auto" onClick={() => onNavigate(navTo.path)}>
              {navTo.label}
            </Button>
          )}
        </div>
      ) : (
        <Button size="sm" className="h-8 text-xs w-full" onClick={run} disabled={busy}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : cta}
        </Button>
      )}
    </div>
  );
}

function Chip({ icon: Icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-2xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
      <Icon className="w-3 h-3" /> {children}
    </span>
  );
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}
