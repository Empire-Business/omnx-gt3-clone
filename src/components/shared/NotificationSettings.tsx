import { useState } from "react";
import { Bell, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { isChatSoundEnabled, setChatSoundEnabled } from "@/hooks/useChat";
import { supabase } from "@/integrations/supabase/client";

/**
 * Card de preferências de notificação no Perfil (acessível a TODOS os usuários).
 *
 * Regra do produto: todos começam com notificações + som + push ATIVOS — o usuário
 * só desativa depois se quiser.
 *
 * Layout responsivo por decisão de produto:
 *  - MOBILE  → toggle de notificações push (o que importa no celular).
 *  - DESKTOP → toggle do som da notificação (no PC o alerta relevante é o som).
 */
export function NotificationSettings() {
  const { supported, permission, isSubscribed, isBusy, enable } = usePushNotifications();
  const [soundOn, setSoundOn] = useState(() => isChatSoundEnabled());
  const [pushBusy, setPushBusy] = useState(false);

  const pushOn = permission === "granted" && isSubscribed;

  const disablePush = async () => {
    setPushBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe().catch(() => {});
        await supabase.from("push_subscriptions" as any).delete().eq("endpoint", endpoint);
      }
      toast.success("Notificações desativadas neste aparelho.");
    } catch {
      toast.error("Não foi possível desativar agora.");
    } finally {
      setPushBusy(false);
    }
  };

  const togglePush = async (on: boolean) => {
    if (on) {
      const ok = await enable();
      if (ok) toast.success("Notificações ativadas!");
    } else {
      await disablePush();
    }
  };

  const toggleSound = (on: boolean) => {
    setChatSoundEnabled(on);
    setSoundOn(on);
    toast.success(on ? "Som de notificação ativado." : "Som de notificação desativado.");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Bell className="w-4 h-4 text-primary" /> Notificações
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* MOBILE → notificações push */}
        <div className="md:hidden">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <Label className="text-sm font-medium">Notificações push</Label>
              <p className="text-xs text-muted-foreground">
                Receba avisos de mensagens, tarefas e feed mesmo com o app fechado.
              </p>
            </div>
            <Switch
              checked={pushOn}
              disabled={!supported || isBusy || pushBusy}
              onCheckedChange={togglePush}
              aria-label="Notificações push"
            />
          </div>
          {!supported && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              Este navegador não suporta push. Abra o app pelo Chrome (não por um navegador dentro de outro app).
            </p>
          )}
          {supported && permission === "denied" && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              Permissão bloqueada. Reative nas configurações do navegador/celular e tente de novo.
            </p>
          )}
        </div>

        {/* DESKTOP → som da notificação */}
        <div className="hidden md:block">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <Label className="flex items-center gap-1.5 text-sm font-medium">
                <Volume2 className="h-3.5 w-3.5" /> Som de notificação
              </Label>
              <p className="text-xs text-muted-foreground">
                Toca um som ao chegar mensagem em conversas que não estão abertas.
              </p>
            </div>
            <Switch checked={soundOn} onCheckedChange={toggleSound} aria-label="Som de notificação" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
