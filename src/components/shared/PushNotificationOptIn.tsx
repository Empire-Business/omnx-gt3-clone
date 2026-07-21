import { useEffect, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/usePushNotifications";

const DISMISS_KEY = "push-optin-dismissed";

/**
 * Banner de opt-in de notificações push (PWA).
 *
 * Monta o hook `usePushNotifications` em um único ponto (evita instâncias
 * duplicadas) — ele cuida da re-inscrição silenciosa de quem já concedeu
 * permissão. O banner só aparece quando a permissão ainda está "default",
 * e o opt-in roda a partir do clique (gesto exigido pelo Chrome no Android).
 */
export function PushNotificationOptIn() {
  const { supported, inApp, permission, isBusy, error, enable } = usePushNotifications();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const seenError = useRef<string | null>(null);

  // Feedback de erro (ex.: permissão negada) via toast.
  useEffect(() => {
    if (error && error !== seenError.current) {
      seenError.current = error;
      toast.error(error);
    }
  }, [error]);

  // Decide o modo do banner. `inApp` (webview de Instagram/Facebook/etc.) tem
  // prioridade: nesses navegadores embutidos o push nem existe (`supported=false`),
  // então em vez de esconder o banner, orientamos a abrir no Chrome — essa era a
  // causa de o Android nunca registrar notificações.
  const mode: "optin" | "webview" | "denied" | null = inApp
    ? "webview"
    : !supported
      ? null
      : permission === "default"
        ? "optin"
        : permission === "denied"
          ? "denied"
          : null;

  if (dismissed || mode === null) return null;

  const handleEnable = async () => {
    const ok = await enable();
    if (ok) toast.success("Notificações ativadas!");
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  const copy = {
    optin: {
      title: "Ativar notificações",
      body: "Receba avisos de mensagens, tarefas e feed mesmo com o app fechado.",
    },
    webview: {
      title: "Abra no Chrome para notificar",
      body: "Você está num navegador dentro de outro app. Toque no menu ⋮ e escolha \"Abrir no Chrome\" para ativar as notificações.",
    },
    denied: {
      title: "Notificações bloqueadas",
      body: "A permissão foi negada. Reative nas configurações do navegador/celular e toque em Tentar de novo.",
    },
  }[mode];

  return (
    <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-3 md:bottom-4">
      <div className="flex w-full max-w-md items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-lg">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Bell className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{copy.title}</p>
          <p className="text-xs text-muted-foreground">{copy.body}</p>
        </div>
        {mode === "optin" && (
          <Button size="sm" onClick={handleEnable} disabled={isBusy}>
            {isBusy ? "Ativando…" : "Ativar"}
          </Button>
        )}
        {mode === "denied" && (
          <Button size="sm" variant="outline" onClick={handleEnable} disabled={isBusy}>
            {isBusy ? "…" : "Tentar de novo"}
          </Button>
        )}
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dispensar"
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
