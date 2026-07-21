import { useEffect, useRef, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { CamiAvatar } from "@/components/shared/CamiAvatar";
import { ClaraConversation } from "@/components/cami/ClaraConversation";
import type { CamiContext } from "@/hooks/useCami";

interface CamiPanelProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Quando aberto a partir de uma mensagem, dispara o modo "sugerir resposta". */
  context?: CamiContext | null;
  /** Canal atual — a Clara lê as mensagens recentes dele como contexto. */
  channelId?: string | null;
}

export function CamiPanel({ open, onOpenChange, context, channelId }: CamiPanelProps) {
  const prevOpenRef = useRef(false);
  // Sinaliza para a conversa resetar quando a gaveta abre "do zero" (sem contexto).
  const [resetSignal, setResetSignal] = useState(false);

  useEffect(() => {
    const justOpened = open && !prevOpenRef.current;
    prevOpenRef.current = open;
    if (justOpened && !context) {
      setResetSignal(true);
      const t = setTimeout(() => setResetSignal(false), 0);
      return () => clearTimeout(t);
    }
  }, [open, context]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="p-0 flex flex-col w-full sm:max-w-md gap-0">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <CamiAvatar className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground leading-tight">Clara</p>
            <p className="text-2xs text-muted-foreground leading-tight">Sua assistente de IA</p>
          </div>
        </div>

        <div className="flex-1 min-h-0">
          <ClaraConversation
            variant="panel"
            channelId={channelId}
            context={context}
            resetSignal={resetSignal}
            onBeforeNavigate={() => onOpenChange(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
