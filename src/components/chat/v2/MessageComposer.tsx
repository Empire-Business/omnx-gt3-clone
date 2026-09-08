import { useState, useRef, useCallback, useEffect, type DragEvent, type KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Paperclip, Send, Smile, Mic, Image as ImageIcon, X, Loader2, Clock, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useSendChatMessage, uploadChatAttachment, useChatParticipantsLive, type ChatAttachment } from "@/hooks/useChat";
import { useAuth } from "@/hooks/useAuth";
import { useChatOverview } from "@/hooks/useChatOverview";
import { useEmployees } from "@/hooks/useEmployees";
import {
  useCreateMentions, extractMentionTokens, normalizeHandle,
} from "@/hooks/useChatMentions";
import { MentionAutocomplete } from "@/components/chat/MentionAutocomplete";
import { ChatEmojiPicker } from "@/components/chat/ChatEmojiPicker";
import { useChatTyping } from "@/hooks/useChatTyping";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { useChatScheduled } from "@/hooks/useChatScheduled";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

interface Props {
  conversationId: string;
  myEmpId: string | null;
}

// Rascunhos por conversa — persistem em memória enquanto a página do chat
// estiver aberta. Evita vazamento de texto entre conversas e preserva o
// que o usuário estava digitando ao alternar de aba.
const draftsStore = new Map<string, { text: string; attachments: ChatAttachment[] }>();

export function MessageComposer({ conversationId, myEmpId }: Props) {
  const { profile } = useAuth();
  const tenantId = profile?.tenant_id;
  // Hidrata estado a partir do rascunho da conversa atual (se existir)
  const initialDraft = conversationId ? draftsStore.get(conversationId) : undefined;
  const [text, setText] = useState(initialDraft?.text ?? "");
  const [attachments, setAttachments] = useState<ChatAttachment[]>(initialDraft?.attachments ?? []);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Quando o conversationId muda, troca o rascunho exibido pelo da nova conversa.
  // Guarda o anterior antes de trocar.
  const lastIdRef = useRef<string | null>(conversationId);
  useEffect(() => {
    const prev = lastIdRef.current;
    if (prev && prev !== conversationId) {
      // salva o que estava digitado no anterior
      if (text.trim() || attachments.length > 0) {
        draftsStore.set(prev, { text, attachments });
      } else {
        draftsStore.delete(prev);
      }
      // restaura o da nova conversa
      const next = draftsStore.get(conversationId) ?? { text: "", attachments: [] };
      setText(next.text);
      setAttachments(next.attachments);
    }
    lastIdRef.current = conversationId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  // Persiste rascunho da conversa atual a cada mudança
  useEffect(() => {
    if (!conversationId) return;
    if (text.trim() || attachments.length > 0) {
      draftsStore.set(conversationId, { text, attachments });
    } else {
      draftsStore.delete(conversationId);
    }
  }, [conversationId, text, attachments]);

  const send = useSendChatMessage();
  const createMentions = useCreateMentions();

  // Dados auxiliares para menções (@user, @here, @channel)
  const { data: employees = [] } = useEmployees();
  const { data: participants = [] } = useChatParticipantsLive(conversationId);
  const { data: overview = [] } = useChatOverview();
  const conv = overview.find((c) => c.id === conversationId);
  const allowChannelTags = conv?.type !== "direct";

  // Typing broadcast — meu nome e id pra enviar evento
  const myEmp = (employees as any[]).find((e: any) => e.id === myEmpId);
  const { sendTyping } = useChatTyping(conversationId, myEmpId, myEmp?.full_name ?? null);

  // Mensagens agendadas
  const scheduled = useChatScheduled(conversationId);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState(""); // ISO local "YYYY-MM-DDTHH:mm"

  const handleSchedule = () => {
    const content = text.trim();
    if (!content && attachments.length === 0) {
      toast.error("Escreva algo ou anexe um arquivo antes de agendar");
      return;
    }
    if (!scheduleAt) {
      toast.error("Escolha data e hora");
      return;
    }
    const when = new Date(scheduleAt);
    if (when.getTime() <= Date.now() + 30_000) {
      toast.error("Escolha um horário pelo menos 1 minuto no futuro");
      return;
    }
    scheduled.schedule({
      conversation_id: conversationId,
      content,
      attachments,
      scheduled_for: when.toISOString(),
    });
    setText("");
    setAttachments([]);
    if (conversationId) draftsStore.delete(conversationId);
    setScheduleOpen(false);
    setScheduleAt("");
    toast.success(`Agendada para ${format(when, "dd MMM, HH:mm", { locale: ptBR })}`);
  };

  const cancelScheduled = (id: string) => {
    scheduled.cancel(id);
    toast.success("Agendamento cancelado");
  };

  // Voice recording
  const recorder = useVoiceRecorder();
  const handleStartVoice = async () => {
    try { await recorder.start(); }
    catch (e: any) { toast.error(e?.message ?? "Falha ao acessar microfone"); }
  };
  const handleStopVoice = async () => {
    const file = await recorder.stop();
    if (!file) return;
    setUploading(true);
    try {
      const att = await uploadChatAttachment(file);
      // Áudio é enviado direto, sem texto — UX igual WhatsApp
      await send.mutateAsync({
        conversation_id: conversationId,
        attachments: [att],
        type: "audio",
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao enviar áudio");
    } finally {
      setUploading(false);
    }
  };
  const handleCancelVoice = () => recorder.cancel();
  const fmtElapsed = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const handleEmojiSelect = (emoji: string) => {
    const ta = textRef.current;
    if (!ta) {
      setText((t) => t + emoji);
      return;
    }
    const start = ta.selectionStart ?? text.length;
    const end = ta.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + emoji.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  const handleSend = async () => {
    const content = text.trim();
    if (!content && attachments.length === 0) return;
    if (!myEmpId) {
      toast.error("Carregando colaborador…");
      return;
    }
    try {
      const result: any = await send.mutateAsync({
        conversation_id: conversationId,
        content: content || undefined,
        attachments,
        type: attachments[0]?.type ?? "text",
      });

      // Persiste menções vinculadas à mensagem (se houver)
      const messageId = result?.id ?? result?.data?.id ?? null;
      if (content && messageId) {
        const handleToId = new Map<string, string>();
        for (const e of employees) {
          const h = normalizeHandle(e.full_name);
          if (h) handleToId.set(h, e.id);
        }
        const tokens = extractMentionTokens(content, (h) => handleToId.get(h) ?? null);
        if (tokens.length > 0) {
          const participantIds = (participants as any[]).map((p) => p.employee_id);
          createMentions.mutate({
            messageId,
            conversationId,
            mentions: tokens,
            areaParticipantIds: participantIds,
            onlineEmployeeIds: participantIds, // simplificação: trata todos como "potencialmente online"
          });
        }
      }

      setText("");
      setAttachments([]);
      // limpa rascunho persistido após envio com sucesso
      if (conversationId) draftsStore.delete(conversationId);
      requestAnimationFrame(() => textRef.current?.focus());
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao enviar");
    }
  };

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    if (!files || (files as FileList).length === 0) return;
    const arr = Array.from(files as FileList);
    setUploading(true);
    try {
      const uploaded: ChatAttachment[] = [];
      if (!tenantId) throw new Error("Tenant não encontrado");
      for (const f of arr) {
        const att = await uploadChatAttachment(f, tenantId);
        uploaded.push(att);
      }
      setAttachments((prev) => [...prev, ...uploaded]);
    } catch (err: any) {
      toast.error(err.message ?? "Erro no upload");
    } finally {
      setUploading(false);
    }
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const onTextChange = (v: string) => {
    setText(v);
    if (v.trim().length > 0) sendTyping();
    if (textRef.current) {
      textRef.current.style.height = "auto";
      textRef.current.style.height = `${Math.min(textRef.current.scrollHeight, 160)}px`;
    }
  };

  const onDragEnter = (e: DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(true);
  };
  const onDragLeave = (e: DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.currentTarget === e.target) setDragActive(false);
  };
  const onDragOver = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const onDrop = (e: DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer?.files) handleFiles(e.dataTransfer.files);
  };

  const canSend = (text.trim() || attachments.length > 0) && !send.isPending && !uploading;

  return (
    <div
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="relative px-3 pb-3 pt-1 md:px-5 md:pb-4"
    >
      <AnimatePresence>
        {dragActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 m-3 rounded-md border-2 border-dashed border-primary bg-primary-muted flex items-center justify-center pointer-events-none"
          >
            <div className="text-center">
              <Paperclip className="h-6 w-6 mx-auto mb-1 text-primary" />
              <p className="text-sm font-medium text-primary">Solte para anexar</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lista de agendadas pendentes desta conversa */}
      {scheduled.items.length > 0 && (
        <div className="mb-2 space-y-1">
          {scheduled.items.map((s) => {
            const when = new Date(s.scheduled_for);
            return (
              <div
                key={s.id}
                className="flex items-start gap-2 px-3 py-2 rounded-md bg-warning-light border border-warning/30"
              >
                <CalendarClock className="h-3.5 w-3.5 text-warning mt-0.5 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-2xs uppercase tracking-wider text-warning-foreground/80">
                    Agendada para {format(when, "dd MMM, HH:mm", { locale: ptBR })}
                  </p>
                  <p className="text-body-sm text-foreground/90 truncate">{s.content || `[${s.attachments[0]?.type ?? "anexo"}]`}</p>
                </div>
                <button
                  type="button"
                  onClick={() => cancelScheduled(s.id)}
                  className="h-9 w-9 md:h-5 md:w-5 rounded hover:bg-destructive/15 flex items-center justify-center cursor-pointer flex-shrink-0"
                  aria-label="Cancelar agendamento"
                >
                  <X className="h-4 w-4 md:h-3 md:w-3 text-muted-foreground hover:text-danger" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Card composer — DS1 elevation + ring on focus-within */}
      <div className="relative bg-card rounded-lg border border-border shadow-card transition-shadow duration-150 focus-within:shadow-elevation-2 focus-within:border-primary/30 overflow-visible">
        {/* Autocomplete de menções (@user, @here, @channel) — flutuante acima do textarea */}
        <MentionAutocomplete
          textareaRef={textRef}
          text={text}
          setText={setText}
          employees={employees as any}
          allowChannelTags={allowChannelTags}
        />

        {attachments.length > 0 && (
          <div className="px-3 pt-2 flex flex-wrap gap-2">
            {attachments.map((a, i) => (
              <div
                key={i}
                className="relative group flex items-center gap-2 bg-muted rounded-md pl-2 pr-9 md:pr-7 py-1.5 text-xs border border-border"
              >
                {a.type === "image" ? (
                  <img src={a.url} alt={a.name} className="h-6 w-6 object-cover rounded" />
                ) : (
                  <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                <span className="truncate max-w-[160px]">{a.name}</span>
                <button
                  onClick={() => setAttachments((p) => p.filter((_, idx) => idx !== i))}
                  aria-label="Remover anexo"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 md:h-5 md:w-5 rounded-full hover:bg-destructive/15 flex items-center justify-center cursor-pointer transition-colors duration-150"
                >
                  <X className="h-4 w-4 md:h-3 md:w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />

        <Textarea
          ref={textRef}
          value={text}
          onChange={(e) => onTextChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Mensagem…"
          rows={1}
          className={cn(
            "min-h-[48px] md:min-h-[44px] max-h-40 resize-none py-3 px-3.5",
            "bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0",
            "text-base md:text-body-md leading-relaxed"
          )}
        />

        {/* Toolbar inferior */}
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-t border-border">
          <Button
            size="icon"
            variant="ghost"
            className="h-10 w-10 md:h-7 md:w-7 cursor-pointer text-muted-foreground"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            aria-label="Anexar arquivo"
          >
            {uploading ? <Loader2 className="h-5 w-5 md:h-3.5 md:w-3.5 animate-spin" /> : <Paperclip className="h-5 w-5 md:h-3.5 md:w-3.5" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-10 w-10 md:h-7 md:w-7 cursor-pointer text-muted-foreground"
            onClick={() => fileRef.current?.click()}
            aria-label="Imagem"
          >
            <ImageIcon className="h-5 w-5 md:h-3.5 md:w-3.5" />
          </Button>
          <ChatEmojiPicker
            side="top"
            align="start"
            onSelect={handleEmojiSelect}
            trigger={
              <Button
                size="icon"
                variant="ghost"
                className="h-10 w-10 md:h-7 md:w-7 cursor-pointer text-muted-foreground"
                aria-label="Inserir emoji"
              >
                <Smile className="h-5 w-5 md:h-3.5 md:w-3.5" />
              </Button>
            }
          />
          <Button
            size="icon"
            variant="ghost"
            className={cn(
              "h-10 w-10 md:h-7 md:w-7 cursor-pointer transition-colors duration-150",
              recorder.recording ? "text-danger bg-danger/10 hover:bg-danger/15" : "text-muted-foreground"
            )}
            onClick={recorder.recording ? handleStopVoice : handleStartVoice}
            aria-label={recorder.recording ? "Parar gravação e enviar" : "Gravar áudio"}
          >
            <Mic className={cn("h-5 w-5 md:h-3.5 md:w-3.5", recorder.recording && "animate-pulse")} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-10 w-10 md:h-7 md:w-7 cursor-pointer text-muted-foreground transition-colors duration-150"
            onClick={() => {
              const def = new Date(Date.now() + 60 * 60 * 1000); // +1h
              setScheduleAt(format(def, "yyyy-MM-dd'T'HH:mm"));
              setScheduleOpen(true);
            }}
            aria-label="Agendar envio"
            title="Agendar envio"
          >
            <Clock className="h-5 w-5 md:h-3.5 md:w-3.5" />
          </Button>
          <div className="flex-1" />

          {/* Indicador de gravação */}
          {recorder.recording && (
            <div className="flex items-center gap-2 mr-2">
              <span className="h-1.5 w-1.5 rounded-full bg-danger animate-pulse" />
              <span className="font-mono text-2xs text-danger tabular-nums">
                {fmtElapsed(recorder.elapsed)}
              </span>
              <button
                type="button"
                onClick={handleCancelVoice}
                className="h-9 md:h-auto px-2 md:px-0 text-2xs text-muted-foreground hover:text-foreground hover:underline cursor-pointer"
              >
                cancelar
              </button>
            </div>
          )}

          {canSend && !recorder.recording && (
            <Button
              size="sm"
              onClick={handleSend}
              disabled={!canSend}
              className="h-10 md:h-7 gap-1.5 px-3.5 md:px-3 text-sm md:text-xs cursor-pointer"
              aria-label="Enviar mensagem"
            >
              {send.isPending ? <Loader2 className="h-4 w-4 md:h-3.5 md:w-3.5 animate-spin" /> : <><Send className="h-4 w-4 md:h-3 md:w-3" /> Enviar</>}
            </Button>
          )}
        </div>
      </div>

      {/* Dialog de agendamento */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              Agendar mensagem
            </DialogTitle>
            <DialogDescription>
              A mensagem será enviada automaticamente no horário escolhido (enquanto o chat estiver aberto).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-2xs text-muted-foreground/80">Data e hora</Label>
            <input
              type="datetime-local"
              value={scheduleAt}
              onChange={(e) => setScheduleAt(e.target.value)}
              min={format(new Date(), "yyyy-MM-dd'T'HH:mm")}
              className="w-full h-10 px-3 rounded-md border border-border bg-card text-body-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {text.trim() && (
              <div className="mt-3 p-2.5 rounded-md bg-muted border-l-2 border-primary">
                <p className="text-2xs font-mono uppercase tracking-wider text-muted-foreground mb-1">
                  Prévia
                </p>
                <p className="text-body-sm text-foreground/90 break-words">{text.trim()}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setScheduleOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSchedule} disabled={!scheduleAt || (!text.trim() && attachments.length === 0)}>
              <Clock className="h-3.5 w-3.5 mr-1.5" />
              Agendar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
