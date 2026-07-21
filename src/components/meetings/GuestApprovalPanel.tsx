/**
 * GuestApprovalPanel — v8.7.3
 * Painel flutuante para o host aprovar/recusar convidados externos.
 * Subscribe realtime em meeting_guest_requests da sala atual.
 * Suporta busca por nome, ordenação e notificação sonora ao receber novo pedido.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UserPlus, Check, X, Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  useGuestApprovalQueue,
  useDecideGuestRequest,
} from "@/hooks/useLiveKit";
import { toast } from "sonner";

interface GuestApprovalPanelProps {
  roomName: string;
}

type SortMode = "oldest" | "newest" | "name";

export function GuestApprovalPanel({ roomName }: GuestApprovalPanelProps) {
  const queue = useGuestApprovalQueue(roomName);
  const decide = useDecideGuestRequest();

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("oldest");

  // Notificação sonora via Web Audio API (não depende de arquivo nem de política de autoplay,
  // pois o AudioContext já está desbloqueado pela interação do usuário ao entrar na call).
  const lastSoundAtRef = useRef<number>(0);
  // AudioContext persistente — criado uma vez, retomado quando necessário.
  // Cria-se na 1ª interação de teclado/clique para evitar bloqueio de autoplay.
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Garante que o AudioContext exista e esteja "running" (autoplay policy).
  useEffect(() => {
    const ensureCtx = () => {
      if (audioCtxRef.current) {
        if (audioCtxRef.current.state === "suspended") {
          void audioCtxRef.current.resume().catch(() => undefined);
        }
        return;
      }
      try {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        if (!AC) return;
        audioCtxRef.current = new AC();
      } catch {
        /* sem Web Audio API */
      }
    };
    ensureCtx();
    // re-tenta retomar em qualquer interação (caso a aba inicie em background)
    const handler = () => ensureCtx();
    window.addEventListener("pointerdown", handler);
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
    };
  }, []);

  const playNotification = () => {
    const now = Date.now();
    if (now - lastSoundAtRef.current < 1500) return;
    lastSoundAtRef.current = now;
    try {
      let ctx = audioCtxRef.current;
      if (!ctx) {
        const AC = window.AudioContext || (window as any).webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        audioCtxRef.current = ctx;
      }
      if (ctx.state === "suspended") {
        void ctx.resume().catch(() => undefined);
      }
      // Toque tipo "campainha" — 3 notas ascendentes (Sol → Si → Ré agudo)
      // mais perceptível que dois bipes simples.
      const playNote = (startTime: number, freq: number, dur = 0.22) => {
        const osc = ctx!.createOscillator();
        const gain = ctx!.createGain();
        osc.connect(gain);
        gain.connect(ctx!.destination);
        osc.type = "triangle"; // mais "doce" que sine puro, mais audível que square
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.exponentialRampToValueAtTime(0.6, startTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);
        osc.start(startTime);
        osc.stop(startTime + dur + 0.02);
      };
      const t = ctx.currentTime;
      playNote(t, 784);          // G5
      playNote(t + 0.18, 988);   // B5
      playNote(t + 0.36, 1175, 0.32); // D6 (mais longo)
    } catch {
      /* falha silenciosa */
    }
  };

  // Notificação do sistema (quando a aba não está visível)
  const showSystemNotification = (guestName: string) => {
    try {
      if (typeof Notification === "undefined") return;
      if (Notification.permission !== "granted") return;
      if (document.visibilityState === "visible") return;
      const n = new Notification("Pedido de entrada na reunião", {
        body: `${guestName} pediu para entrar`,
        tag: "meet-guest-request",
        silent: false,
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {
      /* navegadores sem suporte */
    }
  };

  // Pede permissão de notificação do sistema na montagem (sem forçar)
  useEffect(() => {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => undefined);
    }
  }, []);

  // Realtime: invalida queue quando há mudança
  useEffect(() => {
    if (!roomName) return;
    const channel = supabase
      .channel(`guest-requests-${roomName}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "meeting_guest_requests",
          filter: `livekit_room_name=eq.${roomName}`,
        },
        (payload) => {
          queue.invalidate();
          if (payload.eventType === "INSERT") {
            const name = (payload.new as any)?.guest_name || "Convidado";
            toast.info(`${name} pediu para entrar`, { duration: 6000 });
            playNotification();
            showSystemNotification(name);
          }
        },
      )
      .subscribe();
    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName]);

  const pending = queue.data || [];

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? pending.filter((p) => (p.guest_name || "").toLowerCase().includes(q))
      : pending.slice();

    if (sort === "name") {
      filtered.sort((a, b) =>
        (a.guest_name || "").localeCompare(b.guest_name || "", "pt-BR", {
          sensitivity: "base",
        }),
      );
    } else {
      filtered.sort((a, b) => {
        const ta = new Date(a.requested_at).getTime();
        const tb = new Date(b.requested_at).getTime();
        return sort === "oldest" ? ta - tb : tb - ta;
      });
    }
    return filtered;
  }, [pending, search, sort]);

  if (pending.length === 0) return null;

  const handleDecide = async (
    requestId: string,
    decision: "approved" | "rejected",
  ) => {
    try {
      await decide.mutateAsync({ request_id: requestId, decision });
      toast.success(decision === "approved" ? "Convidado admitido" : "Pedido recusado");
    } catch (err) {
      toast.error((err as Error).message || "Falha ao processar");
    }
  };

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  return (
    <div className="absolute bottom-24 right-4 z-50 w-80 max-w-[calc(100vw-2rem)]">
      <Card className="p-3 shadow-2xl border-primary/20 bg-card/95 backdrop-blur">
        <div className="flex items-center gap-2 mb-3">
          <UserPlus className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">
            Pedidos de entrada ({pending.length})
          </h3>
        </div>

        <div className="space-y-2 mb-3">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome…"
              className="h-8 pl-7 text-xs"
            />
          </div>
          <Select value={sort} onValueChange={(v) => setSort(v as SortMode)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="oldest">Mais antigos primeiro</SelectItem>
              <SelectItem value="newest">Mais recentes primeiro</SelectItem>
              <SelectItem value="name">Nome (A–Z)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 max-h-[40vh] overflow-y-auto">
          {visible.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              Nenhum pedido corresponde à busca.
            </p>
          ) : (
            visible.map((req) => (
              <div
                key={req.id}
                className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate font-medium" title={req.guest_name}>
                    {req.guest_name}
                  </p>
                  <p className="text-[10px] text-muted-foreground tabular-nums">
                    {formatTime(req.requested_at)}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 px-2"
                    onClick={() => handleDecide(req.id, "approved")}
                    disabled={decide.isPending}
                    title="Admitir"
                  >
                    {decide.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2"
                    onClick={() => handleDecide(req.id, "rejected")}
                    disabled={decide.isPending}
                    title="Recusar"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
