import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEmployees } from "@/hooks/useEmployees";

const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export type PushPermission = "default" | "granted" | "denied" | "unsupported";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

// Compara a applicationServerKey (VAPID pública) com que a inscrição foi criada
// contra a chave atual do app. Se divergir, a inscrição está "presa" com uma chave
// antiga e o servidor de push (FCM/Apple) rejeita os envios → precisa recriar.
function appServerKeyMatches(sub: PushSubscription, desired: Uint8Array): boolean {
  const existing = sub.options?.applicationServerKey;
  if (!existing) return true; // navegador não expõe → não dá pra comparar, assume ok
  const a = new Uint8Array(existing);
  if (a.length !== desired.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== desired[i]) return false;
  return true;
}

async function saveSubscription(
  sub: PushSubscription,
  employeeId: string,
  tenantId: string,
): Promise<void> {
  const json = sub.toJSON();
  if (!json.keys) return;
  await supabase.from("push_subscriptions" as any).upsert(
    {
      employee_id: employeeId,
      tenant_id: tenantId,
      endpoint: sub.endpoint,
      keys: json.keys,
      user_agent: navigator.userAgent.slice(0, 255),
    },
    { onConflict: "employee_id,endpoint" },
  );
}

const isSupported =
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window &&
  !!VAPID_KEY;

// Detecta navegadores EMBUTIDOS (webview dentro de apps como Instagram, Facebook,
// etc.). No Android, abrir o link por dentro desses apps roda num webview onde o
// Web Push simplesmente não existe — é a causa nº 1 de "no Android nunca registra a
// subscription" (o banco de prod tinha 0 subscriptions Android). Detectar permite
// orientar o usuário a abrir no Chrome.
const inAppBrowser =
  typeof navigator !== "undefined" &&
  /(FBAN|FBAV|Instagram|Line\/|Twitter|WhatsApp|MicroMessenger|WebView|; ?wv\)|GSA\/)/i.test(
    navigator.userAgent || "",
  );

const OPEN_IN_CHROME_MSG =
  "As notificações não funcionam neste navegador embutido. Abra o app pelo Chrome (menu ⋮ → \"Abrir no Chrome\") e tente de novo.";

/**
 * Web Push (PWA) opt-in.
 *
 * IMPORTANTE: `Notification.requestPermission()` NÃO é mais chamado automaticamente.
 * O Chrome no Android silencia/bloqueia pedidos de permissão que não venham de um
 * gesto do usuário — por isso nenhuma subscription de Android era criada. O opt-in
 * agora é explícito via `enable()`, que deve ser chamado a partir de um clique.
 *
 * Quem já concedeu a permissão é re-inscrito silenciosamente (sem prompt) no load,
 * garantindo que a subscription esteja sempre salva mesmo quando o endpoint rotaciona.
 */
export function usePushNotifications() {
  const { profile } = useAuth();
  const { data: employees } = useEmployees();

  const [permission, setPermission] = useState<PushPermission>(
    isSupported ? (Notification.permission as PushPermission) : "unsupported",
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const myEmployeeId =
    employees?.find((e) => e.user_id === profile?.user_id)?.id ?? null;

  // Faz a inscrição propriamente dita. Pressupõe permissão já concedida.
  // Lança erro descritivo em vez de falhar em silêncio — assim o clique em "Ativar"
  // no Android mostra o motivo real (webview, perfil carregando, subscribe rejeitado)
  // em vez de "não acontecer nada".
  const subscribeNow = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      throw new Error(inAppBrowser ? OPEN_IN_CHROME_MSG : "Este navegador não suporta notificações push.");
    }
    if (!myEmployeeId || !profile?.tenant_id) {
      throw new Error("Seu perfil ainda está carregando. Aguarde alguns segundos e tente de novo.");
    }
    const reg = await navigator.serviceWorker.ready;
    const desiredKey = urlBase64ToUint8Array(VAPID_KEY as string);
    let sub = await reg.pushManager.getSubscription();
    // Inscrição "presa" com chave VAPID antiga → recria (senão o push é rejeitado).
    if (sub && !appServerKeyMatches(sub, desiredKey)) {
      try { await sub.unsubscribe(); } catch { /* noop */ }
      sub = null;
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: desiredKey,
      });
    }
    await saveSubscription(sub, myEmployeeId, profile.tenant_id);
    setIsSubscribed(true);
    return true;
  }, [myEmployeeId, profile?.tenant_id]);

  // Re-inscrição silenciosa para quem já concedeu permissão (sem prompt).
  useEffect(() => {
    if (!isSupported) return;
    if (Notification.permission !== "granted") return;
    if (!myEmployeeId || !profile?.tenant_id) return;

    let cancelled = false;
    (async () => {
      try {
        await subscribeNow();
      } catch {
        if (!cancelled) setIsSubscribed(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [myEmployeeId, profile?.tenant_id, subscribeNow]);

  // Re-sincroniza a inscrição ao reabrir/focar o app. No Android (FCM) a inscrição
  // rotaciona com frequência; pegar a inscrição atual (getSubscription) e re-salvá-la
  // toda vez que o app volta ao foreground garante que o banco nunca fique com um
  // endpoint morto, que é a causa de "Android para de receber push".
  useEffect(() => {
    if (!isSupported) return;
    if (Notification.permission !== "granted") return;
    if (!myEmployeeId || !profile?.tenant_id) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") subscribeNow().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [myEmployeeId, profile?.tenant_id, subscribeNow]);

  // Opt-in explícito — DEVE ser chamado a partir de um gesto do usuário (clique).
  // Retorna `true` quando a inscrição foi concluída com sucesso.
  const enable = useCallback(async (): Promise<boolean> => {
    setError(null);
    if (!isSupported) {
      setError(inAppBrowser ? OPEN_IN_CHROME_MSG : "Este navegador não suporta notificações push.");
      return false;
    }
    setIsBusy(true);
    try {
      const perm = (await Notification.requestPermission()) as PushPermission;
      setPermission(perm);
      if (perm !== "granted") {
        setError(
          perm === "denied"
            ? "Permissão negada. Ative as notificações nas configurações do navegador/celular e tente de novo."
            : "Permissão não concedida.",
        );
        return false;
      }
      return await subscribeNow();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao ativar notificações.");
      return false;
    } finally {
      setIsBusy(false);
    }
  }, [subscribeNow]);

  return {
    supported: isSupported,
    inApp: inAppBrowser,
    permission,
    isSubscribed,
    isBusy,
    error,
    enable,
  };
}
